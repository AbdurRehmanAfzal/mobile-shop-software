"""Business overview (owner 2026-11-14, ADR-076): everything the shopkeeper asked to see on one
screen — the period's sales and purchases with what was paid and what went on udhaar, phones sold
and bought, profit, expenses, money received and paid (and from / to whom), returns, udhaar given and
collected, new and total customers and dealers, top sellers and top purchases, who owes the shop and
whom the shop owes, this month's sales and expenses, stock alerts, recent activity and counts of
every module. Read-only: it only reads the existing records; each figure has a screen to open."""

import datetime as dt
import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.clock import local_date
from app.core.clock import today as shop_today
from app.db.base import ZERO
from app.db.refs import user_name
from app.modules.audit.models import AuditLog
from app.modules.ledger.service import money
from app.modules.parties.models import Party
from app.modules.payments.models import Payment
from app.modules.purchases.models import Purchase, PurchaseStatus
from app.modules.reports import service as rep
from app.modules.returns.models import ReturnDoc
from app.modules.sales.models import Invoice, InvoiceStatus


def _purchases(db: Session, shop_id: uuid.UUID, d_from: dt.date, d_to: dt.date) -> dict:
    from app.modules.catalogue.models import Brand, Model
    from app.modules.devices.models import Device

    rows = db.scalars(
        select(Purchase).where(
            Purchase.shop_id == shop_id,
            Purchase.date >= d_from,
            Purchase.date <= d_to,
            Purchase.status != PurchaseStatus.VOIDED,
        )
    ).all()
    total = money(sum((p.total - p.returned_total for p in rows), ZERO))
    paid = money(sum((min(p.paid, p.total) for p in rows), ZERO))
    phones = 0
    top: dict[str, dict] = {}
    names: dict = {}
    for p in rows:
        for ln in p.lines:
            if ln.kind != "device" or not ln.device_id:
                continue
            phones += 1
            d = db.get(Device, ln.device_id)
            if d is None:
                continue
            key = (d.brand_id, d.model_id)
            if key not in names:
                b, m = db.get(Brand, d.brand_id), db.get(Model, d.model_id)
                names[key] = f"{b.name if b else ''} {m.name if m else ''}".strip()
            r = top.setdefault(names[key], {"name": names[key], "qty": 0, "amount": ZERO})
            r["qty"] += 1
            r["amount"] = money(r["amount"] + ln.net_cost)
    return {
        "count": len(rows),
        "total": total,
        "paid": paid,
        "credit": money(max(ZERO, total - paid)),
        "phones": phones,
        "top": sorted(top.values(), key=lambda r: (-r["qty"], -r["amount"], r["name"]))[:5],
    }


def _sales_split(db: Session, shop_id: uuid.UUID, d_from: dt.date, d_to: dt.date) -> dict:
    rows = db.scalars(
        select(Invoice).where(
            Invoice.shop_id == shop_id,
            Invoice.date >= d_from,
            Invoice.date <= d_to,
            Invoice.status != InvoiceStatus.VOID,
        )
    ).all()
    total = money(sum((i.total - i.returned_total for i in rows), ZERO))
    paid = money(sum((min(i.paid, i.total - i.returned_total) for i in rows), ZERO))
    return {"paid": paid, "credit": money(max(ZERO, total - paid))}


def _at_bill(db: Session, shop_id: uuid.UUID, d_from: dt.date, d_to: dt.date) -> list[tuple]:
    """money paid on the bill itself (at the sale / purchase), per bill of the period:
    (direction, party_id, amount). It is the bill's paid less what later payments put on it."""
    bills: list[tuple[str, str, object]] = []
    for i in db.scalars(
        select(Invoice).where(
            Invoice.shop_id == shop_id,
            Invoice.date >= d_from,
            Invoice.date <= d_to,
            Invoice.status != InvoiceStatus.VOID,
        )
    ):
        bills.append(("in", "invoice", i))
    for p in db.scalars(
        select(Purchase).where(
            Purchase.shop_id == shop_id,
            Purchase.date >= d_from,
            Purchase.date <= d_to,
            Purchase.status != PurchaseStatus.VOIDED,
        )
    ):
        bills.append(("out", "purchase", p))
    if not bills:
        return []
    later: dict[str, object] = {}
    for allocs in db.scalars(
        select(Payment.allocations).where(
            Payment.shop_id == shop_id, Payment.date >= d_from, Payment.status != "voided"
        )
    ):
        for a in allocs or []:
            key = f"{a.get('document_type')}:{a.get('document_id')}"
            later[key] = later.get(key, ZERO) + money(a.get("amount") or 0)
    out = []
    for direction, kind, b in bills:
        amount = money(min(b.paid, b.total) - later.get(f"{kind}:{b.id}", ZERO))
        if amount > ZERO:
            out.append((direction, b.party_id, amount))
    return out


