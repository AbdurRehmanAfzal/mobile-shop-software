"""Repair labs (owner 2026-11-03, docs/34): a repair job sent to an outside repair lab / technician
in the market, and the complete record of every lab.

- A lab is a party of kind `technician`, so it has its own khata, payments and statement.
- Each trip is a `RepairDispatch` row: sent (to whom, when, what to do, quoted, expected back) →
  back (fixed / not fixed, final cost, paid now) or cancelled. A job has at most one trip open.
- The lab's cost is booked when the phone comes back:
  - customer's phone → cost of the repair (`cogs`), so repair profit is right;
  - shop's own phone → added to that phone's cost (`inventory`), as before.
  In both cases the lab's khata is credited (the shop owes it), less what was paid on the spot.
- A trip writes a status-log line on the job and, for the shop's own phone, a `note` device event;
  nothing is deleted."""

import datetime as dt
import uuid
from collections import defaultdict
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import today as shop_today
from app.core.errors import Conflict, NotFound, ValidationFailed
from app.db.base import ZERO, utcnow
from app.db.refs import user_name
from app.modules.audit.service import record_audit
from app.modules.devices.service import apply_event, get_device
from app.modules.devices.state import EventType
from app.modules.ledger import accounts as acc
from app.modules.ledger.service import Posting, money, post
from app.modules.parties.models import Party, PartyKind
from app.modules.repairs.models import (
    CLOSED_STATUSES,
    TRANSITIONS,
    DispatchOutcome,
    DispatchStatus,
    RepairDispatch,
    RepairJob,
    RepairStatus,
)

LAB = PartyKind.TECHNICIAN.value


def _job(db: Session, shop_id: uuid.UUID, job_id: uuid.UUID) -> RepairJob:
    j = db.get(RepairJob, job_id)
    if j is None or j.shop_id != shop_id:
        raise NotFound(code="repair_not_found")
    return j


def _lab(db: Session, shop_id: uuid.UUID, party_id: uuid.UUID) -> Party:
    p = db.get(Party, party_id)
    if p is None or p.shop_id != shop_id:
        raise NotFound(code="party_not_found")
    if LAB not in (p.kinds or []):
        raise ValidationFailed(
            code="not_a_lab",
            message_en="This person is not marked as a repair lab / technician",
            message_ur="یہ شخص ریپئر لیب / ٹیکنیشن نہیں",
        )
    return p


def open_trip(db: Session, job_id: uuid.UUID) -> RepairDispatch | None:
    return db.scalar(
        select(RepairDispatch).where(
            RepairDispatch.job_id == job_id, RepairDispatch.status == DispatchStatus.AT_LAB
        )
    )


def _log(db, job: RepairJob, user_id, note: str, to: str | None = None) -> None:
    from app.modules.repairs.service import _log as log

    log(db, job, user_id, to or job.status, note, from_status=job.status)


def _device_note(db, shop_id, user_id, job: RepairJob, data: dict) -> None:
    if job.device_id:
        apply_event(
            db,
            shop_id,
            user_id,
            get_device(db, shop_id, job.device_id),
            EventType.NOTE,
            party_id=data.get("lab_id"),
            document_type="repair",
            document_id=job.id,
            data={"repair_no": job.no, **{k: v for k, v in data.items() if k != "lab_id"}},
        )


