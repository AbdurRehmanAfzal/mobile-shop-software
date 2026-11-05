"""Repairs audit (owner 2026-11-03, docs/34): what came in and went out of the repair counter in the
period, the repair money (income, parts, outside labs, profit), every repair lab's record, faults,
and what needs a look now (late jobs, phones late at a lab).

Read-only, from repair jobs, lab trips and the ledger:
- income = the `repair_income` account;
- parts = `cogs` posted with repair bills;
- lab charges = trips that came back in the period (customer phones: a cost of the repair; the
  shop's own phones: added to that phone's cost, shown apart)."""

import uuid
from collections import Counter, defaultdict

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.clock import local_date, local_day
from app.core.clock import today as shop_today
from app.core.periods import Period
from app.db.base import ZERO
from app.db.refs import user_name
from app.modules.ledger.models import LedgerEntry, LedgerGroup
from app.modules.ledger.service import money
from app.modules.parties.models import Party
from app.modules.repairs.labs import labs as lab_rows
from app.modules.repairs.labs import trip_out
from app.modules.repairs.models import (
    CLOSED_STATUSES,
    DispatchStatus,
    RepairDispatch,
    RepairJob,
    RepairStatus,
)
from app.modules.repairs.schemas import FAULT_CODES
from app.modules.shopaudit.finance import bucket_of, buckets, granularity


def _ledger(db: Session, shop_id: uuid.UUID, p: Period, account: str, doc_types=None):
    stmt = (
        select(func.coalesce(func.sum(LedgerEntry.credit - LedgerEntry.debit), 0))
        .join(LedgerGroup, LedgerGroup.id == LedgerEntry.group_id)
        .where(
            LedgerEntry.shop_id == shop_id,
            LedgerEntry.account == account,
            local_day(LedgerEntry.at) >= p.date_from,
            local_day(LedgerEntry.at) <= p.date_to,
        )
    )
    if doc_types:
        stmt = stmt.where(LedgerGroup.document_type.in_(doc_types))
    return money(db.scalar(stmt) or 0)


