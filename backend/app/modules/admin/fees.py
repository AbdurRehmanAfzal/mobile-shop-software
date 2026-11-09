"""Software fees (owner 2026-10-29): the shop owner sees the product owner's payment accounts
(Easypaisa, JazzCash, SadaPay, banks), pays by hand, and reports it with the transaction reference
and a screenshot; the product owner approves (the plan is extended) or rejects. The accounts are
entered in the Super admin screen and kept in the database, never in code or docs."""

import datetime as dt
import uuid
from decimal import Decimal

from sqlalchemy import JSON, Date, DateTime, ForeignKey, Integer, String, Text, Uuid, func, select
from sqlalchemy.orm import Mapped, Session, mapped_column

from app.core.clock import today as shop_today
from app.core.errors import Conflict, NotFound
from app.core.periods import day_start
from app.db.base import Base, UUIDPk, utcnow
from app.modules.admin import plans
from app.modules.audit.service import record_audit
from app.modules.auth.models import Organisation, Shop, User
from app.modules.ledger.service import money
from app.modules.notifications import jobs
from app.modules.notifications.models import Channel
from app.modules.notifications.service import lang_for, queue, settings_for

PENDING, APPROVED, REJECTED = "pending", "approved", "rejected"
ACCOUNTS_KEY = "payment_accounts"


class PlatformSetting(Base):
    """key → JSON, for the product owner's own settings (payment accounts and the like)"""

    __tablename__ = "platform_settings"

    key: Mapped[str] = mapped_column(String(40), primary_key=True)
    value: Mapped[dict | list | None] = mapped_column(JSON)
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )


class FeePayment(UUIDPk, Base):
    __tablename__ = "fee_payments"

    organisation_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    shop_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("shops.id", ondelete="CASCADE"), nullable=False
    )
    amount: Mapped[Decimal] = mapped_column(nullable=False)
    method: Mapped[str] = mapped_column(String(60), nullable=False)
    reference: Mapped[str | None] = mapped_column(String(80))
    proof_path: Mapped[str | None] = mapped_column(String(500))
    months: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    note: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(10), default=PENDING, nullable=False)
    decision_note: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    handled_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))
    handled_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )
    # owner addendum 3: the day the money was sent, and the renewal receipt number (SUB-0001)
    paid_on: Mapped[dt.date | None] = mapped_column(Date)
    receipt_no: Mapped[str | None] = mapped_column(String(12), index=True)
    # owner 2026-11-09 (ADR-053): the part of this payment that cleared fee still unpaid from a
    # package extended on credit; the rest bought `months`. Set when approved, never changed.
    to_dues: Mapped[Decimal] = mapped_column(default=Decimal(0), nullable=False)


class FeeDue(UUIDPk, Base):
    """A package extended on credit (owner 2026-11-09, ADR-053): the provider gave the months now,
    the customer pays later (agreed by word). What is paid / left is derived from the approved
    payments' `to_dues`, oldest first; nothing here is edited after it is made."""

    __tablename__ = "fee_dues"

    organisation_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    shop_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("shops.id", ondelete="CASCADE"), nullable=False
    )
    invoice_no: Mapped[str] = mapped_column(String(12), nullable=False, index=True)
    months: Mapped[int] = mapped_column(Integer, nullable=False)
    amount: Mapped[Decimal] = mapped_column(nullable=False)
    period_from: Mapped[dt.date | None] = mapped_column(Date)
    period_to: Mapped[dt.date | None] = mapped_column(Date)
    due_on: Mapped[dt.date | None] = mapped_column(Date)  # the day the customer promised
    note: Mapped[str | None] = mapped_column(
        Text
    )  # the provider's own note, never shown to the shop
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )


RECEIPT_SEQ_KEY = "receipt_seq"
DUE_SEQ_KEY = "fee_due_seq"