def _payments(db: Session, shop_id: uuid.UUID, d_from: dt.date, d_to: dt.date) -> dict:
    """money received and paid in the period by person: payments entered on their own plus the money
    paid on the bills themselves (ADR-076); a walk-in sale has no person (party_id None)"""
    rows = db.execute(
        select(Payment.direction, Payment.party_id, Payment.amount).where(
            Payment.shop_id == shop_id,
            Payment.date >= d_from,
            Payment.date <= d_to,
            Payment.status != "voided",
        )
    ).all()
    bill = _at_bill(db, shop_id, d_from, d_to)
    ids = {r.party_id for r in rows} | {pid for _, pid, _ in bill if pid}
    names = (
        dict(db.execute(select(Party.id, Party.name).where(Party.id.in_(ids))).all()) if ids else {}
    )
    out = {}
    for direction in ("in", "out"):
        by: dict[uuid.UUID | None, dict] = {}

        def add(pid, amount, by=by):
            r = by.setdefault(
                pid,
                {"party_id": pid, "name": names.get(pid), "amount": ZERO, "count": 0},
            )
            r["amount"] = money(r["amount"] + amount)
            r["count"] += 1

        for r in rows:
            if r.direction == direction:
                add(r.party_id, r.amount)
        at_bill = ZERO
        for d, pid, amount in bill:
            if d == direction:
                add(pid, amount)
                at_bill += amount
        people = sorted(by.values(), key=lambda r: -r["amount"])
        out[direction] = {
            "total": money(sum((r["amount"] for r in people), ZERO)),
            "at_bill": money(at_bill),
            "people": people[:10],
            "people_count": len(people),
        }
    return out


def _people(db: Session, shop_id: uuid.UUID, d_from: dt.date, d_to: dt.date) -> dict:
    rows = db.execute(
        select(Party.kinds, Party.created_at).where(
            Party.shop_id == shop_id, Party.is_active.is_(True)
        )
    ).all()
    out = {"customers": 0, "dealers": 0, "new_customers": 0, "new_dealers": 0}
    for kinds, created in rows:
        new = created is not None and d_from <= local_date(created) <= d_to
        if "customer" in (kinds or []):
            out["customers"] += 1
            out["new_customers"] += int(new)
        if "supplier" in (kinds or []):
            out["dealers"] += 1
            out["new_dealers"] += int(new)
    return out


def _dues(db: Session, shop_id: uuid.UUID) -> dict:
    rows = db.execute(
        select(Party.id, Party.name, Party.phone, Party.balance).where(
            Party.shop_id == shop_id, Party.is_active.is_(True), Party.balance != 0
        )
    ).all()
    get = sorted((r for r in rows if r.balance > 0), key=lambda r: -r.balance)
    give = sorted((r for r in rows if r.balance < 0), key=lambda r: r.balance)

    def rows_of(xs, sign):
        return [
            {"party_id": r.id, "name": r.name, "phone": r.phone, "amount": money(sign * r.balance)}
            for r in xs[:10]
        ]

    return {
        "to_get": money(sum((r.balance for r in get), ZERO)),
        "to_give": money(-sum((r.balance for r in give), ZERO)),
        "to_get_count": len(get),
        "to_give_count": len(give),
        "to_get_list": rows_of(get, 1),
        "to_give_list": rows_of(give, -1),
    }


