import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.errors import NotFound
from app.core.permissions import Cap
from app.core.tenancy import DB, Ctx, require_cap
from app.db.base import utcnow
from app.modules.audit.service import record_audit
from app.modules.notifications import service
from app.modules.notifications.models import Message, MessageStatus
from app.modules.notifications.schemas import MessageOut, NotificationSettings

router = APIRouter(prefix="/api/v1/notifications", tags=["notifications"])
Settings = Annotated[Ctx, Depends(require_cap(Cap.MANAGE_SETTINGS))]


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


@router.get("", response_model=list[MessageOut])
def list_messages(
    ctx: Ctx,
    db: DB,
    status: MessageStatus | None = None,
    audience: str | None = Query(default=None, pattern="^(owner|customer)$"),
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