def _next_no(db: Session, key: str, prefix: str) -> str:
    row = db.get(PlatformSetting, key)
    n = int((row.value or {}).get("next", 1)) if row and isinstance(row.value, dict) else 1
    if row is None:
        db.add(PlatformSetting(key=key, value={"next": n + 1}))
    else:
        row.value = {"next": n + 1}
    db.flush()
    return f"{prefix}-{n:04d}"


def next_receipt_no(db: Session) -> str:
    """SUB-0001, SUB-0002 … across every shop (the provider's own numbering)."""
    return _next_no(db, RECEIPT_SEQ_KEY, "SUB")


def notify_admin(db: Session, template_key: str, ctx: dict) -> None:
    """A WhatsApp to the product owner through their own shop's outbox (like shop requests)."""
    from app.core.config import settings
    from app.modules.auth.models import UserShop

    admin_phone = settings.admin_whatsapp or (
        min(settings.superusers) if settings.superusers else None
    )
    admin = (
        db.scalar(select(User).where(User.phone.in_(list(settings.superusers))))
        if settings.superusers
        else None
    )
    if not admin_phone or admin is None:
        return
    home = db.scalar(
        select(Shop)
        .join(UserShop, UserShop.shop_id == Shop.id)
        .where(UserShop.user_id == admin.id)
        .order_by(Shop.created_at)
    )
    if home is None:
        return
    queue(
        db,
        home,
        channel=Channel.WHATSAPP,
        audience="admin",
        recipient=admin_phone,
        template_key=template_key,
        lang="en",
        ctx=ctx,
        event_type="fee",
        document_type="fee_payment",
        document_id=None,
    )


# ---- the product owner's accounts ------------------------------------------------------------


def accounts(db: Session) -> list[dict]:
    row = db.get(PlatformSetting, ACCOUNTS_KEY)
    return list(row.value or []) if row else []


def set_accounts(db: Session, admin: User, value: list[dict]) -> list[dict]:
    row = db.get(PlatformSetting, ACCOUNTS_KEY)
    if row is None:
        row = PlatformSetting(key=ACCOUNTS_KEY, value=value)
        db.add(row)
    else:
        row.value = value
    db.commit()
    return value


# ---- the shop owner reports a payment ------------------------------------------------------


def report(
    db: Session,
    shop: Shop,
    user: User,
    *,
    amount: Decimal,
    method: str,
    reference: str | None,
    proof_path: str | None,
    months: int,
    note: str | None,
    paid_on: dt.date | None = None,
) -> FeePayment:
    row = FeePayment(
        paid_on=paid_on,
        organisation_id=shop.organisation_id,
        shop_id=shop.id,
        amount=money(amount),
        method=method,
        reference=reference or None,
        proof_path=proof_path,
        months=months,
        note=note or None,
        created_by=user.id,
    )
    db.add(row)
    record_audit(
        db,
        shop_id=shop.id,
        user_id=user.id,
        entity="fee_payment",
        entity_id=None,
        action="report",
        after={"amount": str(money(amount)), "method": method, "reference": reference},
    )
    db.commit()
    db.refresh(row)
    notify_admin(
        db,
        "fee_submitted_admin",
        {
            "shop": shop.name,
            "amount": f"{row.amount:,.0f}",
            "method": method,
            "reference": reference or "-",
            "months": months,
        },
    )
    db.commit()
    return row


def mine(db: Session, org_id: uuid.UUID, limit: int = 50) -> list[FeePayment]:
    return list(
        db.scalars(
            select(FeePayment)
            .where(FeePayment.organisation_id == org_id)
            .order_by(FeePayment.created_at.desc())
            .limit(limit)
        ).all()
    )


# ---- the product owner decides ---------------------------------------------------------------


