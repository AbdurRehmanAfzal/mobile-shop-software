"""The bills screen (mock-up 24, F10) and the sales screen (mock-up 25) of the new product, read from
the server (owner 2026-11-25).

Read-only and derived:
- `bills` is the live every-bill list (`invoices.service.list_documents`: sales, purchases, returns,
  repairs, with what each user may see) with, per bill, the kinds of stock on it, its lines with their
  IMEI / serial / SKU, how it was paid (the money account of the bill; nothing paid = udhaar), what was
  corrected on it (the correction groups the shop already keeps: customer / dealer changed, what was
  paid or a price corrected, a bill replaced by its edit — ADR-090, never an edit in place), the
  profit of a sale (its kept lines less their cost, as `/shop-audit/sales` reads it; VIEW_COST), and
  the money in / out a bill stands for in the bills ledger. The figures (sales, purchases, still to
  get, still to pay, profit) and the per-person groups are added up here over the filtered bills.
- `sales` is every kept (not returned) line of the sale bills that are not deleted: per kind, brand,
  model, person and bill, with units, the sale, the cost, the profit or loss of each line, and what
  was received and is still udhaar. A bill's udhaar (total − returned − paid) is shared over its kept
  lines by their money (the last line takes the rounding), so the lines of a bill add up to the bill.
  Cost, profit, loss and where a phone was bought from only with VIEW_COST."""

import datetime as dt
import uuid
from collections import defaultdict
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.permissions import Cap
from app.db.base import ZERO
from app.modules.accessories.models import Accessory
from app.modules.catalogue.models import Brand, Model
from app.modules.catalogue.service import name_key
from app.modules.devices.models import Device
from app.modules.invoices.service import list_documents
from app.modules.ledger.models import CashAccount, LedgerGroup
from app.modules.ledger.service import money
from app.modules.parties.models import Party
from app.modules.paymode.models import PaymentDetail
from app.modules.purchases.models import Purchase, PurchaseStatus
from app.modules.repairs.models import RepairJob
from app.modules.returns.models import ReturnDoc
from app.modules.sales.models import Invoice, InvoiceStatus
from app.modules.stockhub.service import _bought

TYPES = ("sale", "purchase", "return", "repair")
STATES = ("due", "paid", "in_repair", "returned", "void")
KINDS = ("phone", "tablet", "watch", "laptop", "items")
MODES = ("cash", "bank", "online", "cheque", "remittance", "udhaar")
DEALS = ("udhaar", "paid", "loss")
# the corrections the shop keeps as their own dated groups (ADR-056 / 065 / 067 / 090)
CHANGES = (
    "sale_party_change",
    "purchase_party_change",
    "purchase_paid_change",
    "purchase_cost_change",
)
ACCOUNT_MODE = {
    "cash": "cash",
    "bank": "bank",
    "easypaisa": "online",
    "jazzcash": "online",
    "cheque": "cheque",
    "remittance": "remittance",
}
MANY = 5000  # a period's bills are read whole, so the figures cover all of them


def _role(p: Party | None) -> str:
    kinds = set(p.kinds or []) if p else set()
    return "dealer" if kinds & {"supplier", "shop"} else "customer"


def _modes(db: Session, shop_id: uuid.UUID, docs: list, doc_type: str) -> dict:
    """how each bill was paid: its money account's kind, else its payment details; nothing = udhaar"""
    kinds = {
        a.id: a.kind
        for a in db.scalars(select(CashAccount).where(CashAccount.shop_id == shop_id)).all()
    }
    ids = [d.id for d in docs]
    detail: dict = {}
    for i in range(0, len(ids), 500):
        for pd in db.scalars(
            select(PaymentDetail).where(
                PaymentDetail.shop_id == shop_id,
                PaymentDetail.document_type == doc_type,
                PaymentDetail.document_id.in_(ids[i : i + 500]),
            )
        ).all():
            detail.setdefault(pd.document_id, pd.method)
    out = {}
    for d in docs:
        if d.paid <= ZERO:
            out[d.id] = "udhaar"
        elif d.cash_account_id and d.cash_account_id in kinds:
            out[d.id] = ACCOUNT_MODE.get(kinds[d.cash_account_id], "cash")
        else:
            out[d.id] = detail.get(d.id, "cash")
    return out