def repairs(db: Session, shop_id: uuid.UUID, p: Period, *, can_cost: bool) -> dict:
    today = shop_today()
    jobs = db.scalars(select(RepairJob).where(RepairJob.shop_id == shop_id)).all()
    came = [j for j in jobs if p.date_from <= local_date(j.created_at) <= p.date_to]
    given = [
        j
        for j in jobs
        if j.status == RepairStatus.DELIVERED
        and j.delivered_at
        and p.date_from <= local_date(j.delivered_at) <= p.date_to
    ]
    unfixed = [
        j
        for j in jobs
        if j.status == RepairStatus.RETURNED_UNREPAIRED
        and j.delivered_at
        and p.date_from <= local_date(j.delivered_at) <= p.date_to
    ]
    open_now = [j for j in jobs if j.status not in CLOSED_STATUSES]
    late_now = [j for j in open_now if j.promised_at and j.promised_at < today]
    ready_now = [j for j in open_now if j.status == RepairStatus.REPAIRED]

    trips = db.scalars(select(RepairDispatch).where(RepairDispatch.shop_id == shop_id)).all()
    at_lab = [d for d in trips if d.status == DispatchStatus.AT_LAB]
    late_lab = [d for d in at_lab if d.expected_back and d.expected_back < today]
    back_in = [
        d
        for d in trips
        if d.status == DispatchStatus.BACK and d.back_on and p.date_from <= d.back_on <= p.date_to
    ]
    sent_in = [
        d
        for d in trips
        if d.status != DispatchStatus.CANCELLED and p.date_from <= d.sent_on <= p.date_to
    ]
    by_job = {j.id: j for j in jobs}
    lab_stock = money(sum((d.final_cost for d in back_in if not by_job[d.job_id].party_id), ZERO))
    # owner 2026-11-05 (accounting audit): repair profit matches each job's lab charge with its bill —
    # the charges of the customer jobs given back in the period, whenever the phone came back from
    # the lab. A charge on a job not given back yet is shown apart, so profit never dips below zero
    # only because the bill comes later.
    given_ids = {j.id for j in given}
    back_all = [d for d in trips if d.status == DispatchStatus.BACK]
    lab_customer = money(
        sum(
            (d.final_cost for d in back_all if d.job_id in given_ids and by_job[d.job_id].party_id),
            ZERO,
        )
    )
    lab_waiting = money(
        sum(
            (
                d.final_cost
                for d in back_all
                if by_job.get(d.job_id) is not None
                and by_job[d.job_id].party_id
                and by_job[d.job_id].status not in CLOSED_STATUSES
            ),
            ZERO,
        )
    )

    income = _ledger(db, shop_id, p, "repair_income")
    parts = money(-_ledger(db, shop_id, p, "cogs", ["repair_bill", "reversal:repair_bill"]))
    profit = money(income - parts - lab_customer)

    g = granularity(p)
    series: dict = defaultdict(lambda: {"came": 0, "given": 0})
    for j in came:
        series[bucket_of(local_date(j.created_at), g)]["came"] += 1
    for j in given:
        series[bucket_of(local_date(j.delivered_at), g)]["given"] += 1

    faults = Counter(c for j in came for c in (j.fault_codes or []))
    techs = Counter(j.technician_id for j in came if j.technician_id)

    def job_row(j: RepairJob) -> dict:
        party = db.get(Party, j.party_id) if j.party_id else None
        return {
            "id": j.id,
            "no": j.no,
            "device_desc": j.device_desc,
            "customer": party.name if party else None,
            "status": j.status,
            "promised_at": j.promised_at,
            "days_late": (today - j.promised_at).days if j.promised_at else None,
        }

    return {
        "period": p.as_dict(),
        "granularity": g,
        "counts": {
            "came": len(came),
            "given": len(given),
            "not_fixed": len(unfixed),
            "open_now": len(open_now),
            "ready_now": len(ready_now),
            "late_now": len(late_now),
            "at_lab_now": len(at_lab),
            "late_at_lab": len(late_lab),
            "sent_to_lab": len(sent_in),
            "back_from_lab": len(back_in),
        },
        "money": {
            "income": income,
            "parts": parts if can_cost else None,
            "lab_customer": lab_customer if can_cost else None,
            "lab_stock": lab_stock if can_cost else None,
            "lab_waiting": lab_waiting if can_cost else None,
            "profit": profit if can_cost else None,
            "avg_bill": money(income / len(given)) if given else ZERO,
        },
        "labs": [
            {**r, "balance": r["balance"] if can_cost else None}
            for r in lab_rows(db, shop_id, date_from=p.date_from, date_to=p.date_to)
            if r["sent"] or r["at_lab"]
        ],
        "faults": [
            {
                "code": c,
                "en": FAULT_CODES.get(c, (c, c))[0],
                "ur": FAULT_CODES.get(c, (c, c))[1],
                "count": n,
            }
            for c, n in faults.most_common()
        ],
        "technicians": [
            {"user_id": u, "name": user_name(db, u), "jobs": n} for u, n in techs.most_common()
        ],
        "series": [
            {"bucket": b, "came": series[b]["came"], "given": series[b]["given"]}
            for b in buckets(p)
        ],
        "late_jobs": [job_row(j) for j in sorted(late_now, key=lambda j: j.promised_at)][:50],
        "late_at_lab": [trip_out(db, d) for d in sorted(late_lab, key=lambda d: d.expected_back)],
        "notes": [
            "Income is the repair bills of the period; parts are their recorded cost.",
            "Repair profit takes each customer job's lab charge together with its bill (the jobs given back in the period). A lab charge on a job not given back yet is shown apart. On the shop's own phone the lab charge is added to that phone's cost (shown apart, not in repair profit).",
        ],
    }