def listing(db: Session, status: str | None, limit: int = 200) -> list[dict]:
    stmt = (
        select(FeePayment, Shop.name, Organisation.plan, Organisation.plan_expires_at)
        .join(Shop, Shop.id == FeePayment.shop_id)
        .join(Organisation, Organisation.id == FeePayment.organisation_id)
        .order_by(FeePayment.created_at.desc())
    )
    if status:
        stmt = stmt.where(FeePayment.status == status)
    out = []
    found = db.execute(stmt.limit(limit)).all()
    owed = dues_left_by_org(db, list({p.organisation_id for p, *_ in found}))
    for p, shop_name, plan, expires in found:
        out.append(
            {
                "id": p.id,
                "shop_id": p.shop_id,
                "shop_name": shop_name,
                "plan": plan,
                "plan_expires_at": expires,
                "amount": p.amount,
                "method": p.method,
                "reference": p.reference,
                "proof_path": p.proof_path,
                "months": p.months,
                "note": p.note,
                "status": p.status,
                "decision_note": p.decision_note,
                "created_at": p.created_at,
                "handled_at": p.handled_at,
                "paid_on": p.paid_on,
                "receipt_no": p.receipt_no,
                "to_dues": p.to_dues,
                # what this shop still owes from packages given on credit (cleared first)
                "fee_due": owed.get(p.organisation_id, Decimal(0)),
            }
        )
    return out


def _get(db: Session, payment_id: uuid.UUID) -> FeePayment:
    p = db.get(FeePayment, payment_id)
    if p is None:
        raise NotFound()
    if p.status != PENDING:
        raise Conflict(
            code="already_decided",
            message_en="This payment was already decided",
            message_ur="اس ادائیگی کا فیصلہ ہو چکا ہے",
        )
    return p


def approve(
    db: Session,
    admin: User,
    payment_id: uuid.UUID,
    months: int | None,
    *,
    to_dues: Decimal | None = None,
) -> FeePayment:
    """Marks it received. It first clears fee still unpaid from a package extended on credit
    (ADR-053; `to_dues`, all it can by default), then extends the plan by `months` — the reported
    months by default, none when the whole payment went to the unpaid fee."""
    p = _get(db, payment_id)
    org = db.get(Organisation, p.organisation_id)
    owed = dues_left(db, org.id)
    cap = min(p.amount, owed)
    part = cap if to_dues is None else max(Decimal(0), min(money(to_dues), cap))
    if months is not None:
        n = months
    else:
        n = (p.months or 1) if p.amount - part > 0 else 0
    if n:
        plans.set_plan(
            db,
            org,
            by=admin.id,
            plan=None,
            expires_on=None,
            clear_expiry=False,
            extend_months=n,
            monthly_fee=None,
            note=None,
        )
    p.to_dues = money(part)
    p.status = APPROVED
    p.months = n
    p.handled_at = utcnow()
    p.handled_by = admin.id
    p.receipt_no = p.receipt_no or next_receipt_no(db)
    if org.plan_started_at is None:
        org.plan_started_at = utcnow()
    from app.modules.plan.reminders import clear_for_org

    clear_for_org(db, org.id)
    record_audit(
        db,
        shop_id=p.shop_id,
        user_id=admin.id,
        entity="fee_payment",
        entity_id=p.id,
        action="verify",
        after={
            "amount": str(p.amount),
            "months": n,
            "to_dues": str(p.to_dues),
            "receipt_no": p.receipt_no,
            "until": str(org.plan_expires_at),
        },
    )
    db.commit()
    # tell the owner on WhatsApp (queued; sent by the Cloud API when set, else by hand)
    shop = db.get(Shop, p.shop_id)
    s = settings_for(shop)
    owner = db.scalar(
        select(User)
        .where(User.organisation_id == org.id, User.role == "owner")
        .order_by(User.created_at)
    )
    to = s.owner_whatsapp or (owner.phone if owner else None)
    if to:
        exp = org.plan_expires_at.strftime("%d-%m-%Y") if org.plan_expires_at else "-"
        queue(
            db,
            shop,
            channel=Channel.WHATSAPP,
            audience="owner",
            recipient=to,
            template_key="fee_received",
            lang=lang_for(shop, s),
            ctx={
                "shop": shop.name,
                "amount": f"{p.amount:,.0f}",
                "months": n,
                "until": exp,
                "receipt": p.receipt_no or "",
            },
            event_type="fee",
            document_type="fee_payment",
            document_id=p.id,
        )
        db.commit()
        jobs.dispatch(db)
    db.refresh(p)
    return p