def _changes(db: Session, shop_id: uuid.UUID, ids: list[uuid.UUID]) -> dict:
    """the correction groups posted for these bills, oldest first"""
    from app.db.refs import user_name

    out: dict = defaultdict(list)
    for i in range(0, len(ids), 500):
        for g in db.scalars(
            select(LedgerGroup)
            .where(
                LedgerGroup.shop_id == shop_id,
                LedgerGroup.document_type.in_(CHANGES),
                LedgerGroup.document_id.in_(ids[i : i + 500]),
            )
            .order_by(LedgerGroup.at)
        ).all():
            out[g.document_id].append(
                {
                    "type": g.document_type,
                    "memo": g.memo,
                    "by": user_name(db, g.posted_by),
                    "at": g.at,
                }
            )
    return out


def _replaced(db: Session, shop_id: uuid.UUID) -> dict:
    """bills deleted by their edit (ADR-090): new bill no → the old bill's no, total and reason"""
    out = {}
    for model, void in ((Invoice, InvoiceStatus.VOID), (Purchase, PurchaseStatus.VOIDED)):
        for old in db.scalars(
            select(model).where(
                model.shop_id == shop_id,
                model.status == void,
                model.void_reason.like("Edited, replaced by %"),
            )
        ).all():
            rest = old.void_reason[len("Edited, replaced by ") :]
            new_no, _, why = rest.partition(":")
            out[(model.__tablename__, new_no.strip())] = {
                "type": "replaced",
                "memo": why.strip() or None,
                "from_no": old.no,
                "from_total": old.total,
                "by": None,
                "at": old.updated_at,
            }
    return out


def _device_line(d: Device | None, brands: dict, models: dict) -> dict:
    if d is None:
        return {"kind": "phone", "label": None, "code": None}
    b, m = brands.get(d.brand_id), models.get(d.model_id)
    return {
        "kind": d.category or "phone",
        "label": f"{b.name if b else ''} {m.name if m else ''}".strip(),
        "code": d.serial if (d.category == "laptop" and d.serial) else d.imei1,
        "device_id": d.id,
    }


class _Cat:
    """brands, models, devices and items, read once"""

    def __init__(self, db: Session, shop_id: uuid.UUID):
        self.db = db
        self.brands = {b.id: b for b in db.scalars(select(Brand)).all()}
        self.models = {m.id: m for m in db.scalars(select(Model)).all()}
        self.devices: dict = {}
        self.items: dict = {}
        self.shop_id = shop_id

    def device(self, did) -> Device | None:
        if did is None:
            return None
        did = uuid.UUID(str(did))
        if did not in self.devices:
            self.devices[did] = self.db.get(Device, did)
        return self.devices[did]

    def item(self, aid) -> Accessory | None:
        if aid is None:
            return None
        if aid not in self.items:
            self.items[aid] = self.db.get(Accessory, aid)
        return self.items[aid]

    def line(self, device_id, accessory_id, description, qty) -> dict:
        if device_id:
            out = _device_line(self.device(device_id), self.brands, self.models)
        else:
            it = self.item(accessory_id)
            out = {
                "kind": "items",
                "label": (it.name if it else None) or description,
                "code": it.sku if it else None,
                "accessory_id": accessory_id,
            }
        out["qty"] = qty
        return out


# ------------------------------------------------------------------------------------------ bills


