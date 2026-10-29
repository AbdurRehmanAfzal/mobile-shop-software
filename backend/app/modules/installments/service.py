import datetime as dt
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import today as shop_today
from app.core.errors import NotFound, ValidationFailed
from app.db.base import ZERO, utcnow
from app.modules.audit.service import record_audit
from app.modules.auth.models import Shop
from app.modules.installments.models import InstallmentPlan
from app.modules.installments.schemas import InstallmentPlanIn
from app.modules.ledger.service import money
from app.modules.notifications import jobs as notify_jobs
from app.modules.notifications.models import Channel, Message
from app.modules.notifications.service import fmt, lang_for, queue, settings_for
from app.modules.parties.models import Party
from app.modules.sales.models import Invoice, InvoiceLine, InvoiceStatus


def add_months(d: dt.date, n: int, day: int | None = None) -> dt.date:
    m = d.month - 1 + n
    y = d.year + m // 12
    m = m % 12 + 1
    last = (dt.date(y + (m // 12), m % 12 + 1, 1) - dt.timedelta(days=1)).day
    return dt.date(y, m, min(day or d.day, last))


# ---- making a plan (from the sale) ---------------------------------------------------------


def create_plan(
    db: Session, shop_id: uuid.UUID, user_id, invoice: Invoice, data: InstallmentPlanIn
) -> InstallmentPlan:
    if invoice.party_id is None:
        raise ValidationFailed(
            "installments_need_customer",
            "Installments need a customer on the bill",
            "قسطوں کے لیے بل پر گاہک ہونا چاہیے",
        )
    rest = money(invoice.total - invoice.paid)
    if rest <= ZERO:
        raise ValidationFailed(
            "nothing_to_split",
            "The bill is already paid in full; nothing to put on installments",
            "بل پورا ادا ہو چکا؛ قسطوں کے لیے کچھ باقی نہیں",
        )
    monthly = money(data.monthly) if data.monthly else money(rest / data.months)
    if monthly * (data.months - 1) >= rest:
        raise ValidationFailed(
            "monthly_too_big",
            "The monthly amount times the months is more than what is left",
            "ماہانہ رقم مہینوں سے ضرب دے کر باقی رقم سے زیادہ بنتی ہے",
        )
    today = shop_today()
    first_due = data.first_due or add_months(today, 1, data.due_day)
    plan = InstallmentPlan(
        shop_id=shop_id,
        invoice_id=invoice.id,
        party_id=invoice.party_id,
        total=money(invoice.total),
        advance=money(invoice.paid),
        months=data.months,
        monthly=monthly,
        due_day=data.due_day,
        first_due=first_due,
        guarantor_name=(data.guarantor_name or "").strip() or None,
        guarantor_phone=data.guarantor_phone,
        guarantor_cnic=data.guarantor_cnic,
        notes=(data.notes or "").strip() or None,
        created_by=user_id,
    )
    db.add(plan)
    db.flush()
    record_audit(
        db,
        shop_id=shop_id,
        user_id=user_id,
        entity="installment_plan",
        entity_id=plan.id,
        action="create",
        after={"invoice": invoice.no, "months": data.months, "monthly": str(monthly)},
    )
    return plan


# ---- the schedule, derived from what the invoice received ---------------------------------


def schedule(plan: InstallmentPlan, inv: Invoice, today: dt.date | None = None) -> list[dict]:
    today = today or shop_today()
    rest = money(plan.total - plan.advance)
    received = max(ZERO, money(inv.paid - plan.advance))
    rows = []
    cum = ZERO
    for i in range(1, plan.months + 1):
        amount = plan.monthly if i < plan.months else money(rest - plan.monthly * (plan.months - 1))
        due = add_months(plan.first_due, i - 1, plan.due_day)
        paid_here = max(ZERO, min(amount, money(received - cum)))
        cum = money(cum + amount)
        if paid_here >= amount:
            status = "paid"
        elif paid_here > ZERO:
            status = "partial"
        elif due < today:
            status = "late"
        elif due == today:
            status = "today"
        else:
            status = "due"
        rows.append(
            {"seq": i, "due_date": due, "amount": amount, "paid": paid_here, "status": status}
        )
    return rows


def _row(db: Session, plan: InstallmentPlan, inv: Invoice, party: Party, today: dt.date) -> dict:
    sched = schedule(plan, inv, today)
    item = db.scalar(
        select(InvoiceLine.description)
        .where(InvoiceLine.invoice_id == inv.id)
        .order_by(InvoiceLine.line_no)
    )
    label = None
    overdue = [r for r in sched if r["status"] in ("late", "partial") and r["due_date"] < today]
    nxt = next((r for r in sched if r["status"] in ("partial", "today", "late", "due")), None)
    remaining = money(inv.total - inv.paid - inv.returned_total)
    if inv.status == InvoiceStatus.VOID:
        status = "void"
    elif remaining <= ZERO:
        status = "closed"
    else:
        status = "active"
    days_late = (today - nxt["due_date"]).days if nxt and nxt["due_date"] < today else 0
    return {
        "id": plan.id,
        "invoice_id": inv.id,
        "invoice_no": inv.no,
        "party_id": party.id,
        "party_name": party.name,
        "party_phone": party.phone,
        "item": label or item or "",
        "total": plan.total,
        "advance": plan.advance,
        "months": plan.months,
        "monthly": plan.monthly,
        "due_day": plan.due_day,
        "paid": money(inv.paid),
        "remaining": max(ZERO, remaining),
        "paid_count": sum(1 for r in sched if r["status"] == "paid"),
        "overdue_count": len(overdue),
        "overdue_amount": money(sum((r["amount"] - r["paid"] for r in overdue), ZERO)),
        "next_due": nxt["due_date"] if nxt else None,
        "next_amount": money(nxt["amount"] - nxt["paid"]) if nxt else None,
        "days_late": days_late,
        "status": status,
        "guarantor_name": plan.guarantor_name,
        "guarantor_phone": plan.guarantor_phone,
        "guarantor_cnic": plan.guarantor_cnic,
        "notes": plan.notes,
        "last_reminded_at": plan.last_reminded_at,
        "created_at": plan.created_at,
        "schedule": sched,
    }


def _plans(db: Session, shop_id: uuid.UUID):
    return db.execute(
        select(InstallmentPlan, Invoice, Party)
        .join(Invoice, Invoice.id == InstallmentPlan.invoice_id)
        .join(Party, Party.id == InstallmentPlan.party_id)
        .where(InstallmentPlan.shop_id == shop_id)
        .order_by(InstallmentPlan.created_at.desc())
    ).all()


def list_plans(db: Session, shop_id: uuid.UUID, view: str, q: str | None = None) -> list[dict]:
    """view: today (due today or overdue) | overdue | active | closed | all"""
    today = shop_today()
    out = []
    digits = "".join(ch for ch in (q or "") if ch.isdigit())
    for plan, inv, party in _plans(db, shop_id):
        if q:
            hay = f"{party.name} {party.phone} {inv.no} {plan.guarantor_name or ''}".lower()
            if q.lower() not in hay and not (digits and digits in (party.phone or "")):
                continue
        row = _row(db, plan, inv, party, today)
        if view == "today" and not (
            row["status"] == "active" and row["next_due"] is not None and row["next_due"] <= today
        ):
            continue
        if view == "overdue" and not (row["status"] == "active" and row["overdue_count"] > 0):
            continue
        if view == "active" and row["status"] != "active":
            continue
        if view == "closed" and row["status"] == "active":
            continue
        out.append(row)
    if view in ("today", "overdue", "active"):
        out.sort(key=lambda r: (r["next_due"] or dt.date.max, -float(r["overdue_amount"])))
    return out


def get_plan(db: Session, shop_id: uuid.UUID, plan_id: uuid.UUID) -> dict:
    row = db.execute(
        select(InstallmentPlan, Invoice, Party)
        .join(Invoice, Invoice.id == InstallmentPlan.invoice_id)
        .join(Party, Party.id == InstallmentPlan.party_id)
        .where(InstallmentPlan.id == plan_id, InstallmentPlan.shop_id == shop_id)
    ).first()
    if row is None:
        raise NotFound()
    plan, inv, party = row
    return _row(db, plan, inv, party, shop_today())


def plan_for_invoice(db: Session, invoice_id: uuid.UUID) -> InstallmentPlan | None:
    return db.scalar(select(InstallmentPlan).where(InstallmentPlan.invoice_id == invoice_id))


# ---- collecting and reminding --------------------------------------------------------------


def collect(db: Session, shop_id: uuid.UUID, user_id, plan_id: uuid.UUID, data) -> dict:
    """An installment comes in: a normal payment, allocated to this bill."""
    from app.modules.payments import service as payments
    from app.modules.payments.schemas import AllocationIn, PaymentCreate

    row = get_plan(db, shop_id, plan_id)
    if row["status"] != "active":
        raise ValidationFailed("plan_closed", "This plan is closed", "یہ پلان بند ہے")
    amount = money(data.amount)
    if amount > row["remaining"]:
        raise ValidationFailed(
            "more_than_remaining",
            f"Only Rs. {row['remaining']:,.0f} is left on this bill",
            f"اس بل پر صرف Rs. {row['remaining']:,.0f} باقی ہیں",
        )
    pay = payments.create_payment(
        db,
        shop_id,
        user_id,
        PaymentCreate(
            party_id=row["party_id"],
            direction="in",
            amount=amount,
            payment=data.payment,
            notes=data.notes or f"Installment · {row['invoice_no']}",
            allocations=[
                AllocationIn(document_type="invoice", document_id=row["invoice_id"], amount=amount)
            ],
        ),
    )
    out = get_plan(db, shop_id, plan_id)
    out["payment_id"] = pay.id
    out["payment_no"] = pay.no
    return out


def _message_ctx(shop: Shop, row: dict) -> dict:
    return {
        "shop": shop.name,
        "customer": row["party_name"],
        "item": row["item"],
        "amount": fmt(row["next_amount"] or ZERO),
        "due": row["next_due"].strftime("%d-%m-%Y") if row["next_due"] else "-",
        "remaining": fmt(row["remaining"]),
        "late": row["days_late"],
    }


def remind(db: Session, shop: Shop, plan_id: uuid.UUID) -> Message:
    row = get_plan(db, shop.id, plan_id)
    if not row["party_phone"]:
        raise ValidationFailed(
            "no_phone", "The customer has no phone number", "گاہک کا فون نمبر نہیں"
        )
    key = "installment_late" if row["days_late"] > 0 else "installment_due"
    m = queue(
        db,
        shop,
        channel=Channel.WHATSAPP,
        audience="customer",
        recipient=row["party_phone"],
        template_key=key,
        lang=lang_for(shop),
        ctx=_message_ctx(shop, row),
        event_type="installment",
        document_type="installment_plan",
        document_id=plan_id,
        party_id=row["party_id"],
    )
    plan = db.get(InstallmentPlan, plan_id)
    plan.last_reminded_at = utcnow()
    db.commit()
    notify_jobs.dispatch(db)
    db.refresh(m)
    return m


def auto_reminders(db: Session, shop: Shop) -> int:
    """The night job: a message for every active plan whose installment is due tomorrow or is late,
    at most one every 3 days per plan."""
    today = shop_today()
    now = utcnow()
    n = 0
    for row in list_plans(db, shop.id, "active"):
        nxt = row["next_due"]
        if nxt is None or nxt > today + dt.timedelta(days=1) or not row["party_phone"]:
            continue
        plan = db.get(InstallmentPlan, row["id"])
        last = plan.last_reminded_at
        if last is not None and last.tzinfo is None:
            last = last.replace(tzinfo=dt.UTC)
        if last is not None and (now - last).days < 3:
            continue
        key = "installment_late" if row["days_late"] > 0 else "installment_due"
        queue(
            db,
            shop,
            channel=Channel.WHATSAPP,
            audience="customer",
            recipient=row["party_phone"],
            template_key=key,
            lang=lang_for(shop, settings_for(shop)),
            ctx=_message_ctx(shop, row),
            event_type="installment",
            document_type="installment_plan",
            document_id=plan.id,
            party_id=row["party_id"],
        )
        plan.last_reminded_at = now
        n += 1
    db.flush()
    return n


def counts(db: Session, shop_id: uuid.UUID) -> dict:
    """for the home screen: how many installments are due today / late, and the late amount"""
    today = shop_today()
    due_today = overdue = 0
    late_amount = ZERO
    for row in list_plans(db, shop_id, "active"):
        if row["overdue_count"]:
            overdue += 1
            late_amount = money(late_amount + row["overdue_amount"])
        elif row["next_due"] == today:
            due_today += 1
    return {
        "installments_due_today": due_today,
        "installments_overdue": overdue,
        "installments_late_amount": late_amount,
    }
