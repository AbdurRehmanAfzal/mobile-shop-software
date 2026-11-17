"""What a return, or undoing one, will do — worked out before it is posted (owner 2026-11-18,
ADR-102). The preview never guesses: it runs the very function that posts (`sale_return`,
`purchase_return`, `void_return`, `replace_return`) inside the request's transaction, reads what
that changed — the ledger lines, the phones, the galla, the khata — and then rolls everything back.
So the preview and the posting can never disagree, and nothing is written: no return, no ledger
entry, no event, no number used up.

Between the preview and the confirm something may change (the phone sold, a payment taken). The
preview therefore hands out a `token` — a fingerprint of what it looked at. The confirm sends it
back; if the fingerprint no longer matches, the posting is refused with `preview_stale` and the app
shows a fresh preview.

Cost, stock value, the profit effect and the journal lines are for those who may see cost."""

import hashlib
import uuid
from collections import defaultdict
from decimal import Decimal

from sqlalchemy import event
from sqlalchemy.orm import Session

from app.core.errors import Conflict, NotFound
from app.core.permissions import Cap
from app.db.base import ZERO
from app.modules.catalogue.models import Brand, Model
from app.modules.devices.models import Device
from app.modules.ledger import accounts as acc
from app.modules.ledger.models import CashAccount, LedgerEntry
from app.modules.ledger.service import money
from app.modules.parties.models import Party
from app.modules.purchases.models import Purchase
from app.modules.returns import service
from app.modules.returns.models import ReturnDoc, ReturnKind
from app.modules.sales.models import Invoice

# income (+) and cost (−) accounts: what a posting does to profit
_PROFIT = ("sales", "other_income", "repair_income", "discounts", "cogs", "purchases")


def _label(db: Session, d: Device) -> str:
    b, m = db.get(Brand, d.brand_id), db.get(Model, d.model_id)
    return f"{b.name if b else ''} {m.name if m else ''}".strip() or d.imei1


# ---- the fingerprint ------------------------------------------------------------------------------


def _token(parts: list) -> str:
    return hashlib.sha256(repr(parts).encode()).hexdigest()[:32]


def _device_state(db: Session, ids) -> list:
    out = []
    for i in sorted({str(x) for x in ids if x}):
        d = db.get(Device, uuid.UUID(i))
        if d is not None:
            out.append((i, d.status, max((e.seq for e in d.events), default=0)))
    return out


def sale_token(db: Session, shop_id: uuid.UUID, data) -> str:
    inv = db.get(Invoice, data.invoice_id)
    if inv is None or inv.shop_id != shop_id:
        raise NotFound(code="invoice_not_found")
    party = (
        db.get(Party, inv.party_id or data.party_id) if (inv.party_id or data.party_id) else None
    )
    lines = [(str(ln.id), str(ln.line_total), bool(ln.returned_at)) for ln in inv.lines]
    return _token(
        [
            "sale",
            str(inv.id),
            inv.status,
            str(inv.total),
            str(inv.paid),
            str(inv.returned_total),
            lines,
            _device_state(db, [ln.device_id for ln in inv.lines]),
            str(party.balance) if party else None,
            sorted(str(x) for x in data.line_ids),
            str(data.refund_amount),
            str(data.kept_amount),
            data.settlement,
            str(data.cash_account_id),
            data.item_condition,
        ]
    )


def purchase_token(db: Session, shop_id: uuid.UUID, data) -> str:
    pur = db.get(Purchase, data.purchase_id)
    if pur is None or pur.shop_id != shop_id:
        raise NotFound(code="purchase_not_found")
    party = db.get(Party, pur.party_id)
    lines = [(str(ln.id), str(ln.net_cost), bool(ln.returned_at)) for ln in pur.lines]
    return _token(
        [
            "purchase",
            str(pur.id),
            pur.status,
            str(pur.total),
            str(pur.paid),
            str(pur.returned_total),
            lines,
            _device_state(db, [ln.device_id for ln in pur.lines]),
            str(party.balance) if party else None,
            sorted(str(x) for x in data.line_ids),
            str(data.refund_amount),
            str(data.cut_amount),
            str(data.cash_account_id),
        ]
    )


def undo_token(db: Session, shop_id: uuid.UUID, return_id: uuid.UUID) -> str:
    r = service.get_return(db, shop_id, return_id)
    party = db.get(Party, r.party_id)
    return _token(
        [
            "undo",
            str(r.id),
            r.status,
            str(r.amount),
            str(r.refund_amount),
            str(r.kept_amount),
            _device_state(db, [ln.get("device_id") for ln in r.lines]),
            str(party.balance) if party else None,
        ]
    )