def bills(
    db: Session,
    shop_id: uuid.UUID,
    ctx,
    *,
    date_from: dt.date | None = None,
    date_to: dt.date | None = None,
    q: str | None = None,
    type_: str | None = None,
    state: str | None = None,
    kind: str | None = None,
    mode: str | None = None,
    edited: bool = False,
) -> dict:
    can_cost = ctx.can(Cap.VIEW_COST)
    docs = list_documents(
        db, shop_id, ctx, q=q, date_from=date_from, date_to=date_to, limit=MANY, per_kind=MANY
    )
    cat = _Cat(db, shop_id)
    by_kind: dict = defaultdict(list)
    for r in docs:
        by_kind[r["kind"]].append(r["id"])

    def load(model, ids):
        out = {}
        for i in range(0, len(ids), 500):
            for d in db.scalars(select(model).where(model.id.in_(ids[i : i + 500]))).all():
                out[d.id] = d
        return out

    sales = load(Invoice, by_kind["sale"])
    purchases = load(Purchase, by_kind["purchase"])
    returns = load(ReturnDoc, by_kind["sale_return"] + by_kind["purchase_return"])
    repairs = load(RepairJob, by_kind["repair"])
    modes = {
        **_modes(db, shop_id, list(sales.values()), "sale"),
        **_modes(db, shop_id, list(purchases.values()), "purchase"),
    }
    changes = _changes(db, shop_id, list(sales) + list(purchases))
    replaced = _replaced(db, shop_id)
    parties: dict = {}

    rows = []
    for r in docs:
        k, did = r["kind"], r["id"]
        lines: list[dict] = []
        profit = None
        mode_ = None
        row_changes: list[dict] = []
        replaced_by = None
        stage = None
        if k == "sale":
            inv = sales[did]
            lines = [
                cat.line(ln.device_id, ln.accessory_id, ln.description, ln.qty) for ln in inv.lines
            ]
            mode_ = modes.get(did)
            row_changes = list(changes.get(did, []))
            rep = replaced.get(("invoices", inv.no))
            if rep:
                row_changes.insert(0, rep)
            if can_cost:
                profit = money(
                    sum(
                        (ln.line_total - ln.cost for ln in inv.lines if ln.returned_at is None),
                        ZERO,
                    )
                )
            if inv.status == InvoiceStatus.VOID and (inv.void_reason or "").startswith(
                "Edited, replaced by "
            ):
                replaced_by = inv.void_reason[len("Edited, replaced by ") :].split(":")[0].strip()
        elif k == "purchase":
            pur = purchases[did]
            lines = [
                cat.line(ln.device_id, ln.accessory_id, ln.description, ln.qty) for ln in pur.lines
            ]
            mode_ = modes.get(did)
            row_changes = list(changes.get(did, []))
            rep = replaced.get(("purchases", pur.no))
            if rep:
                row_changes.insert(0, rep)
            if pur.status == PurchaseStatus.VOIDED and (pur.void_reason or "").startswith(
                "Edited, replaced by "
            ):
                replaced_by = pur.void_reason[len("Edited, replaced by ") :].split(":")[0].strip()
        elif k in ("sale_return", "purchase_return"):
            ret = returns[did]
            lines = [
                cat.line(ln.get("device_id"), None, ln.get("description"), 1)
                for ln in (ret.lines or [])
            ]
            if ret.status == "voided":
                r["state"] = "void"
        else:
            job = repairs[did]
            d = cat.device(job.device_id) if job.device_id else None
            line = _device_line(d, cat.brands, cat.models) if d else {"kind": "phone"}
            line.update(
                label=line.get("label") or job.device_desc, code=job.imei or line.get("code")
            )
            line["qty"] = 1
            lines = [line]
            stage = job.status
            if r["state"] == "open":
                r["state"] = "in_repair"
        kinds = sorted({ln["kind"] for ln in lines})
        void = r["state"] == "void"
        total = Decimal(r["total"])
        money_in = money_out = ZERO
        if not void:
            if k in ("sale", "repair", "purchase_return"):
                money_in = total
            else:
                money_out = total
        p = parties.get(r["party_id"]) if r["party_id"] else None
        if r["party_id"] and r["party_id"] not in parties:
            p = parties[r["party_id"]] = db.get(Party, r["party_id"])
        rows.append(
            {
                **r,
                "type": "return" if k.endswith("_return") else k,
                "role": _role(p),
                "party_name_ur": p.name_ur if p else None,
                "lines": lines,
                "kinds": kinds,
                "mode": mode_,
                "changes": row_changes,
                "edited": bool(row_changes),
                "replaced_by_no": replaced_by,
                "profit": profit,
                "stage": stage,
                "money_in": money(money_in),
                "money_out": money(money_out),
            }
        )

    def keep(r: dict) -> bool:
        if type_ and r["type"] != type_:
            return False
        if state and r["state"] != state:
            return False
        if kind and kind not in r["kinds"]:
            return False
        return not (mode and r["mode"] != mode)

    rows = [r for r in rows if keep(r)]
    edited_count = sum(1 for r in rows if r["edited"])
    if edited:
        rows = [r for r in rows if r["edited"]]
    return {"rows": rows, "figures": _bill_figures(rows, can_cost, edited_count), **_groups(rows)}