def send(
    db: Session,
    shop_id: uuid.UUID,
    user_id: uuid.UUID,
    job_id: uuid.UUID,
    *,
    lab_party_id: uuid.UUID,
    problem: str | None = None,
    quoted_cost: Decimal = ZERO,
    expected_back: dt.date | None = None,
    sent_on: dt.date | None = None,
    notes: str | None = None,
) -> RepairDispatch:
    job = _job(db, shop_id, job_id)
    if job.status in CLOSED_STATUSES:
        raise Conflict(
            code="repair_closed",
            message_en="This repair is already closed",
            message_ur="یہ ریپئر بند ہو چکی ہے",
        )
    if open_trip(db, job.id):
        raise Conflict(
            code="already_at_lab",
            message_en="This phone is already at a lab; mark it back first",
            message_ur="یہ فون پہلے ہی لیب میں ہے؛ پہلے واپسی درج کریں",
        )
    lab = _lab(db, shop_id, lab_party_id)
    d = RepairDispatch(
        shop_id=shop_id,
        job_id=job.id,
        lab_party_id=lab.id,
        status=DispatchStatus.AT_LAB,
        problem=problem,
        quoted_cost=money(quoted_cost or ZERO),
        sent_on=sent_on or shop_today(),
        expected_back=expected_back,
        sent_by=user_id,
        notes=notes,
    )
    db.add(d)
    job.outside_party_id = lab.id
    current = RepairStatus(job.status)
    to = RepairStatus.IN_PROGRESS if RepairStatus.IN_PROGRESS in TRANSITIONS[current] else current
    _log(db, job, user_id, f"→ {lab.name}" + (f": {problem}" if problem else ""), to)
    job.status = to
    _device_note(db, shop_id, user_id, job, {"lab_id": lab.id, "lab": lab.name, "kind": "lab_sent"})
    db.flush()
    record_audit(
        db,
        shop_id=shop_id,
        user_id=user_id,
        entity="repair",
        entity_id=job.id,
        action="lab_send",
        after={"lab": lab.name, "quoted": str(d.quoted_cost)},
    )
    db.commit()
    return d


def _trip(
    db: Session, shop_id: uuid.UUID, job: RepairJob, dispatch_id: uuid.UUID
) -> RepairDispatch:
    d = db.get(RepairDispatch, dispatch_id)
    if d is None or d.shop_id != shop_id or d.job_id != job.id:
        raise NotFound(code="dispatch_not_found")
    if d.status != DispatchStatus.AT_LAB:
        raise Conflict(
            code="dispatch_closed",
            message_en="This trip is already closed",
            message_ur="یہ اندراج پہلے ہی بند ہے",
        )
    return d


def back(
    db: Session,
    shop_id: uuid.UUID,
    user_id: uuid.UUID,
    job_id: uuid.UUID,
    dispatch_id: uuid.UUID,
    *,
    outcome: str,
    final_cost: Decimal = ZERO,
    paid_now: Decimal = ZERO,
    cash_account_id: uuid.UUID | None = None,
    back_on: dt.date | None = None,
    note: str | None = None,
) -> RepairDispatch:
    from app.modules.repairs.service import _cash

    job = _job(db, shop_id, job_id)
    d = _trip(db, shop_id, job, dispatch_id)
    cost, paid = money(final_cost or ZERO), money(paid_now or ZERO)
    if paid > cost:
        raise ValidationFailed(
            code="paid_exceeds_cost",
            message_en="Paid to the lab is more than its charge",
            message_ur="لیب کو ادائیگی اس کے چارج سے زیادہ ہے",
        )
    lab = db.get(Party, d.lab_party_id)
    if cost > ZERO:
        posting = Posting(document_type="repair_lab", document_id=d.id, memo=f"{job.no} {lab.name}")
        if job.device_id and not job.party_id:
            device = get_device(db, shop_id, job.device_id)
            posting.debit(acc.SysAccount.INVENTORY, cost, device_id=device.id, memo=job.no)
            device.cost_price = money((device.cost_price or ZERO) + cost)
        else:
            posting.debit(acc.SysAccount.COGS, cost, memo=f"Repair lab {job.no}")
        posting.credit(acc.party_account(lab.id), cost)
        if paid > ZERO:
            cash = _cash(db, shop_id, cash_account_id)
            posting.debit(acc.party_account(lab.id), paid).credit(
                acc.cash_account(cash.id), paid, memo=f"Paid {lab.name} for {job.no}"
            )
        d.ledger_group_id = post(db, shop_id, user_id, posting).id
    d.status = DispatchStatus.BACK
    d.outcome = DispatchOutcome(outcome)
    d.final_cost = cost
    d.paid_now = paid
    d.back_on = back_on or shop_today()
    d.received_by = user_id
    d.back_note = note
    d.updated_at = utcnow()
    job.outside_cost = money(job.outside_cost + cost)
    current = RepairStatus(job.status)
    fixed = d.outcome == DispatchOutcome.FIXED
    to = (
        RepairStatus.REPAIRED
        if fixed and RepairStatus.REPAIRED in TRANSITIONS[current]
        else current
    )
    _log(
        db,
        job,
        user_id,
        f"← {lab.name}: {'fixed' if fixed else 'not fixed'}"
        + (f", Rs. {cost:,.0f}" if cost else "")
        + (f" ({note})" if note else ""),
        to,
    )
    if to == RepairStatus.REPAIRED and current != RepairStatus.REPAIRED and job.party_id:
        # the same "your phone is ready" message as when the shop marks it fixed itself
        from app.modules.auth.models import Shop
        from app.modules.notifications import service as notify

        notify.on_repair_ready(db, db.get(Shop, shop_id), job, db.get(Party, job.party_id))
    job.status = to
    _device_note(
        db,
        shop_id,
        user_id,
        job,
        {"lab_id": lab.id, "lab": lab.name, "kind": "lab_back", "fixed": fixed, "cost": str(cost)},
    )
    record_audit(
        db,
        shop_id=shop_id,
        user_id=user_id,
        entity="repair",
        entity_id=job.id,
        action="lab_back",
        after={"lab": lab.name, "outcome": d.outcome, "cost": str(cost), "paid": str(paid)},
    )
    db.commit()
    return d


