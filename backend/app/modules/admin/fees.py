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


RECEIPT_SEQ_KEY = "receipt_seq"


def next_receipt_no(db: Session) -> str:
    """SUB-0001, SUB-0002 … across every shop (the provider's own numbering)."""
    row = db.get(PlatformSetting, RECEIPT_SEQ_KEY)
    n = int((row.value or {}).get("next", 1)) if row and isinstance(row.value, dict) else 1
    if row is None:
        db.add(PlatformSetting(key=RECEIPT_SEQ_KEY, value={"next": n + 1}))
    else:
        row.value = {"next": n + 1}
    db.flush()
    return f"SUB-{n:04d}"


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
    for p, shop_name, plan, expires in db.execute(stmt.limit(limit)).all():
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


def approve(db: Session, admin: User, payment_id: uuid.UUID, months: int | None) -> FeePayment:
    """Marks it received and extends the plan by `months` (the reported months by default)."""
    p = _get(db, payment_id)
    org = db.get(Organisation, p.organisation_id)
    n = months or p.months or 1
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
) -> FeePayment:
    """A payment the provider received by hand (cash, a transfer seen in the bank app) or a
    renewal code: logged as approved and the plan extended in one step."""
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
    return approve(db, by, row.id, months)


def stats(db: Session) -> dict:
    """pending count and this month's approved total, for the dashboard"""
    first = shop_today().replace(day=1)
    pending = db.scalar(select(func.count(FeePayment.id)).where(FeePayment.status == PENDING))
    month = db.scalar(
        select(func.coalesce(func.sum(FeePayment.amount), 0)).where(
            FeePayment.status == APPROVED,
            FeePayment.handled_at >= dt.datetime.combine(first, dt.time.min, tzinfo=dt.UTC),
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
    }
