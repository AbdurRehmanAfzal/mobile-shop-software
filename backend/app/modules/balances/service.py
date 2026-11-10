"""Open balances / udhaar (owner brief 2026-11-10, ADR-058): every amount still owed, either way,
grouped by phone (IMEI), customer, dealer or technician, with the bills / jobs behind it.

Nothing new is recorded; everything is read from what the shop already keeps:
- sale bills (`total − returned − paid`; below zero the shop owes a return credit),
- purchase bills (the same, the other way),
- repair jobs delivered on udhaar, and repair-lab charges not yet paid,
- each person's payments not put on a bill (applied oldest first to their open items of that kind),
- and the person's ledger balance. What the bills cannot explain (an old balance, an advance,
  len-den) shows once as "Other", so each person's lena / dena add up to their khata exactly and
  every rupee is counted once, whichever way it is grouped.

A bill with more than one phone keeps its open amount at bill level: in the phone view it shows
once under "Unallocated by IMEI", never split or repeated."""

import datetime as dt
import uuid
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.base import ZERO
from app.modules.devices.models import Device
from app.modules.ledger.service import money
from app.modules.parties.models import Party
from app.modules.payments.models import Payment, PaymentPurpose
from app.modules.purchases.models import Purchase, PurchaseStatus
from app.modules.repairs.models import RepairDispatch, RepairJob, RepairStatus
from app.modules.sales.models import Invoice, InvoiceStatus

GET, GIVE = "get", "give"
UNALLOCATED = "unallocated"


def _unalloc(p: Payment) -> Decimal:
    return money(p.amount - sum((money(a["amount"]) for a in (p.allocations or [])), ZERO))


def _view_of(party: Party) -> str:
    kinds = set(party.kinds or [])
    if "technician" in kinds:
        return "technician"
    if kinds & {"supplier", "shop"}:
        return "dealer"
    return "customer"


def _payments_for(pays: list[Payment], doc_type: str, doc_id) -> list[dict]:
    out = []
    for p in pays:
        for a in p.allocations or []:
            if a.get("document_type") == doc_type and a.get("document_id") == str(doc_id):
                out.append({"no": p.no, "date": p.date, "amount": money(a["amount"]), "id": p.id})
    return out


def items(db: Session, shop_id: uuid.UUID, *, can_cost: bool) -> list[dict]:
    """every open obligation, one row each"""
    devices: dict = {}

    def dev(did) -> Device | None:
        if did is None:
            return None
        if did not in devices:
            devices[did] = db.get(Device, did)
        return devices[did]

    parties = {p.id: p for p in db.scalars(select(Party).where(Party.shop_id == shop_id)).all()}
    pays_by: dict = {}
    for p in db.scalars(
        select(Payment)
        .where(Payment.shop_id == shop_id, Payment.status == "posted")
        .order_by(Payment.date, Payment.created_at)
    ).all():
        pays_by.setdefault(p.party_id, []).append(p)

    rows: list[dict] = []

    def add(party_id, direction, amount, source, ref_id, no, date, total, paid, lines, payments):
        imeis = [d.imei1 for d in (dev(x) for x in lines) if d is not None]
        rows.append(
            {
                "party_id": party_id,
                "direction": direction,
                "amount": money(amount),
                "source": source,
                "source_id": ref_id,
                "no": no,
                "date": date,
                "total": money(total) if total is not None else None,
                "paid": money(paid) if paid is not None else None,
                "device_ids": [x for x in lines if x],
                "imeis": imeis,
                "payments": payments,
            }
        )

    # sale bills
    for inv in db.scalars(
        select(Invoice).where(
            Invoice.shop_id == shop_id,
            Invoice.party_id.is_not(None),
            Invoice.status != InvoiceStatus.VOID,
        )
    ).all():
        rem = money(inv.total - inv.returned_total - inv.paid)
        if rem == ZERO:
            continue
        lines = [ln for ln in inv.lines if ln.device_id]
        if rem < ZERO:  # a return credit: the returned phones
            lines = [ln for ln in lines if ln.returned_at is not None] or lines
        add(
            inv.party_id,
            GET if rem > ZERO else GIVE,
            abs(rem),
            "invoice",
            inv.id,
            inv.no,
            inv.date,
            inv.total,
            inv.paid,
            [ln.device_id for ln in lines],
            _payments_for(pays_by.get(inv.party_id, []), "invoice", inv.id),
        )
    # purchase bills (what was paid for stock is cost: owner / manager only)
    if can_cost:
        for pur in db.scalars(
            select(Purchase).where(
                Purchase.shop_id == shop_id, Purchase.status == PurchaseStatus.POSTED
            )
        ).all():
            rem = money(pur.total - pur.returned_total - pur.paid)
            if rem == ZERO:
                continue
            lines = [ln.device_id for ln in pur.lines if ln.device_id]
            add(
                pur.party_id,
                GIVE if rem > ZERO else GET,
                abs(rem),
                "purchase",
                pur.id,
                pur.no,
                pur.date,
                pur.total,
                pur.paid,
                lines,
                _payments_for(pays_by.get(pur.party_id, []), "purchase", pur.id),
            )
    # repair jobs delivered on udhaar
    for job in db.scalars(
        select(RepairJob).where(
            RepairJob.shop_id == shop_id,
            RepairJob.party_id.is_not(None),
            RepairJob.status == RepairStatus.DELIVERED,
        )
    ).all():
        rem = money(job.total - job.paid)
        if rem > ZERO:
            add(
                job.party_id,
                GET,
                rem,
                "repair",
                job.id,
                job.no,
                job.updated_at.date() if job.updated_at else None,
                job.total,
                job.paid,
                [job.device_id] if job.device_id else [],
                [],
            )
            if not job.device_id and job.imei:
                rows[-1]["imeis"] = [job.imei]
    # repair-lab charges not paid when the phone came back
    for d in db.scalars(select(RepairDispatch).where(RepairDispatch.shop_id == shop_id)).all():
        rem = money(d.final_cost - d.paid_now)
        if rem <= ZERO:
            continue
        job = db.get(RepairJob, d.job_id)
        add(
            d.lab_party_id,
            GIVE,
            rem,
            "lab",
            job.id if job else d.id,
            job.no if job else None,
            d.back_on,
            d.final_cost,
            d.paid_now,
            [job.device_id] if job and job.device_id else [],
            [],
        )
        if job and not job.device_id and job.imei:
            rows[-1]["imeis"] = [job.imei]

    # a person's payments not on any bill pay their other open items, oldest first
    for pid, pays in pays_by.items():
        for direction, kinds in (("out", ("lab", "invoice")), ("in", ("repair", "purchase"))):
            free = money(
                sum(
                    (
                        _unalloc(p)
                        for p in pays
                        if p.direction == direction and p.purpose != PaymentPurpose.LENDING
                    ),
                    ZERO,
                )
            )
            if free <= ZERO:
                continue
            want = GIVE if direction == "out" else GET
            for r in sorted(
                (
                    r
                    for r in rows
                    if r["party_id"] == pid and r["direction"] == want and r["source"] in kinds
                ),
                key=lambda r: r["date"] or dt.date.min,
            ):
                # (a return credit on a sale bill, or a refund due on a purchase bill: money for it
                # cannot be put on the bill itself, so it stays "not on a bill")
                take = min(free, r["amount"])
                if take <= ZERO:
                    break
                r["amount"] = money(r["amount"] - take)
                r["paid"] = money((r["paid"] or ZERO) + take)
                r["payments"].append(
                    {"no": None, "date": None, "amount": take, "id": None, "unallocated": True}
                )
                free = money(free - take)
    rows = [r for r in rows if r["amount"] > ZERO]

    # what the bills cannot explain, so each person adds up to their khata
    by_party: dict = {}
    for r in rows:
        s = by_party.setdefault(r["party_id"], [ZERO, ZERO])
        s[0 if r["direction"] == GET else 1] += r["amount"]
    for pid, party in parties.items():
        if not can_cost and "supplier" in (party.kinds or []):
            continue
        get_, give_ = by_party.get(pid, [ZERO, ZERO])
        rest = money(money(party.balance or ZERO) - (get_ - give_))
        if rest != ZERO:
            add(
                pid,
                GET if rest > ZERO else GIVE,
                abs(rest),
                "other",
                None,
                None,
                None,
                None,
                None,
                [],
                [],
            )

    for r in rows:
        p = parties.get(r["party_id"])
        r["party_name"] = p.name if p else None
        r["party_phone"] = p.phone if p else None
        r["view"] = _view_of(p) if p else "customer"
        r["phone_key"] = (
            r["imeis"][0] if len(r["imeis"]) == 1 else UNALLOCATED if len(r["imeis"]) > 1 else None
        )
    return rows