def cancel(
    db: Session,
    shop_id: uuid.UUID,
    user_id: uuid.UUID,
    job_id: uuid.UUID,
    dispatch_id: uuid.UUID,
    reason: str,
) -> RepairDispatch:
    job = _job(db, shop_id, job_id)
    d = _trip(db, shop_id, job, dispatch_id)
    lab = db.get(Party, d.lab_party_id)
    d.status = DispatchStatus.CANCELLED
    d.back_note = reason
    d.updated_at = utcnow()
    _log(db, job, user_id, f"✕ {lab.name}: {reason}")
    _device_note(
        db, shop_id, user_id, job, {"lab_id": lab.id, "lab": lab.name, "kind": "lab_cancelled"}
    )
    record_audit(
        db,
        shop_id=shop_id,
        user_id=user_id,
        entity="repair",
        entity_id=job.id,
        action="lab_cancel",
        after={"lab": lab.name, "reason": reason},
    )
    db.commit()
    return d


def lab_cost_booked(db: Session, job_id: uuid.UUID) -> Decimal:
    """what the trips of this job already booked (so delivery does not book it a second time)"""
    return money(
        sum(
            (
                d.final_cost
                for d in db.scalars(
                    select(RepairDispatch).where(
                        RepairDispatch.job_id == job_id,
                        RepairDispatch.status == DispatchStatus.BACK,
                    )
                ).all()
            ),
            ZERO,
        )
    )


def trip_out(
    db: Session, d: RepairDispatch, *, labs: dict | None = None, jobs: dict | None = None
) -> dict:
    lab = (labs or {}).get(d.lab_party_id) or db.get(Party, d.lab_party_id)
    job = (jobs or {}).get(d.job_id) or db.get(RepairJob, d.job_id)
    today = shop_today()
    end = d.back_on or today
    return {
        "id": d.id,
        "job_id": d.job_id,
        "job_no": job.no if job else None,
        "device_desc": job.device_desc if job else None,
        "customer_name": (db.get(Party, job.party_id).name if job and job.party_id else None),
        "lab_party_id": d.lab_party_id,
        "lab_name": lab.name if lab else None,
        "lab_phone": lab.phone if lab else None,
        "status": d.status,
        "problem": d.problem,
        "quoted_cost": d.quoted_cost,
        "sent_on": d.sent_on,
        "expected_back": d.expected_back,
        "sent_by_name": user_name(db, d.sent_by),
        "back_on": d.back_on,
        "received_by_name": user_name(db, d.received_by),
        "outcome": d.outcome,
        "final_cost": d.final_cost,
        "paid_now": d.paid_now,
        "days": (end - d.sent_on).days,
        "late": d.status == DispatchStatus.AT_LAB
        and d.expected_back is not None
        and d.expected_back < today,
        "notes": d.notes,
        "back_note": d.back_note,
    }