def _bill_figures(rows: list[dict], can_cost: bool, edited_count: int) -> dict:
    live = [r for r in rows if r["state"] != "void"]
    sales = [r for r in live if r["kind"] == "sale"]
    purchases = [r for r in live if r["kind"] == "purchase"]
    return {
        "sales": money(sum((Decimal(r["total"]) for r in sales), ZERO)),
        "sales_count": len(sales),
        "purchases": money(sum((Decimal(r["total"]) for r in purchases), ZERO))
        if can_cost
        else None,
        "purchases_count": len(purchases) if can_cost else None,
        "to_get": money(
            sum((Decimal(r["due"]) for r in live if r["kind"] in ("sale", "repair")), ZERO)
        ),
        "to_pay": money(sum((Decimal(r["due"]) for r in purchases), ZERO)) if can_cost else None,
        "profit": money(sum((r["profit"] or ZERO for r in sales), ZERO)) if can_cost else None,
        "count": len(rows),
        "edited": edited_count,
    }


def _groups(rows: list[dict]) -> dict:
    """the bills per person (walk-in bills together), with what was billed, paid and is still due"""
    g: dict = {}
    for r in rows:
        key = r["party_id"]
        a = g.get(key)
        if a is None:
            a = g[key] = {
                "party_id": key,
                "name": r["party_name"],
                "name_ur": r["party_name_ur"],
                "phone": r["party_phone"],
                "role": r["role"],
                "bills": 0,
                "kinds": set(),
                "billed": ZERO,
                "paid": ZERO,
                "to_get": ZERO,
                "to_pay": ZERO,
                "ids": [],
            }
        a["bills"] += 1
        a["kinds"] |= set(r["kinds"])
        a["ids"].append(r["id"])
        if r["state"] != "void":
            a["billed"] = money(a["billed"] + Decimal(r["total"]))
            a["paid"] = money(a["paid"] + Decimal(r["paid"]))
            due = Decimal(r["due"])
            if r["kind"] == "purchase":
                a["to_pay"] = money(a["to_pay"] + due)
            else:
                a["to_get"] = money(a["to_get"] + due)
    out = sorted(g.values(), key=lambda a: a["billed"], reverse=True)
    for a in out:
        a["kinds"] = sorted(a["kinds"])
    return {"parties": out}


# ------------------------------------------------------------------------------------------ sales


