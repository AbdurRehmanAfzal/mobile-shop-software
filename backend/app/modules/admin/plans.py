"""Plans and fees (owner 2026-10-29, selling the software): every organisation has a plan, a monthly
fee and an expiry. The app warns the owner from 7 days before; after the expiry plus a grace period
the API refuses changes (reads still work) until the product owner extends it. No expiry = unlimited
(every shop opened before this existed)."""

import datetime as dt
import uuid
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import Forbidden
from app.core.permissions import Role
from app.db.base import utcnow
from app.modules.audit.service import record_audit
from app.modules.auth.models import Organisation, Shop, User, UserShop
from app.modules.ledger.service import ensure_default_cash_account

PLANS = ("trial", "basic", "pro", "chain")
WARN_DAYS = 7
GRACE_DAYS = 15


def days_left(org: Organisation, now: dt.datetime | None = None) -> int | None:
    if org.plan_expires_at is None:
        return None
    now = now or utcnow()
    exp = org.plan_expires_at
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=dt.UTC)
    return (exp.date() - now.astimezone(dt.UTC).date()).days


def status_of(org: Organisation, now: dt.datetime | None = None) -> str:
    """unlimited | ok | due_soon | expired (in grace) | locked"""
    left = days_left(org, now)
    if left is None:
        return "unlimited"
    if left < -GRACE_DAYS:
        return "locked"
    if left < 0:
        return "expired"
    if left <= WARN_DAYS:
        return "due_soon"
    return "ok"


def plan_info(org: Organisation, now: dt.datetime | None = None) -> dict:
    return {
        "plan": org.plan,
        "expires_at": org.plan_expires_at,
        "days_left": days_left(org, now),
        "monthly_fee": org.monthly_fee,
        "status": status_of(org, now),
        "grace_days": GRACE_DAYS,
    }


def assert_writable(org: Organisation, method: str, now: dt.datetime | None = None) -> None:
    """Called for every request with a shop context: a locked plan may only read."""
    if method in ("GET", "HEAD", "OPTIONS"):
        return
    if status_of(org, now) == "locked":
        raise Forbidden(
            code="plan_expired",
            message_en="The subscription has expired. Contact the software provider to renew.",
            message_ur="سبسکرپشن ختم ہو گئی ہے۔ تجدید کے لیے سافٹ ویئر فراہم کنندہ سے رابطہ کریں۔",
        )


def set_plan(
    db: Session,
    org: Organisation,
    *,
    by: uuid.UUID,
    plan: str | None,
    expires_on: dt.date | None,
    clear_expiry: bool,
    extend_months: int | None,
    monthly_fee: Decimal | None,
    note: str | None,
) -> Organisation:
    before = plan_info(org)
    if plan is not None:
        org.plan = plan
    if monthly_fee is not None:
        org.monthly_fee = monthly_fee
    if note is not None:
        org.fee_note = note or None
    if clear_expiry:
        org.plan_expires_at = None
    elif expires_on is not None:
        org.plan_expires_at = dt.datetime.combine(expires_on, dt.time(23, 59), tzinfo=dt.UTC)
    if extend_months:
        # from today or from the current expiry, whichever is later (paying early keeps the days)
        base = org.plan_expires_at
        today = utcnow()
        if base is None or (base.replace(tzinfo=base.tzinfo or dt.UTC) < today):
            base = today
        if base.tzinfo is None:
            base = base.replace(tzinfo=dt.UTC)
        org.plan_expires_at = _add_months(base, extend_months)
    shop = db.scalar(select(Shop).where(Shop.organisation_id == org.id).order_by(Shop.created_at))
    record_audit(
        db,
        shop_id=shop.id,
        user_id=by,
        entity="organisation",
        entity_id=org.id,
        action="plan",
        before={k: str(v) for k, v in before.items()},
        after={k: str(v) for k, v in plan_info(org).items()},
    )
    db.commit()
    db.refresh(org)
    return org


def _add_months(at: dt.datetime, months: int) -> dt.datetime:
    month = at.month - 1 + months
    year = at.year + month // 12
    month = month % 12 + 1
    last = (dt.date(year + (month // 12), month % 12 + 1, 1) - dt.timedelta(days=1)).day
    return at.replace(year=year, month=month, day=min(at.day, last), hour=23, minute=59)


def add_branch(
    db: Session,
    org: Organisation,
    *,
    by: uuid.UUID,
    name: str,
    name_ur: str | None,
    city: str | None,
) -> Shop:
    """Another shop of the same owner: every owner of the organisation can open it from the same
    login (More → Shops), with its own stock, khata and numbers."""
    first = db.scalar(select(Shop).where(Shop.organisation_id == org.id).order_by(Shop.created_at))
    shop = Shop(
        organisation_id=org.id,
        name=name,
        name_ur=name_ur,
        city=city or (first.city if first else None),
        phone=first.phone if first else None,
        default_locale=first.default_locale if first else "ur",
    )
    db.add(shop)
    db.flush()
    owners = db.scalars(
        select(User).where(User.organisation_id == org.id, User.role == Role.OWNER)
    ).all()
    for u in owners:
        db.add(UserShop(user_id=u.id, shop_id=shop.id))
    ensure_default_cash_account(db, shop.id)
    record_audit(
        db, shop_id=shop.id, user_id=by, entity="shop", entity_id=shop.id, action="create_branch"
    )
    db.commit()
    db.refresh(shop)
    return shop
