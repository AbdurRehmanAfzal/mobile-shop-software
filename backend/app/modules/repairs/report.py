"""Repair reports on A4 / Excel (owner 2026-11-15, ADR-087).

- The shop's repairs: every job taken in during the period — the customer's or the shop's own phone,
  who repaired it (the shop's technician or an outside lab), its status, bill, paid, left to take,
  parts, the lab's charge and the profit / loss — with the totals, the jobs by status, by technician,
  the customers who still owe and the parts used.
- The outside labs: per lab (phones sent, back fixed / not fixed, at the lab now, the lab's charges,
  paid at the counter, its khata today) and every trip (sent, job, phone, whose, the problem, quote,
  result, back, charge, paid).
Read-only; deleted repairs are left out."""

import datetime as dt
import uuid
from collections import defaultdict
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import today as shop_today
from app.db.base import ZERO
from app.db.refs import user_name
from app.modules.auth.models import Shop, User
from app.modules.exports import a4
from app.modules.ledger.service import money
from app.modules.parties.models import Party
from app.modules.repairs.models import (
    DispatchStatus,
    RepairDispatch,
    RepairJob,
    RepairStatus,
)

STATUS = {
    "received": ("Received", "وصول"),
    "diagnosed": ("Checked", "چیک ہوا"),
    "waiting_parts": ("Waiting for parts", "پرزوں کا انتظار"),
    "in_progress": ("Being repaired", "مرمت جاری"),
    "repaired": ("Ready", "تیار"),
    "delivered": ("Given back", "واپس دیا"),
    "returned_unrepaired": ("Not fixed, given back", "ٹھیک نہیں ہوا، واپس"),
    "unclaimed": ("Not collected", "لینے نہیں آیا"),
    "cancelled": ("Deleted", "ڈیلیٹ"),
}
W = {
    "jobs_title": ("Repairs report", "مرمت کی رپورٹ"),
    "labs_title": ("Outside labs report", "باہر کی لیب کی رپورٹ"),
    "came": ("Phones taken in", "مرمت کو آئے"),
    "customer": ("Customers' phones", "گاہکوں کے موبائل"),
    "own": ("Shop's own phones", "دکان کے اپنے موبائل"),
    "delivered": ("Given back", "واپس دیے"),
    "open": ("Still with the shop", "ابھی دکان میں"),
    "ready": ("Ready, not collected", "تیار، لینے نہیں آئے"),
    "not_fixed": ("Not fixed", "ٹھیک نہیں ہوئے"),
    "at_lab": ("At a lab now", "ابھی لیب میں"),
    "late": ("Late (past the promised day)", "دیر (وعدے کے بعد)"),
    "billed": ("Billed", "بل"),
    "paid": ("Paid", "ادا"),
    "due": ("Left to take (udhaar)", "باقی (ادھار)"),
    "parts": ("Parts cost", "پرزوں کا خرچ"),
    "lab": ("Lab charges", "لیب کا خرچ"),
    "profit": ("Profit", "منافع"),
    "loss_jobs": ("Jobs at a loss", "نقصان والے کام"),
    "jobs": ("Every repair", "ہر مرمت"),
    "no": ("No.", "نمبر"),
    "date": ("Date", "تاریخ"),
    "whose": ("Customer / shop", "گاہک / دکان"),
    "device": ("Phone", "موبائل"),
    "problem": ("Problem", "مسئلہ"),
    "by": ("Repaired by", "کس نے کی"),
    "status": ("Status", "حالت"),
    "promised": ("Promised", "وعدہ"),
    "by_status": ("By status", "حالت کے حساب سے"),
    "count": ("Count", "تعداد"),
    "by_tech": ("By technician / lab", "ٹیکنیشن / لیب کے حساب سے"),
    "who": ("Who", "کون"),
    "owe": ("Customers who still owe", "جن گاہکوں نے ابھی دینا ہے"),
    "phone": ("Phone", "فون"),
    "parts_used": ("Parts used", "استعمال ہوئے پرزے"),
    "part": ("Part", "پرزہ"),
    "qty": ("Qty", "تعداد"),
    "cost": ("Cost", "قیمتِ خرید"),
    "price": ("Charged", "وصول قیمت"),
    "shop": ("Shop's phone", "دکان کا موبائل"),
    "own_tech": ("Shop technician", "دکان کا ٹیکنیشن"),
    "labs": ("Labs", "لیبیں"),
    "sent": ("Phones sent", "بھیجے گئے"),
    "fixed": ("Back fixed", "ٹھیک ہو کر آئے"),
    "charged": ("Lab charged", "لیب کا خرچ"),
    "paid_now": ("Paid at the counter", "موقع پر ادا"),
    "balance": ("Khata today", "آج کا کھاتہ"),
    "trips": ("Every phone sent", "ہر بھیجا گیا موبائل"),
    "sent_on": ("Sent", "بھیجا"),
    "quote": ("Quote", "طے شدہ"),
    "result": ("Result", "نتیجہ"),
    "back_on": ("Back", "واپس آیا"),
    "lab_name": ("Lab", "لیب"),
    "days": ("days", "دن"),
    "notes_jobs": (
        "Profit = bill − parts − lab charge, for repairs given back. Udhaar = the bill (or the estimate) less what was paid.",
        "منافع = بل − پرزے − لیب کا خرچ، واپس دی گئی مرمت کے لیے۔ ادھار = بل (یا اندازہ) − ادا شدہ۔",
    ),
    "notes_labs": (
        "Khata today: negative = the shop owes the lab. Charges are booked when the phone comes back.",
        "آج کا کھاتہ: منفی = دکان نے لیب کو دینا ہے۔ خرچ موبائل واپس آنے پر لکھا جاتا ہے۔",
    ),
}
RESULT = {
    "fixed": ("Fixed", "ٹھیک"),
    "not_fixed": ("Not fixed", "ٹھیک نہیں"),
    "at_lab": ("At the lab", "لیب میں"),
    "cancelled": ("Cancelled", "منسوخ"),
}