def sales(
    db: Session,
    shop_id: uuid.UUID,
    ctx,
    *,
    date_from: dt.date | None = None,
    date_to: dt.date | None = None,
    q: str | None = None,
    kind: str | None = None,
    brand: str | None = None,
    mode: str | None = None,
    deal: str | None = None,
) -> dict:
    can_cost = ctx.can(Cap.VIEW_COST)
    docs = list_documents(
        db,
        shop_id,
        ctx,
        kind="sale",
        q=q,
        date_from=date_from,
        date_to=date_to,
        limit=MANY,
        per_kind=MANY,
    )
    ids = [r["id"] for r in docs if r["state"] != "void"]
    invs: list[Invoice] = []
    for i in range(0, len(ids), 500):
        invs += db.scalars(select(Invoice).where(Invoice.id.in_(ids[i : i + 500]))).all()
    invs.sort(key=lambda x: (x.date, x.created_at), reverse=True)
    cat = _Cat(db, shop_id)
    modes = _modes(db, shop_id, invs, "sale")
    changes = _changes(db, shop_id, [i.id for i in invs])
    bought = _bought(db, shop_id) if can_cost else {}
    people: dict = {}

    def person(pid):
        if pid and pid not in people:
            people[pid] = db.get(Party, pid)
        return people.get(pid) if pid else None

    all_lines: list[dict] = []
    bill_rows: dict = {}
    for inv in invs:
        kept = [ln for ln in inv.lines if ln.returned_at is None]
        kept_total = money(sum((ln.line_total for ln in kept), ZERO))
        due = max(ZERO, money(inv.total - inv.returned_total - inv.paid))
        p = person(inv.party_id)
        left = due
        bill_profit = ZERO
        for n, ln in enumerate(kept):
            info = cat.line(ln.device_id, ln.accessory_id, ln.description, ln.qty)
            d = cat.device(ln.device_id) if ln.device_id else None
            it = cat.item(ln.accessory_id) if ln.accessory_id else None
            if d is not None:
                b = cat.brands.get(d.brand_id)
                m = cat.models.get(d.model_id)
                brand_name = b.name if b else None
                model_name = m.name if m else ""
                model_key = f"{d.brand_id}:{name_key(model_name)}"
            elif it is not None:
                brand_name = it.brand
                model_name = it.name
                model_key = f"item:{it.id}"
            else:
                brand_name = None
                model_name = ln.description or ""
                model_key = f"text:{(ln.description or '').strip().lower()}"
            if n == len(kept) - 1:
                line_due = left
            else:
                line_due = money(due * ln.line_total / kept_total) if kept_total > ZERO else ZERO
                line_due = min(line_due, left)
            left = money(left - line_due)
            prof = money(ln.line_total - ln.cost)
            bill_profit += prof
            src = bought.get(ln.device_id) if ln.device_id else None
            src_party = person(src[1].party_id) if src else None
            all_lines.append(
                {
                    "invoice_id": inv.id,
                    "no": inv.no,
                    "date": inv.date,
                    "party_id": inv.party_id,
                    "party_name": p.name if p else None,
                    "party_phone": p.phone if p else None,
                    "role": _role(p),
                    "kind": info["kind"],
                    "brand": brand_name,
                    "brand_key": (brand_name or "").strip().lower(),
                    "model": model_name,
                    "model_key": model_key,
                    "code": info.get("code"),
                    "device_id": ln.device_id,
                    "accessory_id": ln.accessory_id,
                    "qty": ln.qty,
                    "sale": money(ln.line_total),
                    "cost": money(ln.cost) if can_cost else None,
                    "profit": prof if can_cost else None,
                    "received": money(ln.line_total - line_due),
                    "udhaar": line_due,
                    "mode": modes.get(inv.id),
                    "bought_from": src_party.name if src_party else None,
                    "bought_no": src[1].no if src else None,
                    "_profit": prof,
                }
            )
        bill_rows[inv.id] = {
            "id": inv.id,
            "no": inv.no,
            "date": inv.date,
            "party_id": inv.party_id,
            "party_name": p.name if p else None,
            "party_phone": p.phone if p else None,
            "role": _role(p),
            "total": money(inv.total),
            "paid": money(inv.paid),
            "returned": money(inv.returned_total),
            "due": due,
            "status": inv.status,
            "mode": modes.get(inv.id),
            "profit": money(bill_profit) if can_cost else None,
            "edited": bool(changes.get(inv.id)),
            "changes": changes.get(inv.id, []),
        }

    brand_options = sorted(
        {(ln["brand_key"], ln["brand"]) for ln in all_lines if ln["brand"]}, key=lambda x: x[0]
    )

    def keep(ln: dict) -> bool:
        if kind and ln["kind"] != kind:
            return False
        if brand and ln["brand_key"] != brand.strip().lower():
            return False
        if mode and ln["mode"] != mode:
            return False
        bill_due = bill_rows[ln["invoice_id"]]["due"]
        if deal == "udhaar" and bill_due <= ZERO:
            return False
        if deal == "paid" and bill_due > ZERO:
            return False
        return not (deal == "loss" and can_cost and ln["_profit"] >= ZERO)

    lines = [ln for ln in all_lines if keep(ln)]

    def blank() -> dict:
        return {
            "units": 0,
            "bills": set(),
            "sale": ZERO,
            "cost": ZERO,
            "received": ZERO,
            "udhaar": ZERO,
            "profit": ZERO,
            "gain": ZERO,
            "loss": ZERO,
        }

    def add(a: dict, ln: dict) -> None:
        a["units"] += ln["qty"]
        a["bills"].add(ln["invoice_id"])
        for k_ in ("sale", "received", "udhaar"):
            a[k_] = money(a[k_] + ln[k_])
        if can_cost:
            a["cost"] = money(a["cost"] + ln["cost"])
            a["profit"] = money(a["profit"] + ln["_profit"])
            if ln["_profit"] >= ZERO:
                a["gain"] = money(a["gain"] + ln["_profit"])
            else:
                a["loss"] = money(a["loss"] - ln["_profit"])

    def shape(a: dict) -> dict:
        out = {k_: v for k_, v in a.items() if k_ != "bills"}
        out["bills"] = len(a["bills"])
        if not can_cost:
            out.update(cost=None, profit=None, gain=None, loss=None)
        return out

    total = blank()
    kinds_: dict = {k_: blank() for k_ in KINDS}
    brands: dict = {}
    models: dict = {}
    parties: dict = {}
    for ln in lines:
        add(total, ln)
        add(kinds_.setdefault(ln["kind"], blank()), ln)
        b = brands.setdefault(ln["brand_key"], {**blank(), "brand": ln["brand"], "models": set()})
        add(b, ln)
        b["models"].add(ln["model_key"])
        m = models.setdefault(
            ln["model_key"],
            {
                **blank(),
                "kind": ln["kind"],
                "brand": ln["brand"],
                "model": ln["model"],
                "lines": [],
            },
        )
        add(m, ln)
        m["lines"].append(ln)
        pp = parties.setdefault(
            ln["party_id"],
            {
                **blank(),
                "party_id": ln["party_id"],
                "name": ln["party_name"],
                "phone": ln["party_phone"],
                "role": ln["role"],
                "ids": [],
            },
        )
        add(pp, ln)
        if ln["invoice_id"] not in pp["ids"]:
            pp["ids"].append(ln["invoice_id"])

    def clean(ln: dict) -> dict:
        return {k_: v for k_, v in ln.items() if not k_.startswith("_")}

    brand_rows = []
    for key, b in brands.items():
        row = shape({k_: v for k_, v in b.items() if k_ != "models"})
        row.update(key=key, models=len(b["models"]))
        brand_rows.append(row)
    model_rows = []
    for key, m in models.items():
        row = shape({k_: v for k_, v in m.items() if k_ != "lines"})
        row.update(key=key, lines=[clean(x) for x in m["lines"]])
        model_rows.append(row)
    party_rows = [shape(p) for p in parties.values()]
    shown = {ln["invoice_id"] for ln in lines}
    return {
        "figures": {**shape(total), "net": total["profit"] if can_cost else None},
        "kinds": [{"key": k_, **shape(a)} for k_, a in kinds_.items()],
        "brands": sorted(brand_rows, key=lambda r: r["sale"], reverse=True),
        "models": sorted(model_rows, key=lambda r: r["sale"], reverse=True),
        "parties": sorted(party_rows, key=lambda r: r["sale"], reverse=True),
        "bills": [bill_rows[i.id] for i in invs if i.id in shown],
        "lines": [clean(ln) for ln in lines],
        "brand_options": [{"key": k_, "name": n} for k_, n in brand_options],
    }