def check_token(sent: str | None, now: str) -> None:
    """a confirm that carries a token must still be looking at what the preview looked at"""
    if sent and sent != now:
        raise Conflict(
            code="preview_stale",
            message_en="Something changed since you looked. Check the summary again.",
            message_ur="آپ کے دیکھنے کے بعد کچھ بدل گیا ہے۔ خلاصہ دوبارہ دیکھ لیں۔",
        )


# ---- the dry run ----------------------------------------------------------------------------------


def _watch(db: Session, shop_id: uuid.UUID, party_ids, device_ids) -> dict:
    devices = {}
    for i in {x for x in device_ids if x}:
        d = db.get(Device, i)
        if d is not None:
            devices[d.id] = {
                "device_id": d.id,
                "label": _label(db, d),
                "imei": d.imei1,
                "cost": money(d.cost_price or ZERO),
                "before": d.status,
            }
    parties = {}
    for i in {x for x in party_ids if x}:
        p = db.get(Party, i)
        if p is not None:
            parties[p.id] = {"party_id": p.id, "name": p.name, "before": money(p.balance)}
    return {"devices": devices, "parties": parties}


def _dry(db: Session, run, watch: dict, show_cost: bool) -> dict:
    """run the real posting without committing, read its effect, roll it all back"""
    seen: list[LedgerEntry] = []

    def grab(session, _ctx, _instances):
        seen.extend(o for o in session.new if isinstance(o, LedgerEntry))

    event.listen(db, "before_flush", grab)
    try:
        doc = run()
        db.flush()
        lines = []
        cash: dict[uuid.UUID, Decimal] = defaultdict(lambda: ZERO)
        stock_value = profit = sales = cogs = income = ZERO
        for e in seen:
            net = money(e.debit - e.credit)
            lines.append({"account": e.account, "debit": money(e.debit), "credit": money(e.credit)})
            if acc.is_cash(e.account):
                cash[acc.id_of(e.account)] += net
            elif e.account == acc.SysAccount.INVENTORY:
                stock_value += net
            if e.account in _PROFIT or e.account.startswith("expense:"):
                profit += money(e.credit - e.debit)
            if e.account == acc.SysAccount.SALES:
                sales += net
            elif e.account == acc.SysAccount.COGS:
                cogs += money(e.credit - e.debit)
            elif e.account == acc.SysAccount.OTHER_INCOME:
                income += money(e.credit - e.debit)
        cash_rows = []
        for cid, change in cash.items():
            if change == ZERO:
                continue
            a = db.get(CashAccount, cid)
            cash_rows.append({"account": a.name if a else "", "change": money(change)})
        devices = []
        for d in watch["devices"].values():
            now = db.get(Device, d["device_id"])
            row = {**d, "after": now.status if now else d["before"]}
            if not show_cost:
                row.pop("cost")
            devices.append(row)
        parties = []
        for p in watch["parties"].values():
            now = db.get(Party, p["party_id"])
            parties.append({**p, "after": money(now.balance) if now else p["before"]})
        out = {
            "no_would_be": getattr(doc, "no", None),
            "amount": money(doc.amount),
            "refund": money(doc.refund_amount),
            "kept": money(doc.kept_amount),
            "devices": devices,
            # + the phone is in the shop again, − it left
            "stock_count": sum(_in_shop(d["after"]) - _in_shop(d["before"]) for d in devices),
            "cash": cash_rows,
            "cash_total": money(sum((c["change"] for c in cash_rows), ZERO)),
            "khata": parties,
            "balanced": money(sum((ln["debit"] - ln["credit"] for ln in lines), ZERO)) == ZERO,
        }
        if show_cost:
            out.update(
                {
                    "stock_value": money(stock_value),
                    "sales_change": money(-sales),
                    "cogs_reversed": money(cogs),
                    "retained_income": money(income),
                    "profit": money(profit),
                    "journal": lines,
                }
            )
        return out
    finally:
        event.remove(db, "before_flush", grab)
        db.rollback()


def _in_shop(status: str) -> int:
    return 1 if status in ("in_stock", "faulty") else 0


# ---- the four previews ----------------------------------------------------------------------------


def sale(db: Session, shop_id: uuid.UUID, ctx, data) -> dict:
    token = sale_token(db, shop_id, data)
    inv = db.get(Invoice, data.invoice_id)
    party_id = inv.party_id or data.party_id
    picked = [ln for ln in inv.lines if ln.id in set(data.line_ids)]
    show_cost = ctx.can(Cap.VIEW_COST)
    original = {
        "bill_no": inv.no,
        "bill_date": inv.date,
        "party_name": (
            db.get(Party, party_id).name if party_id and db.get(Party, party_id) else None
        ),
        "items": [
            {
                "label": (
                    _label(db, db.get(Device, ln.device_id)) if ln.device_id else ln.description
                ),
                "imei": db.get(Device, ln.device_id).imei1 if ln.device_id else None,
                "sold_for": money(ln.line_total),
                **({"cost": money(ln.cost)} if show_cost else {}),
            }
            for ln in picked
        ],
    }
    watch = _watch(db, shop_id, [party_id], [ln.device_id for ln in picked])
    out = _dry(
        db, lambda: service.sale_return(db, shop_id, ctx.id, data, commit=False), watch, show_cost
    )
    return {"kind": "sale", "token": token, "original": original, **out}


