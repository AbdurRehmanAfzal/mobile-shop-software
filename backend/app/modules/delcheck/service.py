"""Before an entry is deleted (owner 2026-11-17, ADR-100): what stands in the way, said plainly,
each with the screen where it is undone — "this phone is at repair", "a payment was made against
this bill later", "this phone was sold on". Read-only: it changes nothing and decides nothing. The
delete itself keeps its own checks; this only tells the shopkeeper beforehand what they will say.

A blocker is `{code, to, ...words}`: the app has the sentence for each code in three languages and
fills in the words (`ref`, `who`, `phone`, `amount`)."""

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.base import ZERO
from app.modules.catalogue.models import Brand, Model
from app.modules.devices.models import Device
from app.modules.devices.state import DeviceStatus, EventType, moved_since
from app.modules.parties.models import Party

S = DeviceStatus
OPEN_REPAIR = ("received", "diagnosed", "waiting_parts", "in_progress", "repaired", "unclaimed")


def _name(db: Session, d: Device) -> str:
    b, m = db.get(Brand, d.brand_id), db.get(Model, d.model_id)
    label = f"{b.name if b else ''} {m.name if m else ''}".strip()
    return f"{label} · {d.imei1}" if label else d.imei1


def _party(db: Session, party_id) -> str | None:
    p = db.get(Party, party_id) if party_id else None
    return p.name if p else None


def _where_now(db: Session, shop_id: uuid.UUID, d: Device) -> dict | None:
    """a blocker for where the phone is now, if it is not simply in the shop"""
    phone = _name(db, d)
    stock = f"/stock/{d.id}"
    if d.status == S.IN_REPAIR:
        from app.modules.repairs.models import RepairJob

        job = db.scalar(
            select(RepairJob)
            .where(
                RepairJob.shop_id == shop_id,
                RepairJob.device_id == d.id,
                RepairJob.status.in_(OPEN_REPAIR),
            )
            .order_by(RepairJob.created_at.desc())
        )
        return {
            "code": "in_repair",
            "phone": phone,
            "ref": job.no if job else None,
            "to": f"/repairs/{job.id}" if job else stock,
        }
    if d.status == S.ON_LOAN:
        from app.modules.loans.models import Loan

        loan = db.scalar(
            select(Loan)
            .where(Loan.shop_id == shop_id, Loan.device_id == d.id, Loan.status == "out")
            .order_by(Loan.out_at.desc())
        )
        who = _party(db, loan.party_id) if loan else None
        return {"code": "on_loan", "phone": phone, "who": who, "to": "/loans"}
    if d.status == S.WITH_CUSTOMER_FOR_APPROVAL:
        who = _party(db, d.current_party_id)
        return {"code": "on_approval", "phone": phone, "who": who, "to": stock}
    if d.status == S.SOLD:
        sold = [e for e in d.events if e.type == EventType.SOLD and e.document_id]
        last = max(sold, key=lambda e: e.seq) if sold else None
        from app.modules.sales.models import Invoice

        inv = db.get(Invoice, last.document_id) if last else None
        return {
            "code": "sold",
            "phone": phone,
            "ref": inv.no if inv else None,
            "who": _party(db, inv.party_id) if inv else None,
            "to": f"/sales/{inv.id}" if inv else stock,
        }
    if d.status == S.RETURNED_TO_SUPPLIER:
        return {"code": "returned_to_supplier", "phone": phone, "to": "/returns"}
    if d.status not in (S.IN_STOCK, S.FAULTY):
        return {"code": "not_in_shop", "phone": phone, "status": d.status, "to": stock}
    if d.reserved_party_id is not None:
        who = _party(db, d.reserved_party_id)
        return {"code": "reserved", "phone": phone, "who": who, "to": stock}
    return None


def _payments_against(db: Session, shop_id: uuid.UUID, party_id, document_id) -> list[dict]:
    from app.modules.payments.models import Payment

    if party_id is None:
        return []
    out = []
    rows = db.scalars(
        select(Payment).where(
            Payment.shop_id == shop_id, Payment.party_id == party_id, Payment.status != "voided"
        )
    ).all()
    for p in rows:
        if any(str(a.get("document_id")) == str(document_id) for a in (p.allocations or [])):
            out.append(
                {
                    "code": "later_payment",
                    "ref": p.no,
                    "amount": p.amount,
                    "to": f"/parties/{party_id}",
                }
            )
    return out


def _purchase(db: Session, shop_id: uuid.UUID, doc_id: uuid.UUID) -> list[dict]:
    from app.modules.exchanges.models import Exchange
    from app.modules.purchases.models import Purchase

    p = db.get(Purchase, doc_id)
    if p is None or p.shop_id != shop_id:
        return []
    out = _payments_against(db, shop_id, p.party_id, p.id)
    ex = db.scalar(select(Exchange).where(Exchange.purchase_id == p.id))
    if ex is not None:
        out.append({"code": "in_exchange", "ref": ex.no, "to": f"/sales/{ex.invoice_id}"})
    for ln in p.lines:
        if not ln.device_id:
            continue
        d = db.get(Device, ln.device_id)
        now = _where_now(db, shop_id, d)
        if now:
            out.append(now)
            continue
        bought = [e for e in d.events if e.document_id == p.id]
        if bought and moved_since(d.events, bought[0].seq):
            # back in the shop, but it went somewhere in between (a loan, a repair with a cost):
            # the purchase can no longer be taken out; it is sent back to the seller instead
            out.append(
                {
                    "code": "went_out_and_back",
                    "phone": _name(db, d),
                    "to": f"/purchases/{p.id}?return={d.id}",
                }
            )
    return out