def _returns(db: Session, shop_id: uuid.UUID, d_from: dt.date, d_to: dt.date) -> dict:
    rows = db.execute(
        select(
            ReturnDoc.kind, func.count(ReturnDoc.id), func.coalesce(func.sum(ReturnDoc.amount), 0)
        )
        .where(ReturnDoc.shop_id == shop_id, ReturnDoc.date >= d_from, ReturnDoc.date <= d_to)
        .group_by(ReturnDoc.kind)
    ).all()
    out = {"sale": {"count": 0, "amount": ZERO}, "purchase": {"count": 0, "amount": ZERO}}
    for kind, n, amount in rows:
        key = "sale" if kind == "sale" else "purchase"
        out[key] = {"count": n, "amount": money(amount or 0)}
    return out


def _counts(db: Session, shop_id: uuid.UUID) -> dict:
    from app.modules.transfers.models import BranchTransfer

    def n(model, *where):
        return db.scalar(select(func.count(model.id)).where(model.shop_id == shop_id, *where)) or 0

    return {
        "sales": n(Invoice, Invoice.status != InvoiceStatus.VOID),
        "purchases": n(Purchase, Purchase.status != PurchaseStatus.VOIDED),
        "returns": n(ReturnDoc),
        "transfers": n(BranchTransfer),
        "payments": n(Payment, Payment.status != "voided"),
    }


def _recent(db: Session, shop_id: uuid.UUID) -> list[dict]:
    rows = db.scalars(
        select(AuditLog).where(AuditLog.shop_id == shop_id).order_by(AuditLog.at.desc()).limit(12)
    ).all()
    names: dict = {}
    out = []
    for a in rows:
        if a.user_id not in names:
            names[a.user_id] = user_name(db, a.user_id)
        out.append(
            {
                "at": a.at,
                "who": names[a.user_id],
                "entity": a.entity,
                "action": a.action,
                "entity_id": a.entity_id,
                "ref": (a.after or {}).get("no") if isinstance(a.after, dict) else None,
            }
        )
    return out


def _alerts(db: Session, shop_id: uuid.UUID, show_cost: bool) -> dict:
    from app.modules.devices import service as devices
    from app.modules.devices.models import Device
    from app.modules.devices.state import DeviceStatus

    st = devices.stock_status(db, shop_id, category=None, can_cost=show_cost)
    cutoff = dt.datetime.now(dt.UTC) - dt.timedelta(days=60)
    old = (
        db.scalar(
            select(func.count(Device.id)).where(
                Device.shop_id == shop_id,
                Device.status == DeviceStatus.IN_STOCK,
                Device.first_seen_at < cutoff,
            )
        )
        or 0
    )
    u = st["units"]
    return {
        "on_hand": u["on_hand"],
        "available": u["available"],
        "faulty": u["faulty"],
        "inspection": u["inspection"],
        "in_repair": u["in_repair"],
        "reserved": u["reserved"],
        "old_60d": old,
        "items_low": st["items"]["low"],
        "items_out": st["items"]["out"],
    }


def overview(
    db: Session, shop_id: uuid.UUID, d_from: dt.date, d_to: dt.date, show_cost: bool
) -> dict:
    today = shop_today()
    month_from = today.replace(day=1)
    day = rep.day_report(db, shop_id, d_from, show_cost, d_to)
    month = rep.day_report(db, shop_id, month_from, show_cost, today)
    split = _sales_split(db, shop_id, d_from, d_to)
    top = rep.top_sellers(db, shop_id, d_from, d_to, show_cost, limit=5)
    return {
        "date_from": d_from,
        "date_to": d_to,
        "sales": {
            "total": day["sales_total"],
            "count": day["sales_count"],
            "phones": day["phones_sold"],
            "paid": split["paid"],
            "credit": split["credit"],
            "profit": day["profit"],
        },
        "purchases": _purchases(db, shop_id, d_from, d_to),
        "expenses": day["expenses"],
        "udhaar_given": day["udhaar_given"],
        "udhaar_collected": day["udhaar_received"],
        "returns": _returns(db, shop_id, d_from, d_to),
        "payments": _payments(db, shop_id, d_from, d_to),
        "people": _people(db, shop_id, d_from, d_to),
        "dues": _dues(db, shop_id),
        "month": {
            "from": month_from,
            "sales": month["sales_total"],
            "expenses": month["expenses"],
            "profit": month["profit"],
        },
        "top_sold": top,
        "alerts": _alerts(db, shop_id, show_cost),
        "recent": _recent(db, shop_id),
        "counts": _counts(db, shop_id),
        "show_cost": show_cost,
    }