def period(date_from: dt.date | None, date_to: dt.date | None) -> tuple[dt.date, dt.date]:
    today = shop_today()
    d_to = date_to or today
    d_from = date_from or d_to.replace(day=1)
    if d_from > d_to:
        from app.core.errors import ValidationFailed

        raise ValidationFailed(code="bad_range", message_en="The start is after the end")
    return d_from, d_to


def _period_text(d_from: dt.date, d_to: dt.date, ur: bool) -> str:
    f = lambda d: d.strftime("%d-%m-%Y")
    n = (d_to - d_from).days + 1
    return f(d_from) if n == 1 else f"{f(d_from)} → {f(d_to)} ({n} {W['days'][1 if ur else 0]})"


def _local(d) -> dt.date:
    from app.core.clock import local_date

    return local_date(d) if isinstance(d, dt.datetime) else d


def jobs_report(db: Session, ctx, d_from: dt.date, d_to: dt.date, fmt: str, ur: bool):
    w = lambda k: W[k][1 if ur else 0]
    st = lambda k: STATUS.get(k, (k, k))[1 if ur else 0]
    shop = db.get(Shop, ctx.shop_id)
    jobs = [
        j
        for j in db.scalars(
            select(RepairJob).where(RepairJob.shop_id == ctx.shop_id).order_by(RepairJob.created_at)
        ).all()
        if d_from <= _local(j.created_at) <= d_to and j.status != RepairStatus.CANCELLED
    ]
    ids = [j.id for j in jobs]
    trips = (
        db.scalars(select(RepairDispatch).where(RepairDispatch.job_id.in_(ids))).all()
        if ids
        else []
    )
    by_job_trips: dict = defaultdict(list)
    for t in trips:
        by_job_trips[t.job_id].append(t)
    names: dict = {}

    def pname(pid):
        if pid not in names:
            p = db.get(Party, pid) if pid else None
            names[pid] = (p.name if p else None, p.phone if p else None)
        return names[pid]

    def uname(uid):
        u = db.get(User, uid) if uid else None
        return u.name if u else None

    today = shop_today()
    rows, owe, parts_rows = [], [], []
    by_status: dict = defaultdict(int)
    by_who: dict = defaultdict(lambda: [0, 0, ZERO, ZERO])  # jobs, given back, billed, profit
    t = defaultdict(lambda: ZERO)
    counts = defaultdict(int)
    for j in jobs:
        parts_cost = money(sum((p.unit_cost * p.qty for p in j.parts), ZERO))
        lab_cost = money(j.outside_cost or ZERO)
        given = j.status == RepairStatus.DELIVERED
        bill = j.total if given else j.estimate
        due = money(max(ZERO, (j.total if given else j.estimate) - j.paid)) if j.party_id else ZERO
        profit = money(j.total - parts_cost - lab_cost) if given else None
        jt = by_job_trips.get(j.id, [])
        labs_used = [pname(x.lab_party_id)[0] for x in jt if x.status != DispatchStatus.CANCELLED]
        who = ", ".join(x for x in labs_used if x) or uname(j.technician_id) or w("own_tech")
        cust = pname(j.party_id)[0] if j.party_id else w("shop")
        problem = ", ".join(j.fault_codes or []) + (f" · {j.fault_text}" if j.fault_text else "")
        rows.append(
            [
                j.no,
                _local(j.created_at),
                cust,
                j.device_desc,
                problem.strip(" ·"),
                who,
                st(j.status),
                j.promised_at,
                bill,
                j.paid,
                due,
                parts_cost,
                lab_cost,
                profit,
            ]
        )
        by_status[st(j.status)] += 1
        b = by_who[who]
        b[0] += 1
        if given:
            b[1] += 1
            b[2] += j.total
            b[3] += profit
            t["billed"] += j.total
            t["profit"] += profit
            if profit < 0:
                counts["loss"] += 1
        t["paid"] += j.paid
        t["due"] += due
        t["parts"] += parts_cost
        t["lab"] += lab_cost
        counts["customer" if j.party_id else "own"] += 1
        counts["delivered"] += int(given)
        counts["open"] += int(
            j.status not in (RepairStatus.DELIVERED, RepairStatus.RETURNED_UNREPAIRED)
        )
        counts["ready"] += int(j.status in (RepairStatus.REPAIRED, RepairStatus.UNCLAIMED))
        counts["not_fixed"] += int(j.status == RepairStatus.RETURNED_UNREPAIRED)
        counts["at_lab"] += int(any(x.status == DispatchStatus.AT_LAB for x in jt))
        counts["late"] += int(
            j.promised_at is not None
            and j.promised_at < today
            and j.status
            in (
                RepairStatus.RECEIVED,
                RepairStatus.DIAGNOSED,
                RepairStatus.WAITING_PARTS,
                RepairStatus.IN_PROGRESS,
            )
        )
        if due > 0:
            n_, ph = pname(j.party_id)
            owe.append([n_, ph, j.no, j.device_desc, due])
        for p in j.parts:
            parts_rows.append(
                [
                    j.no,
                    p.description,
                    p.qty,
                    money(p.unit_cost * p.qty),
                    money(p.unit_price * p.qty),
                ]
            )
    from app.core.permissions import Cap

    show_cost = ctx.can(Cap.VIEW_COST)
    stats: list[tuple[str, object]] = [
        (w("came"), len(jobs)),
        (w("customer"), counts["customer"]),
        (w("own"), counts["own"]),
        (w("delivered"), counts["delivered"]),
        (w("open"), counts["open"]),
        (w("ready"), counts["ready"]),
        (w("at_lab"), counts["at_lab"]),
        (w("late"), counts["late"]),
        (w("not_fixed"), counts["not_fixed"]),
        (w("billed"), money(t["billed"])),
        (w("paid"), money(t["paid"])),
        (w("due"), money(t["due"])),
    ]
    if show_cost:
        stats += [
            (w("parts"), money(t["parts"])),
            (w("lab"), money(t["lab"])),
            (w("profit"), money(t["profit"])),
            (w("loss_jobs"), counts["loss"]),
        ]
    head = [
        w("no"),
        w("date"),
        w("whose"),
        w("device"),
        w("problem"),
        w("by"),
        w("status"),
        w("promised"),
        w("billed"),
        w("paid"),
        w("due"),
    ]
    if show_cost:
        head += [w("parts"), w("lab"), w("profit")]
    else:
        rows = [r[:11] for r in rows]
    sections = [
        {
            "title": w("jobs"),
            "count": len(rows),
            "header": head,
            "rows": rows,
            "notes": [w("notes_jobs")],
        },
        {
            "title": w("by_status"),
            "header": [w("status"), w("count")],
            "rows": sorted(([k, v] for k, v in by_status.items()), key=lambda r: -r[1]),
        },
        {
            "title": w("by_tech"),
            "header": [w("who"), w("came"), w("delivered"), w("billed")]
            + ([w("profit")] if show_cost else []),
            "rows": [
                [k, v[0], v[1], money(v[2])] + ([money(v[3])] if show_cost else [])
                for k, v in sorted(by_who.items(), key=lambda x: -x[1][0])
            ],
        },
        {
            "title": w("owe"),
            "count": len(owe),
            "header": [w("whose"), w("phone"), w("no"), w("device"), w("due")],
            "rows": sorted(owe, key=lambda r: -r[4]),
        },
    ]
    if show_cost:
        sections.append(
            {
                "title": w("parts_used"),
                "count": len(parts_rows),
                "header": [w("no"), w("part"), w("qty"), w("cost"), w("price")],
                "rows": parts_rows,
            }
        )
    title, ptxt = w("jobs_title"), _period_text(d_from, d_to, ur)
    if fmt == "xlsx":
        return a4.workbook(f"repairs-{d_from}-{d_to}", title, ptxt, stats, sections)
    return a4.page(
        shop=shop,
        title=title,
        period=ptxt,
        who=user_name(db, ctx.id),
        stats=stats,
        sections=sections,
        ur=ur,
    )