def reject(db: Session, admin: User, payment_id: uuid.UUID, note: str | None) -> FeePayment:
    p = _get(db, payment_id)
    p.status = REJECTED
    p.decision_note = note
    p.handled_at = utcnow()
    p.handled_by = admin.id
    record_audit(
        db,
        shop_id=p.shop_id,
        user_id=admin.id,
        entity="fee_payment",
        entity_id=p.id,
        action="reject",
        after={"note": note},
    )
    db.commit()
    db.refresh(p)
    return p


def record_manual(
    db: Session,
    shop: Shop,
    *,
    by: User,
    amount: Decimal,
    method: str,
    months: int,
    reference: str | None,
    paid_on: dt.date | None,
    note: str | None,
    to_dues: Decimal | None = None,
) -> FeePayment:
    """A payment the provider received by hand (cash, a transfer seen in the bank app) or a
    renewal code: logged as approved and the plan extended in one step. It clears unpaid fee
    first (all it can, unless `to_dues` says otherwise; a renewal code passes 0)."""
    row = FeePayment(
        organisation_id=shop.organisation_id,
        shop_id=shop.id,
        amount=money(amount),
        method=method,
        reference=reference or None,
        months=months,
        note=note or None,
        paid_on=paid_on,
        created_by=by.id,
    )
    db.add(row)
    db.flush()
    return approve(db, by, row.id, months, to_dues=to_dues)


# ---- a package extended on credit (ADR-053) --------------------------------------------------


def _day(t: dt.datetime | None) -> dt.date | None:
    return t.date() if t else None


def extend_on_credit(
    db: Session,
    admin: User,
    shop: Shop,
    *,
    months: int,
    amount: Decimal,
    due_on: dt.date | None,
    note: str | None,
) -> FeeDue:
    """The provider extends the package now and the customer pays later (agreed by word). The
    shop never sees a "credit" option; it sees the fee as unpaid on its fees page and invoice."""
    org = shop.organisation
    start = _day(org.plan_expires_at)
    if start is None or start < shop_today():
        start = shop_today()  # an expired plan restarts from today, as set_plan does
    # added before set_plan, which commits: the extension and its unpaid fee are saved together
    due = FeeDue(
        organisation_id=org.id,
        shop_id=shop.id,
        invoice_no=_next_no(db, DUE_SEQ_KEY, "FEE"),
        months=months,
        amount=money(amount),
        period_from=start,
        due_on=due_on,
        note=note or None,
        created_by=admin.id,
    )
    db.add(due)
    plans.set_plan(
        db,
        org,
        by=admin.id,
        plan=None,
        expires_on=None,
        clear_expiry=False,
        extend_months=months,
        monthly_fee=None,
        note=None,
    )
    due.period_to = _day(org.plan_expires_at)
    if org.plan_started_at is None:
        org.plan_started_at = utcnow()
    from app.modules.plan.reminders import clear_for_org

    clear_for_org(db, org.id)
    db.flush()
    record_audit(
        db,
        shop_id=shop.id,
        user_id=admin.id,
        entity="fee_due",
        entity_id=due.id,
        action="extend_on_credit",
        after={
            "invoice_no": due.invoice_no,
            "months": months,
            "amount": str(due.amount),
            "due_on": str(due_on) if due_on else None,
            "until": str(org.plan_expires_at),
        },
    )
    db.commit()
    db.refresh(due)
    return due


def _paid_to_dues(db: Session, org_id: uuid.UUID) -> Decimal:
    v = db.scalar(
        select(func.coalesce(func.sum(FeePayment.to_dues), 0)).where(
            FeePayment.organisation_id == org_id, FeePayment.status == APPROVED
        )
    )
    return money(Decimal(str(v or 0)))


