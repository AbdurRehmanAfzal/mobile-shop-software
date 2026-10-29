import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.clock import today as jobs_today
from app.core.errors import NotFound, ValidationFailed
from app.core.permissions import Cap
from app.core.tenancy import DB, Ctx, require_cap
from app.db.base import utcnow
from app.modules.audit.service import record_audit
from app.modules.notifications import jobs, provider, service
from app.modules.notifications.models import Message, MessageStatus
from app.modules.notifications.schemas import (
    MessageOut,
    NotificationSettings,
    ReminderRow,
    RemindIn,
)

router = APIRouter(prefix="/api/v1/notifications", tags=["notifications"])
Settings = Annotated[Ctx, Depends(require_cap(Cap.MANAGE_SETTINGS))]
Transact = Annotated[Ctx, Depends(require_cap(Cap.TRANSACT))]


@router.get("/settings", response_model=NotificationSettings)
def get_settings(ctx: Settings):
    return service.settings_for(ctx.shop)


@router.put("/settings", response_model=NotificationSettings)
def put_settings(data: NotificationSettings, ctx: Settings, db: DB):
    shop = ctx.shop
    before = shop.notification_settings
    shop.notification_settings = data.model_dump(mode="json")
    record_audit(
        db,
        shop_id=shop.id,
        user_id=ctx.id,
        entity="shop",
        entity_id=shop.id,
        action="notification_settings",
        before=before,
        after=shop.notification_settings,
    )
    db.commit()
    return data


@router.get("/provider")
def provider_status(ctx: Ctx):
    """whether messages go out by themselves (Cloud API set on the server) or by hand"""
    return {"whatsapp_api": provider.configured()}


@router.get("/reminders", response_model=list[ReminderRow])
def reminders(ctx: Transact, db: DB, min_days: int = Query(default=0, ge=0, le=365)):
    return jobs.reminder_rows(db, ctx.shop, min_days=min_days)


@router.post("/reminders", response_model=list[MessageOut])
def send_reminders(data: RemindIn, ctx: Transact, db: DB):
    """Queue reminders for the chosen customers (all due ones when none are named); sent at once
    when the Cloud API is set, otherwise each row carries its wa.me link."""
    msgs = jobs.queue_reminders(db, ctx.shop, party_ids=data.party_ids, min_days=data.min_days)
    db.commit()
    ids = [m.id for m in msgs]
    jobs.dispatch(db)
    return [db.get(Message, i) for i in ids]


@router.post("/daily-report", response_model=MessageOut)
def daily_report_now(ctx: Settings, db: DB):
    """today's hisaab to the owner's WhatsApp, right now"""
    msg = jobs.queue_daily_report(db, ctx.shop, jobs_today())
    if msg is None:
        raise ValidationFailed(
            "no_owner_whatsapp",
            "Set the owner's WhatsApp number first",
            "پہلے مالک کا واٹس ایپ نمبر لکھیں",
        )
    db.commit()
    mid = msg.id
    jobs.dispatch(db)
    return db.get(Message, mid)


@router.get("", response_model=list[MessageOut])
def list_messages(
    ctx: Ctx,
    db: DB,
    status: MessageStatus | None = None,
    audience: str | None = Query(default=None, pattern="^(owner|customer|admin)$"),
    limit: int = Query(default=100, le=500),
):
    return service.list_messages(db, ctx.shop_id, status=status, audience=audience, limit=limit)


@router.post("/{message_id}/mark-sent", response_model=MessageOut)
def mark_sent(message_id: uuid.UUID, ctx: Ctx, db: DB):
    """The UI opened the wa.me link and the user sent it by hand."""
    m = db.get(Message, message_id)
    if m is None or m.shop_id != ctx.shop_id:
        raise NotFound(code="message_not_found")
    m.status = MessageStatus.SENT
    m.sent_at = utcnow()
    m.provider = "manual"
    db.commit()
    return m