def labs_report(
    db: Session, ctx, d_from: dt.date, d_to: dt.date, lab_id: uuid.UUID | None, fmt: str, ur: bool
):
    from app.modules.repairs import labs as labs_svc

    w = lambda k: W[k][1 if ur else 0]
    shop = db.get(Shop, ctx.shop_id)
    labs = [
        x
        for x in labs_svc.labs(db, ctx.shop_id, date_from=d_from, date_to=d_to)
        if not lab_id or x["party_id"] == lab_id
    ]
    labs = [x for x in labs if x["sent"] or lab_id]
    stmt = select(RepairDispatch).where(
        RepairDispatch.shop_id == ctx.shop_id,
        RepairDispatch.sent_on >= d_from,
        RepairDispatch.sent_on <= d_to,
    )
    if lab_id:
        stmt = stmt.where(RepairDispatch.lab_party_id == lab_id)
    trips = db.scalars(stmt.order_by(RepairDispatch.sent_on)).all()
    trip_rows = []
    for t in trips:
        job = db.get(RepairJob, t.job_id)
        lab = db.get(Party, t.lab_party_id)
        cust = db.get(Party, job.party_id) if job and job.party_id else None
        result = t.outcome if t.status == DispatchStatus.BACK else t.status
        trip_rows.append(
            [
                t.sent_on,
                lab.name if lab else None,
                job.no if job else None,
                job.device_desc if job else None,
                cust.name if cust else w("shop"),
                t.problem,
                t.quoted_cost,
                RESULT.get(result or "", (result, result))[1 if ur else 0],
                t.back_on,
                t.final_cost,
                t.paid_now,
            ]
        )
    tot = lambda k: money(sum((Decimal(x[k] or 0) for x in labs), ZERO))
    stats: list[tuple[str, object]] = [
        (w("labs"), len(labs)),
        (w("sent"), sum(x["sent"] for x in labs)),
        (w("fixed"), sum(x["fixed"] for x in labs)),
        (w("not_fixed"), sum(x["not_fixed"] for x in labs)),
        (w("at_lab"), sum(x["at_lab"] for x in labs)),
        (w("late"), sum(x["late"] for x in labs)),
        (w("charged"), tot("cost")),
        (w("paid_now"), tot("paid_now")),
        (w("balance"), tot("balance")),
    ]
    sections = [
        {
            "title": w("labs"),
            "count": len(labs),
            "header": [
                w("lab_name"),
                w("phone"),
                w("sent"),
                w("fixed"),
                w("not_fixed"),
                w("at_lab"),
                w("charged"),
                w("paid_now"),
                w("balance"),
            ],
            "rows": [
                [
                    x["name"],
                    x["phone"],
                    x["sent"],
                    x["fixed"],
                    x["not_fixed"],
                    x["at_lab"],
                    x["cost"],
                    x["paid_now"],
                    x["balance"],
                ]
                for x in labs
            ],
            "notes": [w("notes_labs")],
        },
        {
            "title": w("trips"),
            "count": len(trip_rows),
            "header": [
                w("sent_on"),
                w("lab_name"),
                w("no"),
                w("device"),
                w("whose"),
                w("problem"),
                w("quote"),
                w("result"),
                w("back_on"),
                w("charged"),
                w("paid_now"),
            ],
            "rows": trip_rows,
        },
    ]
    title, ptxt = w("labs_title"), _period_text(d_from, d_to, ur)
    if fmt == "xlsx":
        return a4.workbook(f"repair-labs-{d_from}-{d_to}", title, ptxt, stats, sections)
    return a4.page(
        shop=shop,
        title=title,
        period=ptxt,
        who=user_name(db, ctx.id),
        stats=stats,
        sections=sections,
        ur=ur,
    )