def job_trips(db: Session, job_id: uuid.UUID) -> list[dict]:
    rows = db.scalars(
        select(RepairDispatch)
        .where(RepairDispatch.job_id == job_id)
        .order_by(RepairDispatch.sent_on, RepairDispatch.created_at)
    ).all()
    return [trip_out(db, d) for d in rows]


def _stats(trips: list[RepairDispatch], today: dt.date) -> dict:
    back_ = [d for d in trips if d.status == DispatchStatus.BACK]
    days = [(d.back_on - d.sent_on).days for d in back_ if d.back_on]
    fixed = sum(1 for d in back_ if d.outcome == DispatchOutcome.FIXED)
    return {
        "sent": sum(1 for d in trips if d.status != DispatchStatus.CANCELLED),
        "at_lab": sum(1 for d in trips if d.status == DispatchStatus.AT_LAB),
        "late": sum(
            1
            for d in trips
            if d.status == DispatchStatus.AT_LAB and d.expected_back and d.expected_back < today
        ),
        "fixed": fixed,
        "not_fixed": sum(1 for d in back_ if d.outcome == DispatchOutcome.NOT_FIXED),
        "fix_rate": round(100 * fixed / len(back_)) if back_ else None,
        "avg_days": round(sum(days) / len(days), 1) if days else None,
        "cost": money(sum((d.final_cost for d in back_), ZERO)),
        "paid_now": money(sum((d.paid_now for d in back_), ZERO)),
        "last_sent": max((d.sent_on for d in trips), default=None),
    }


def labs(db: Session, shop_id: uuid.UUID, *, date_from=None, date_to=None) -> list[dict]:
    """every lab with its record (all time, or trips sent in the period); the khata balance is
    always today's (negative = the shop owes the lab)"""
    parties = [
        p
        for p in db.scalars(
            select(Party).where(Party.shop_id == shop_id, Party.is_active.is_(True))
        ).all()
        if LAB in (p.kinds or [])
    ]
    stmt = select(RepairDispatch).where(RepairDispatch.shop_id == shop_id)
    if date_from:
        stmt = stmt.where(RepairDispatch.sent_on >= date_from)
    if date_to:
        stmt = stmt.where(RepairDispatch.sent_on <= date_to)
    by_lab: dict = defaultdict(list)
    for d in db.scalars(stmt).all():
        by_lab[d.lab_party_id].append(d)
    ids = {p.id for p in parties} | set(by_lab)
    extra = [db.get(Party, i) for i in ids - {p.id for p in parties}]
    today = shop_today()
    out = [
        {
            "party_id": p.id,
            "name": p.name,
            "phone": p.phone,
            "address": p.address,
            "notes": p.notes,
            "balance": money(p.balance),
            **_stats(by_lab.get(p.id, []), today),
        }
        for p in [*parties, *[x for x in extra if x]]
    ]
    out.sort(key=lambda r: (-r["at_lab"], -r["sent"], r["name"]))
    return out


def lab_detail(db: Session, shop_id: uuid.UUID, party_id: uuid.UUID) -> dict:
    p = db.get(Party, party_id)
    if p is None or p.shop_id != shop_id:
        raise NotFound(code="party_not_found")
    trips = db.scalars(
        select(RepairDispatch)
        .where(RepairDispatch.shop_id == shop_id, RepairDispatch.lab_party_id == party_id)
        .order_by(RepairDispatch.sent_on.desc(), RepairDispatch.created_at.desc())
    ).all()
    jobs = (
        {
            j.id: j
            for j in db.scalars(
                select(RepairJob).where(RepairJob.id.in_({d.job_id for d in trips}))
            ).all()
        }
        if trips
        else {}
    )
    return {
        "party_id": p.id,
        "name": p.name,
        "phone": p.phone,
        "address": p.address,
        "notes": p.notes,
        "is_lab": LAB in (p.kinds or []),
        "balance": money(p.balance),
        **_stats(list(trips), shop_today()),
        "trips": [trip_out(db, d, labs={p.id: p}, jobs=jobs) for d in trips],
    }
