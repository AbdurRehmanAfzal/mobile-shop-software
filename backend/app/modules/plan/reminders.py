"""The reminder schedule (docs/19 §B–D): which stage a plan is in, whether the popup may show now,
the snooze choices that stay before the expiry, and the server-side snooze state per user."""

import datetime as dt
import uuid
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ValidationFailed
from app.core.permissions import Cap
from app.modules.admin import plans
from app.modules.admin.fees import APPROVED, PENDING, FeePayment
from app.modules.audit.service import record_audit
from app.modules.auth.models import Organisation, Shop, User
from app.modules.plan import billing, clockguard
from app.modules.plan.models import PlanReminderState

STAGES = ("none", "info", "warn", "urgent", "grace", "locked")
# the spec's four words for the subscription itself
STATE = {
    "none": "ACTIVE",
    "info": "EXPIRING_SOON",
    "warn": "EXPIRING_SOON",
    "urgent": "EXPIRING_SOON",
    "grace": "GRACE",
    "locked": "EXPIRED",
}
TONE = {
    "none": None,
    "info": "yellow",
    "warn": "orange",
    "urgent": "red",
    "grace": "red",
    "locked": "locked",
}
SNOOZE_OPTIONS = ("4h", "tomorrow", "3d")


def stage_of(org: Organisation, sched: dict, now: dt.datetime) -> tuple[str, int | None, int]:
    """(stage, days_left, grace_days)"""
    grace = plans.grace_for(org, sched)
    left = plans.days_left(org, now)
    if left is None:
        return "none", None, grace
    if left < -grace:
        return "locked", left, grace
    if left < 0:
        return "grace", left, grace
    if left <= sched["urgent_days"]:
        return "urgent", left, grace
    if left <= sched["warn_days"]:
        return "warn", left, grace
    if left <= sched["info_days"]:
        return "info", left, grace
    return "none", left, grace


def _state(db: Session, org_id: uuid.UUID, user_id: uuid.UUID) -> PlanReminderState:
    row = db.scalar(select(PlanReminderState).where(PlanReminderState.user_id == user_id))
    if row is None:
        row = PlanReminderState(organisation_id=org_id, user_id=user_id)
        db.add(row)
        db.flush()
    return row


def _local_day(at: dt.datetime | None, tz: str) -> dt.date | None:
    if at is None:
        return None
    if at.tzinfo is None:
        at = at.replace(tzinfo=dt.UTC)
    return at.astimezone(ZoneInfo(tz or "Asia/Karachi")).date()


def _expiry_date(org: Organisation) -> dt.date | None:
    exp = org.plan_expires_at
    if exp is None:
        return None
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=dt.UTC)
    return exp.astimezone(dt.UTC).date()


def snooze_options(stage: str, org: Organisation, now: dt.datetime) -> list[str]:
    """Only choices that end before the expiry; near the expiry only "a few hours"."""
    if stage in ("none", "info"):
        return []
    if stage in ("urgent", "locked"):
        return ["4h"]
    if stage == "grace":
        return ["4h", "tomorrow"]
    # warn: 4h, tomorrow, 3 days — but never past the expiry day
    exp = _expiry_date(org)
    today = now.astimezone(dt.UTC).date()
    out = ["4h"]
    if exp is None or today + dt.timedelta(days=1) < exp:
        out.append("tomorrow")
    if exp is None or today + dt.timedelta(days=3) < exp:
        out.append("3d")
    return out


def snooze_until(option: str, now: dt.datetime, sched: dict, tz: str) -> dt.datetime:
    if option == "4h":
        return now + dt.timedelta(hours=int(sched.get("snooze_hours", 4)))
    local = now.astimezone(ZoneInfo(tz or "Asia/Karachi"))
    days = 1 if option == "tomorrow" else 3
    start = (local + dt.timedelta(days=days)).replace(hour=8, minute=0, second=0, microsecond=0)
    return start.astimezone(dt.UTC)


def pending_payment(db: Session, org_id: uuid.UUID) -> FeePayment | None:
    return db.scalar(
        select(FeePayment)
        .where(FeePayment.organisation_id == org_id, FeePayment.status == PENDING)
        .order_by(FeePayment.created_at.desc())
    )


def last_approved(db: Session, org_id: uuid.UUID) -> FeePayment | None:
    return db.scalar(
        select(FeePayment)
        .where(FeePayment.organisation_id == org_id, FeePayment.status == APPROVED)
        .order_by(FeePayment.handled_at.desc())
    )


def _note_lock_transition(db: Session, shop: Shop, org: Organisation, stage: str, user_id) -> None:
    """Audit the moment a shop locks or comes back (docs/19 §G)."""
    locked_now = stage == "locked"
    was = org.plan_status_seen
    if was == ("locked" if locked_now else "open"):
        return
    if was is not None or locked_now:
        record_audit(
            db,
            shop_id=shop.id,
            user_id=user_id,
            entity="organisation",
            entity_id=org.id,
            action="lock" if locked_now else "unlock",
            after={"stage": stage, "expires_at": str(org.plan_expires_at)},
        )
    org.plan_status_seen = "locked" if locked_now else "open"
    db.commit()


