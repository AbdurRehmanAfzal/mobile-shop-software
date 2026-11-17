"""The returns report (owner 2026-11-17, ADR-097): every phone that came back from a customer, and
every one sent back to a supplier, with all that the shopkeeper asked about — when, who brought it,
who took it back at the counter, the bill it was on, how many days after, how much it was sold for,
how much was handed back, the shop's cut, what stayed in the khata, what the return did to profit,
where the phone is now, whether it was sold again, and whether the customer took another phone.

Read-only and derived: the return documents, their bill lines, the phones and their events. Nothing
is stored. Cost and profit are for those who may see cost."""

import datetime as dt
import uuid
from collections import defaultdict
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.base import ZERO
from app.modules.auth.models import User
from app.modules.catalogue.models import Brand, Model
from app.modules.devices.models import Device, DeviceEvent
from app.modules.devices.state import EventType
from app.modules.ledger.models import CashAccount
from app.modules.ledger.service import money
from app.modules.parties.models import Party
from app.modules.purchases.models import Purchase, PurchaseLine
from app.modules.returns.models import ReturnDoc, ReturnKind
from app.modules.sales.models import Invoice, InvoiceLine, InvoiceStatus

VOIDED = "voided"
# a new bill to the same customer this many days after the return counts as "took another phone"
ANOTHER_WITHIN_DAYS = 3


def _uuid(v) -> uuid.UUID | None:
    try:
        return uuid.UUID(str(v)) if v else None
    except ValueError:
        return None


def _by_id(db: Session, model, ids) -> dict:
    ids = {i for i in ids if i}
    if not ids:
        return {}
    return {r.id: r for r in db.scalars(select(model).where(model.id.in_(ids))).all()}


def _labels(db: Session, devices: dict) -> dict[uuid.UUID, str]:
    brands = _by_id(db, Brand, {d.brand_id for d in devices.values()})
    models = _by_id(db, Model, {d.model_id for d in devices.values()})
    out = {}
    for d in devices.values():
        b, m = brands.get(d.brand_id), models.get(d.model_id)
        out[d.id] = f"{b.name if b else ''} {m.name if m else ''}".strip()
    return out


def _resold(db: Session, shop_id: uuid.UUID, device_ids: set) -> dict[uuid.UUID, list]:
    """every "sold" event of these phones, oldest first (to find the sale after a return)"""
    out: dict[uuid.UUID, list] = defaultdict(list)
    if not device_ids:
        return out
    rows = db.scalars(
        select(DeviceEvent)
        .where(
            DeviceEvent.shop_id == shop_id,
            DeviceEvent.device_id.in_(device_ids),
            DeviceEvent.type == EventType.SOLD,
        )
        .order_by(DeviceEvent.at)
    ).all()
    for e in rows:
        out[e.device_id].append(e)
    return out


def _empty_totals() -> dict:
    return {
        "count": 0,
        "phones": 0,
        "items": 0,
        "amount": ZERO,
        "refund": ZERO,
        "kept": ZERO,
        "to_khata": ZERO,
        "in_warranty": 0,
        "took_another": 0,
        "sold_again": 0,
        "voided": 0,
    }