def _sale(db: Session, shop_id: uuid.UUID, doc_id: uuid.UUID) -> list[dict]:
    from app.modules.exchanges.models import Exchange
    from app.modules.installments.models import InstallmentPlan
    from app.modules.sales.models import Invoice

    inv = db.get(Invoice, doc_id)
    if inv is None or inv.shop_id != shop_id:
        return []
    out = _payments_against(db, shop_id, inv.party_id, inv.id)
    if inv.returned_total > ZERO:
        out.append({"code": "has_return", "amount": inv.returned_total, "to": "/returns"})
    if (inv.khata_adjusted or ZERO) > ZERO:
        out.append(
            {
                "code": "khata_adjusted",
                "amount": inv.khata_adjusted,
                "to": f"/parties/{inv.party_id}",
            }
        )
    plan = db.scalar(
        select(InstallmentPlan).where(
            InstallmentPlan.invoice_id == inv.id, InstallmentPlan.cancelled_at.is_(None)
        )
    )
    if plan is not None:
        out.append({"code": "has_installments", "to": f"/installments/{plan.id}"})
    ex = db.scalar(
        select(Exchange).where(
            (Exchange.invoice_id == inv.id) | (Exchange.original_invoice_id == inv.id)
        )
    )
    if ex is not None:
        out.append({"code": "in_exchange", "ref": ex.no, "to": f"/sales/{ex.invoice_id}"})
    for ln in inv.lines:
        if not ln.device_id or ln.returned_at is not None:
            continue
        d = db.get(Device, ln.device_id)
        sold = [e for e in d.events if e.document_id == inv.id and e.type == EventType.SOLD]
        if not sold or d.status != S.SOLD or moved_since(d.events, sold[0].seq):
            out.append({"code": "moved_after_sale", "phone": _name(db, d), "to": f"/stock/{d.id}"})
    return out


def _return(db: Session, shop_id: uuid.UUID, doc_id: uuid.UUID) -> list[dict]:
    from app.modules.devices.state import MONEY_EVENTS
    from app.modules.returns.models import ReturnDoc, ReturnKind

    r = db.get(ReturnDoc, doc_id)
    if r is None or r.shop_id != shop_id:
        return []
    sale = r.kind == ReturnKind.SALE
    want = EventType.SALE_RETURNED if sale else EventType.RETURNED_TO_SUPPLIER
    out = []
    for ln in r.lines:
        if not ln.get("device_id"):
            continue
        d = db.get(Device, uuid.UUID(ln["device_id"]))
        money = [e for e in d.events if e.type in MONEY_EVENTS]
        last = max(money, key=lambda e: e.seq) if money else None
        ok_status = d.status == (S.IN_STOCK if sale else S.RETURNED_TO_SUPPLIER)
        if ok_status and last is not None and last.type == want and last.document_id == r.id:
            continue
        now = _where_now(db, shop_id, d) if sale else None
        out.append(
            now or {"code": "moved_after_return", "phone": _name(db, d), "to": f"/stock/{d.id}"}
        )
    return out


def _repair(db: Session, shop_id: uuid.UUID, doc_id: uuid.UUID) -> list[dict]:
    from app.modules.repairs.models import DispatchStatus, RepairDispatch, RepairJob

    job = db.get(RepairJob, doc_id)
    if job is None or job.shop_id != shop_id:
        return []
    if job.status == "delivered":
        return [{"code": "repair_given_back", "ref": job.no, "to": f"/repairs/{job.id}"}]
    trips = db.scalars(select(RepairDispatch).where(RepairDispatch.job_id == job.id)).all()
    if any(t.status == DispatchStatus.BACK and t.final_cost > ZERO for t in trips):
        return [{"code": "lab_charge_booked", "ref": job.no, "to": f"/repairs/{job.id}"}]
    return []


CHECKS = {
    "purchase": _purchase,
    "sale": _sale,
    "saleReturn": _return,
    "purchaseReturn": _return,
    "repair": _repair,
}


def check(db: Session, shop_id: uuid.UUID, kind: str, doc_id: uuid.UUID) -> dict:
    """`ok` = nothing known stands in the way. Kinds with no rule here (a payment, len-den, an
    expense, an exchange) are always ok: their delete says so itself if something is wrong."""
    fn = CHECKS.get(kind)
    blockers = fn(db, shop_id, doc_id) if fn else []
    return {"ok": not blockers, "blockers": blockers}