def purchase(db: Session, shop_id: uuid.UUID, ctx, data) -> dict:
    token = purchase_token(db, shop_id, data)
    pur = db.get(Purchase, data.purchase_id)
    picked = [ln for ln in pur.lines if ln.id in set(data.line_ids)]
    party = db.get(Party, pur.party_id)
    # a phone that is not in the shop cannot go back to its seller: say where it is instead
    from app.modules.delcheck.service import _where_now

    blockers = []
    for ln in picked:
        if ln.device_id:
            b = _where_now(db, shop_id, db.get(Device, ln.device_id))
            if b and b["code"] != "reserved":
                blockers.append(b)
    if blockers:
        return {"kind": "purchase", "ok": False, "blockers": blockers}
    show_cost = ctx.can(Cap.VIEW_COST)
    original = {
        "bill_no": pur.no,
        "bill_date": pur.date,
        "party_name": party.name if party else None,
        "items": [
            {
                "label": (
                    _label(db, db.get(Device, ln.device_id)) if ln.device_id else ln.description
                ),
                "imei": db.get(Device, ln.device_id).imei1 if ln.device_id else None,
                "cost": money(ln.net_cost),
            }
            for ln in picked
        ],
    }
    watch = _watch(db, shop_id, [pur.party_id], [ln.device_id for ln in picked])
    out = _dry(
        db,
        lambda: service.purchase_return(db, shop_id, ctx.id, data, commit=False),
        watch,
        show_cost,
    )
    return {"kind": "purchase", "ok": True, "token": token, "original": original, **out}


def _return_original(db: Session, r: ReturnDoc) -> dict:
    party = db.get(Party, r.party_id)
    return {
        "no": r.no,
        "kind": r.kind,
        "status": r.status,
        "date": r.date,
        "bill_no": r.document_no,
        "party_name": party.name if party else None,
        "amount": money(r.amount),
        "refund": money(r.refund_amount),
        "kept": money(r.kept_amount),
    }


def undo(db: Session, shop_id: uuid.UUID, ctx, return_id: uuid.UUID) -> dict:
    token = undo_token(db, shop_id, return_id)
    r = service.get_return(db, shop_id, return_id)
    original = _return_original(db, r)
    kind = "sale" if r.kind == ReturnKind.SALE else "purchase"
    watch = _watch(
        db,
        shop_id,
        [r.party_id],
        [uuid.UUID(x["device_id"]) for x in r.lines if x.get("device_id")],
    )
    out = _dry(
        db,
        lambda: service.void_return(db, shop_id, ctx, return_id, "preview", commit=False),
        watch,
        ctx.can(Cap.VIEW_COST),
    )
    return {"kind": kind, "undo": True, "token": token, "original": original, **out}


def replace(db: Session, shop_id: uuid.UUID, ctx, return_id: uuid.UUID, data) -> dict:
    """undo the wrong one and enter the right one: the two effects together"""
    token = undo_token(db, shop_id, return_id)
    old = service.get_return(db, shop_id, return_id)
    original = _return_original(db, old)
    devices = [uuid.UUID(x["device_id"]) for x in old.lines if x.get("device_id")]
    parties = [old.party_id]
    if data.sale is not None:
        inv = db.get(Invoice, data.sale.invoice_id)
        if inv is not None and inv.shop_id == shop_id:
            parties.append(inv.party_id or data.sale.party_id)
            devices += [ln.device_id for ln in inv.lines if ln.id in set(data.sale.line_ids)]
    elif data.purchase is not None:
        pur = db.get(Purchase, data.purchase.purchase_id)
        if pur is not None and pur.shop_id == shop_id:
            parties.append(pur.party_id)
            devices += [ln.device_id for ln in pur.lines if ln.id in set(data.purchase.line_ids)]
    watch = _watch(db, shop_id, parties, devices)

    def run():
        service.void_return(db, shop_id, ctx, return_id, data.reason, commit=False)
        if data.sale is not None:
            return service.sale_return(
                db,
                shop_id,
                ctx.id,
                data.sale.model_copy(update={"replaces_id": old.id}),
                commit=False,
            )
        return service.purchase_return(
            db,
            shop_id,
            ctx.id,
            data.purchase.model_copy(update={"replaces_id": old.id}),
            commit=False,
        )

    out = _dry(db, run, watch, ctx.can(Cap.VIEW_COST))
    kind = "sale" if data.sale is not None else "purchase"
    return {"kind": kind, "replaces": True, "token": token, "original": original, **out}