def report(
    db: Session, shop_id: uuid.UUID, d_from: dt.date, d_to: dt.date, show_cost: bool
) -> dict:
    docs = list(
        db.scalars(
            select(ReturnDoc)
            .where(ReturnDoc.shop_id == shop_id, ReturnDoc.date >= d_from, ReturnDoc.date <= d_to)
            .order_by(ReturnDoc.date.desc(), ReturnDoc.created_at.desc())
        ).all()
    )
    live = [r for r in docs if r.status != VOIDED]
    sale_docs = [r for r in live if r.kind == ReturnKind.SALE]
    pur_docs = [r for r in live if r.kind == ReturnKind.PURCHASE]

    inv_lines = _by_id(
        db, InvoiceLine, {_uuid(x.get("invoice_line_id")) for r in sale_docs for x in r.lines}
    )
    pur_lines = _by_id(
        db, PurchaseLine, {_uuid(x.get("purchase_line_id")) for r in pur_docs for x in r.lines}
    )
    invoices = _by_id(db, Invoice, {r.document_id for r in sale_docs})
    purchases = _by_id(db, Purchase, {r.document_id for r in pur_docs})
    devices = _by_id(db, Device, {_uuid(x.get("device_id")) for r in live for x in r.lines})
    labels = _labels(db, devices)
    parties = _by_id(db, Party, {r.party_id for r in live})
    users = _by_id(db, User, {r.created_by for r in live})
    accounts = _by_id(db, CashAccount, {r.cash_account_id for r in live})
    sold_events = _resold(db, shop_id, {d for d in devices})
    old_ids = {r.replaces_id for r in live if r.replaces_id}
    replaced = {x.id: x.no for x in _by_id(db, ReturnDoc, old_ids).values()}

    # the customer's next bills, to see whether he took another phone
    next_bills: dict[uuid.UUID, list[Invoice]] = defaultdict(list)
    if sale_docs:
        rows = db.scalars(
            select(Invoice)
            .where(
                Invoice.shop_id == shop_id,
                Invoice.party_id.in_({r.party_id for r in sale_docs}),
                Invoice.date >= d_from,
                Invoice.date <= d_to + dt.timedelta(days=ANOTHER_WITHIN_DAYS),
                Invoice.status != InvoiceStatus.VOID,
            )
            .order_by(Invoice.created_at)
        ).all()
        for i in rows:
            next_bills[i.party_id].append(i)

    def base(r: ReturnDoc, bill_date: dt.date | None) -> dict:
        p, u, a = parties.get(r.party_id), users.get(r.created_by), accounts.get(r.cash_account_id)
        return {
            "id": r.id,
            "no": r.no,
            "kind": r.kind,
            "date": r.date,
            "created_at": r.created_at,
            "bill_id": r.document_id,
            "bill_no": r.document_no,
            "bill_date": bill_date,
            "days_after": (r.date - bill_date).days if bill_date else None,
            "party_id": r.party_id,
            "party_name": p.name if p else None,
            "party_phone": p.phone if p else None,
            "by": u.name if u else None,
            "by_id": r.created_by,
            "amount": money(r.amount),
            "refund": money(r.refund_amount),
            "refund_account": a.name if a else None,
            "kept": money(r.kept_amount),
            "reason_code": r.reason_code,
            "reason": r.reason,
            # ADR-101
            "item_condition": r.item_condition,
            "replaces_id": r.replaces_id,
            "replaces_no": replaced.get(r.replaces_id),
        }

    def item(x: dict) -> dict:
        d = devices.get(_uuid(x.get("device_id")))
        return {
            "device_id": d.id if d else None,
            "label": (labels.get(d.id) if d else None) or x.get("description") or "",
            "imei": d.imei1 if d else None,
            "status_now": d.status if d else None,
        }

    sale_rows, sale_tot = [], _empty_totals()
    undone_total = ZERO
    for r in sale_docs:
        inv = invoices.get(r.document_id)
        row = base(r, inv.date if inv else None)
        items, undone, in_warranty, again = [], ZERO, False, 0
        for x in r.lines:
            ln = inv_lines.get(_uuid(x.get("invoice_line_id")))
            it = item(x)
            price = money(ln.line_total if ln else Decimal(str(x.get("line_total") or 0)))
            it["price"] = price
            if ln is not None:
                if ln.warranty_until and ln.warranty_until >= r.date:
                    in_warranty = True
                if show_cost:
                    it["cost"] = money(ln.cost)
                    # the profit this line had made, which the return took back
                    it["profit_undone"] = money(ln.line_total - ln.tax_share - ln.cost)
                    undone += it["profit_undone"]
            # sold again after it came back?
            later = [
                e
                for e in sold_events.get(it["device_id"], [])
                if e.at > r.created_at and e.document_id != r.document_id
            ]
            if later:
                e = later[0]
                again += 1
                it["sold_again"] = {
                    "invoice_id": e.document_id,
                    "date": e.at.date(),
                    "price": money(e.amount or 0),
                }
                if show_cost and ln is not None:
                    it["sold_again"]["profit"] = money((e.amount or ZERO) - ln.cost)
            items.append(it)
        # the customer's first bill after this return, within a few days
        another = next(
            (
                i
                for i in next_bills.get(r.party_id, [])
                if i.id != r.document_id
                and i.created_at >= r.created_at
                and i.date <= r.date + dt.timedelta(days=ANOTHER_WITHIN_DAYS)
            ),
            None,
        )
        row.update(
            {
                "items": items,
                # what was neither handed back nor cut: it went against his udhaar / stays as credit
                "to_khata": money(r.amount - r.refund_amount - r.kept_amount),
                "in_warranty": in_warranty,
                "another_bill": (
                    {
                        "id": another.id,
                        "no": another.no,
                        "date": another.date,
                        "total": another.total,
                    }
                    if another
                    else None
                ),
            }
        )
        if show_cost:
            # the sale's profit is gone; the cut is what the shop made on it instead
            row["profit_undone"] = money(undone)
            row["net"] = money(r.kept_amount - undone)
            undone_total += undone
        sale_rows.append(row)
        t = sale_tot
        t["count"] += 1
        t["phones"] += sum(1 for it in items if it["device_id"])
        t["items"] += sum(1 for it in items if not it["device_id"])
        t["amount"] += row["amount"]
        t["refund"] += row["refund"]
        t["kept"] += row["kept"]
        t["to_khata"] += row["to_khata"]
        t["in_warranty"] += 1 if in_warranty else 0
        t["took_another"] += 1 if another else 0
        t["sold_again"] += again
    sale_tot["voided"] = sum(1 for r in docs if r.status == VOIDED and r.kind == ReturnKind.SALE)
    if show_cost:
        sale_tot["profit_undone"] = money(undone_total)
        sale_tot["net"] = money(sale_tot["kept"] - undone_total)

    pur_rows, pur_tot = [], _empty_totals()
    for r in pur_docs:
        pur = purchases.get(r.document_id)
        row = base(r, pur.date if pur else None)
        items = []
        for x in r.lines:
            ln = pur_lines.get(_uuid(x.get("purchase_line_id")))
            it = item(x)
            it["price"] = money(ln.net_cost if ln else Decimal(str(x.get("net_cost") or 0)))
            items.append(it)
        row.update(
            {
                "items": items,
                # the supplier still owes this back (or it came off what the shop owed him)
                "to_khata": money(r.amount - r.refund_amount - r.kept_amount),
                "in_warranty": False,
                "another_bill": None,
            }
        )
        if show_cost:
            row["profit_undone"] = ZERO
            row["net"] = money(-r.kept_amount)  # the supplier's cut is the shop's loss
        pur_rows.append(row)
        t = pur_tot
        t["count"] += 1
        t["phones"] += sum(1 for it in items if it["device_id"])
        t["items"] += sum(1 for it in items if not it["device_id"])
        t["amount"] += row["amount"]
        t["refund"] += row["refund"]
        t["kept"] += row["kept"]
        t["to_khata"] += row["to_khata"]
    pur_tot["voided"] = sum(1 for r in docs if r.status == VOIDED and r.kind == ReturnKind.PURCHASE)
    if show_cost:
        pur_tot["profit_undone"] = ZERO
        pur_tot["net"] = money(-pur_tot["kept"])

    # phones sold in the same days, for "how many of what I sold came back"
    sold = (
        db.scalar(
            select(func.count(InvoiceLine.id))
            .join(Invoice, Invoice.id == InvoiceLine.invoice_id)
            .where(
                Invoice.shop_id == shop_id,
                Invoice.date >= d_from,
                Invoice.date <= d_to,
                Invoice.status != InvoiceStatus.VOID,
                InvoiceLine.device_id.is_not(None),
            )
        )
        or 0
    )

    def grouped(rows: list[dict], key: str, name=None) -> list[dict]:
        acc: dict = {}
        for r in rows:
            k = r[key]
            a = acc.setdefault(k, {"key": k, "count": 0, "amount": ZERO})
            if name:
                a["name"] = r[name]
            a["count"] += 1
            a["amount"] += r["amount"]
        return sorted(acc.values(), key=lambda a: (-a["count"], -a["amount"]))

    return {
        "date_from": d_from,
        "date_to": d_to,
        "show_cost": show_cost,
        "sale": {
            "totals": {
                **sale_tot,
                "phones_sold": sold,
                # of every 100 phones sold in these days, how many came back in these days
                "rate_pct": round(sale_tot["phones"] * 100 / sold, 1) if sold else None,
            },
            "by_reason": grouped(sale_rows, "reason_code"),
            "by_user": grouped(sale_rows, "by_id", "by"),
            "rows": sale_rows,
        },
        "purchase": {
            "totals": pur_tot,
            "by_reason": grouped(pur_rows, "reason_code"),
            "by_user": grouped(pur_rows, "by_id", "by"),
            "rows": pur_rows,
        },
    }


def counts(db: Session, shop_id: uuid.UUID, today: dt.date) -> dict:
    """for the home screen: phones customers brought back today and this month"""
    rows = db.execute(
        select(ReturnDoc.date, ReturnDoc.lines).where(
            ReturnDoc.shop_id == shop_id,
            ReturnDoc.kind == ReturnKind.SALE,
            ReturnDoc.status != VOIDED,
            ReturnDoc.date >= today.replace(day=1),
            ReturnDoc.date <= today,
        )
    ).all()

    def phones(lines) -> int:
        return sum(1 for x in (lines or []) if x.get("device_id"))

    return {
        "returns_today": sum(phones(ln) for d, ln in rows if d == today),
        "returns_month": sum(phones(ln) for _d, ln in rows),
    }