def status(db: Session, ctx, *, event: str = "open") -> dict:
    """Everything the bar, the popup and the lock screen need, for this user, right now."""
    shop: Shop = ctx.shop
    org: Organisation = shop.organisation
    user: User = ctx.user
    now = clockguard.now(db)
    sched = billing.schedule(db)
    stage, left, grace = stage_of(org, sched, now)
    _note_lock_transition(db, shop, org, stage, user.id)
    money_side = ctx.can(Cap.MANAGE_SETTINGS) or ctx.can(Cap.VIEW_COST)
    pend = pending_payment(db, org.id)
    paid = last_approved(db, org.id)
    st = _state(db, org.id, user.id)

    show = False
    if money_side and stage in ("warn", "urgent", "grace", "locked") and pend is None:
        snoozed = st.stage == stage and (
            st.snoozed_until is not None
            and st.snoozed_until.replace(tzinfo=st.snoozed_until.tzinfo or dt.UTC) > now
        )
        # moving to a more urgent stage shows the popup again even if it was shown today
        escalated = st.stage is not None and STAGES.index(stage) > STAGES.index(st.stage)
        if not snoozed:
            last = (
                st.last_shown_at.replace(tzinfo=st.last_shown_at.tzinfo or dt.UTC)
                if st.last_shown_at
                else None
            )
            if escalated:
                show = True
            elif stage == "warn":  # once a day
                show = _local_day(st.last_shown_at, shop.timezone) != _local_day(now, shop.timezone)
            else:  # urgent / grace / locked: on login, or again after a few hours
                hours = int(sched.get("snooze_hours", 4))
                show = event == "login" or last is None or now - last >= dt.timedelta(hours=hours)
    renewed = None
    if paid is not None and money_side and st.thanked_payment_id != paid.id:
        renewed = {
            "payment_id": str(paid.id),
            "until": org.plan_expires_at,
            "receipt_no": paid.receipt_no,
            "amount": f"{paid.amount:.2f}",
        }
    options = snooze_options(stage, org, now)
    return {
        "stage": stage,
        "state": STATE[stage],
        "tone": "blue" if (pend is not None and stage != "locked") else TONE[stage],
        "days_left": left,
        "grace_days": grace,
        "expires_at": org.plan_expires_at,
        "plan": org.plan,
        "amount_due": f"{org.monthly_fee:.2f}",
        "currency": "PKR",
        "last_payment_at": paid.handled_at if paid else None,
        "pending_payment": (
            {"id": str(pend.id), "amount": f"{pend.amount:.2f}", "created_at": pend.created_at}
            if pend
            else None
        ),
        "show_popup": show,
        "snooze_options": options,
        "close_option": ("tomorrow" if stage == "warn" and "tomorrow" in options else "4h")
        if options
        else None,
        "snoozed_until": st.snoozed_until,
        "audience": "owner" if money_side else "staff",
        "billing": billing.for_shopkeeper(db) if money_side else None,
        "renewed": renewed,
        "clock_rolled_back": clockguard.rolled_back(),
        "shop_name": shop.name,
    }


def mark_shown(db: Session, ctx) -> None:
    st = _state(db, ctx.shop.organisation_id, ctx.user.id)
    now = clockguard.now(db)
    st.last_shown_at = now
    stage = stage_of(ctx.shop.organisation, billing.schedule(db), now)[0]
    if st.stage != stage:  # a snooze taken in a calmer stage ends when the popup escalates
        st.snoozed_until = None
        st.stage = stage
    db.commit()


def snooze(db: Session, ctx, option: str) -> dt.datetime:
    shop: Shop = ctx.shop
    org: Organisation = shop.organisation
    now = clockguard.now(db)
    sched = billing.schedule(db)
    stage, _left, _grace = stage_of(org, sched, now)
    allowed = snooze_options(stage, org, now)
    if option not in allowed:
        raise ValidationFailed(
            code="snooze_not_allowed",
            message_en="That reminder choice is not available this close to the expiry",
            message_ur="میعاد کے اتنے قریب یہ انتخاب دستیاب نہیں",
            details={"allowed": allowed},
        )
    until = snooze_until(option, now, sched, shop.timezone)
    st = _state(db, org.id, ctx.user.id)
    st.stage = stage
    st.snoozed_until = until
    st.last_shown_at = now
    st.times_snoozed = (st.times_snoozed or 0) + 1
    record_audit(
        db,
        shop_id=shop.id,
        user_id=ctx.user.id,
        entity="plan_reminder",
        entity_id=st.id,
        action="snooze",
        after={"stage": stage, "option": option, "until": until.isoformat()},
    )
    db.commit()
    return until


def thanks_seen(db: Session, ctx, payment_id: uuid.UUID) -> None:
    st = _state(db, ctx.shop.organisation_id, ctx.user.id)
    st.thanked_payment_id = payment_id
    db.commit()


def clear_for_org(db: Session, org_id: uuid.UUID) -> None:
    """A renewal clears every snooze of the organisation (docs/19 §E)."""
    for st in db.scalars(
        select(PlanReminderState).where(PlanReminderState.organisation_id == org_id)
    ).all():
        st.snoozed_until = None
        st.last_shown_at = None
        st.stage = None