def grouped(
    db: Session,
    shop_id: uuid.UUID,
    *,
    view: str,
    q: str | None,
    direction: str | None,
    can_cost: bool,
) -> dict:
    rows = items(db, shop_id, can_cost=can_cost)
    totals = {
        "get": money(sum((r["amount"] for r in rows if r["direction"] == GET), ZERO)),
        "give": money(sum((r["amount"] for r in rows if r["direction"] == GIVE), ZERO)),
    }
    if view == "imei":
        mine = [r for r in rows if r["phone_key"]]
        key = lambda r: r["phone_key"]
    else:
        mine = [r for r in rows if r["view"] == view]
        key = lambda r: str(r["party_id"])
    groups: dict = {}
    for r in mine:
        g = groups.setdefault(
            key(r),
            {"key": key(r), "get": ZERO, "give": ZERO, "items": [], "parties": {}, "imeis": set()},
        )
        g["get" if r["direction"] == GET else "give"] += r["amount"]
        g["items"].append(r)
        g["parties"][str(r["party_id"])] = r["party_name"]
        g["imeis"].update(r["imeis"])
    out = []
    ql = (q or "").strip().lower()
    for g in groups.values():
        first = g["items"][0]
        if view == "imei":
            if g["key"] == UNALLOCATED:
                label, sub = UNALLOCATED, None
            else:
                d = db.get(Device, first["device_ids"][0]) if first["device_ids"] else None
                from app.modules.catalogue.models import Brand, Model

                b = db.get(Brand, d.brand_id) if d else None
                m = db.get(Model, d.model_id) if d else None
                label = g["key"]
                sub = f"{b.name if b else ''} {m.name if m else ''}".strip() or None
        else:
            label, sub = first["party_name"], first["party_phone"]
        hay = " ".join(
            str(x or "")
            for x in [
                label,
                sub,
                *g["parties"].values(),
                *g["imeis"],
                *(i["no"] for i in g["items"]),
            ]
        ).lower()
        if ql and ql not in hay:
            continue
        if direction == GET and g["get"] <= ZERO:
            continue
        if direction == GIVE and g["give"] <= ZERO:
            continue
        g["items"].sort(key=lambda i: i["date"] or dt.date.min)
        out.append(
            {
                "key": g["key"],
                "label": label,
                "sub": sub,
                "get": money(g["get"]),
                "give": money(g["give"]),
                "parties": [{"id": k, "name": v} for k, v in g["parties"].items()],
                "items": g["items"],
            }
        )
    out.sort(key=lambda g: -(g["get"] + g["give"]))
    return {"totals": totals, "groups": out}