def dues_left(db: Session, org_id: uuid.UUID) -> Decimal:
    owed = db.scalar(
        select(func.coalesce(func.sum(FeeDue.amount), 0)).where(FeeDue.organisation_id == org_id)
    )
    return money(max(Decimal(0), money(Decimal(str(owed or 0))) - _paid_to_dues(db, org_id)))


def dues_left_by_org(db: Session, org_ids: list[uuid.UUID]) -> dict[uuid.UUID, Decimal]:
    """unpaid fee per organisation in two grouped queries (the admin shop list)"""
    if not org_ids:
        return {}
    owed = dict(
        db.execute(
            select(FeeDue.organisation_id, func.sum(FeeDue.amount))
            .where(FeeDue.organisation_id.in_(org_ids))
            .group_by(FeeDue.organisation_id)
        ).all()
    )
    paid = (
        dict(
            db.execute(
                select(FeePayment.organisation_id, func.sum(FeePayment.to_dues))
                .where(
                    FeePayment.organisation_id.in_(list(owed)),
                    FeePayment.status == APPROVED,
                )
                .group_by(FeePayment.organisation_id)
            ).all()
        )
        if owed
        else {}
    )
    return {
        o: money(
            max(Decimal(0), money(Decimal(str(v or 0))) - money(Decimal(str(paid.get(o) or 0))))
        )
        for o, v in owed.items()
    }


def dues(db: Session, org_id: uuid.UUID, *, for_provider: bool) -> dict:
    """Every package given on credit, oldest first, with what was paid against it (the approved
    payments' `to_dues`, applied oldest first) and what is left: unpaid / partial / paid. The
    provider's note goes only to the provider."""
    rows = list(
        db.scalars(
            select(FeeDue)
            .where(FeeDue.organisation_id == org_id)
            .order_by(FeeDue.created_at, FeeDue.invoice_no)
        ).all()
    )
    pool = _paid_to_dues(db, org_id)
    total = paid_total = Decimal(0)
    out_rows = []
    for d in rows:
        paid = min(pool, d.amount)
        pool -= paid
        left = d.amount - paid
        total += d.amount
        paid_total += paid
        row = {
            "id": d.id,
            "invoice_no": d.invoice_no,
            "months": d.months,
            "amount": d.amount,
            "paid": money(paid),
            "left": money(left),
            "status": "paid" if left <= 0 else ("partial" if paid > 0 else "unpaid"),
            "period_from": d.period_from,
            "period_to": d.period_to,
            "due_on": d.due_on,
            "overdue": bool(left > 0 and d.due_on and d.due_on < shop_today()),
            "created_at": d.created_at,
        }
        if for_provider:
            row["note"] = d.note
        out_rows.append(row)
    return {
        "rows": out_rows,
        "total": money(total),
        "paid": money(paid_total),
        "left": money(total - paid_total),
    }


def stats(db: Session) -> dict:
    """pending count and this month's approved total, for the dashboard"""
    first = shop_today().replace(day=1)
    pending = db.scalar(select(func.count(FeePayment.id)).where(FeePayment.status == PENDING))
    month = db.scalar(
        select(func.coalesce(func.sum(FeePayment.amount), 0)).where(
            FeePayment.status == APPROVED,
            FeePayment.handled_at
            >= day_start(first),  # the shop's month, not UTC's (00:00–05:00 PKT on the 1st)
        )
    )
    return {
        "pending": pending or 0,
        "month_total": money(Decimal(str(month or 0))),
        "month": first.strftime("%Y-%m"),
    }


def out(p: FeePayment) -> dict:
    return {
        "id": p.id,
        "amount": p.amount,
        "method": p.method,
        "reference": p.reference,
        "proof_path": p.proof_path,
        "months": p.months,
        "note": p.note,
        "status": p.status,
        "decision_note": p.decision_note,
        "created_at": p.created_at,
        "handled_at": p.handled_at,
        "paid_on": p.paid_on,
        "receipt_no": p.receipt_no,
        "to_dues": p.to_dues,
    }
