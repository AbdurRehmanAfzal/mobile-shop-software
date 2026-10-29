"""Super admin support (owner 2026-10-29): open any customer shop, set a shop owner's password when
they forgot it, and the "forgot password" requests from the login page. An owner's request goes to
the product owner (dashboard + WhatsApp); a staff member's request goes to their shop owner
(Messages + WhatsApp), who resets it in More → Staff."""

import datetime as dt
import uuid

from sqlalchemy import DateTime, ForeignKey, String, Uuid, select
from sqlalchemy.orm import Mapped, Session, mapped_column

from app.core.config import settings
from app.core.errors import NotFound
from app.core.permissions import Role
from app.core.security import hash_password
from app.db.base import Base, UUIDPk, utcnow
from app.modules.audit.service import record_audit
from app.modules.auth.models import Shop, User, UserShop
from app.modules.notifications import jobs
from app.modules.notifications.models import Channel
from app.modules.notifications.service import lang_for, queue, settings_for


class PasswordRequest(UUIDPk, Base):
    __tablename__ = "password_requests"

    shop_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("shops.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    sent_to: Mapped[str] = mapped_column(String(10), nullable=False)  # admin | owner
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    handled_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))
    handled_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )


def admin_whatsapp() -> str | None:
    """where an owner's request goes: ADMIN_WHATSAPP, else the first super user number"""
    if settings.admin_whatsapp:
        return settings.admin_whatsapp
    nums = sorted(settings.superusers)
    return nums[0] if nums else None


def _home_shop(db: Session, user: User) -> Shop:
    shop = db.scalar(
        select(Shop)
        .join(UserShop, UserShop.shop_id == Shop.id)
        .where(UserShop.user_id == user.id)
        .order_by(Shop.created_at)
    )
    return shop or db.scalar(
        select(Shop).where(Shop.organisation_id == user.organisation_id).order_by(Shop.created_at)
    )


def enter_shop(db: Session, admin: User, shop_id: uuid.UUID) -> Shop:
    shop = db.get(Shop, shop_id)
    if shop is None or not shop.is_active:
        raise NotFound()
    record_audit(
        db,
        shop_id=shop.id,
        user_id=admin.id,
        entity="shop",
        entity_id=shop.id,
        action="super_admin_access",
    )
    db.commit()
    return shop


def set_password(
    db: Session, admin: User, shop_id: uuid.UUID, password: str, user_id: uuid.UUID | None
) -> User:
    """The shop owner's password (or one user of that organisation); open requests are closed."""
    shop = db.get(Shop, shop_id)
    if shop is None:
        raise NotFound()
    if user_id is not None:
        user = db.get(User, user_id)
        if user is None or user.organisation_id != shop.organisation_id:
            raise NotFound()
    else:
        user = db.scalar(
            select(User)
            .where(User.organisation_id == shop.organisation_id, User.role == Role.OWNER)
            .order_by(User.created_at)
        )
        if user is None:
            raise NotFound()
    user.password_hash = hash_password(password)
    now = utcnow()
    for req in db.scalars(
        select(PasswordRequest).where(
            PasswordRequest.user_id == user.id, PasswordRequest.handled_at.is_(None)
        )
    ).all():
        req.handled_at = now
        req.handled_by = admin.id
    record_audit(
        db,
        shop_id=shop.id,
        user_id=admin.id,
        entity="user",
        entity_id=user.id,
        action="password_set_by_admin",
    )
    db.commit()
    db.refresh(user)
    return user


def forgot(db: Session, phone: str) -> str:
    """'admin' | 'owner' | 'none': whom the request went to."""
    user = db.scalar(select(User).where(User.phone == phone, User.is_active.is_(True)))
    if user is None:
        return "none"
    shop = _home_shop(db, user)
    if shop is None:
        return "none"
    to_admin = user.role == Role.OWNER
    req = PasswordRequest(
        shop_id=shop.id,
        user_id=user.id,
        name=user.name,
        phone=user.phone,
        role=user.role,
        sent_to="admin" if to_admin else "owner",
    )
    db.add(req)
    ctx = {"shop": shop.name, "name": user.name, "phone": user.phone}
    if to_admin:
        recipient = admin_whatsapp()
        if recipient:
            queue(
                db,
                shop,
                channel=Channel.WHATSAPP,
                audience="admin",
                recipient=recipient,
                template_key="password_request_admin",
                lang="en",
                ctx=ctx,
                event_type="password_request",
                document_type=None,
                document_id=req.id,
            )
    else:
        owner = db.scalar(
            select(User)
            .where(User.organisation_id == user.organisation_id, User.role == Role.OWNER)
            .order_by(User.created_at)
        )
        recipient = settings_for(shop).owner_whatsapp or (owner.phone if owner else None)
        if recipient:
            queue(
                db,
                shop,
                channel=Channel.WHATSAPP,
                audience="owner",
                recipient=recipient,
                template_key="password_request_owner",
                lang=lang_for(shop),
                ctx=ctx,
                event_type="password_request",
                document_type=None,
                document_id=req.id,
            )
    db.commit()
    jobs.dispatch(db)
    return "admin" if to_admin else "owner"


def list_requests(db: Session, open_only: bool) -> list[dict]:
    stmt = (
        select(PasswordRequest, Shop.name)
        .join(Shop, Shop.id == PasswordRequest.shop_id)
        .order_by(PasswordRequest.created_at.desc())
    )
    if open_only:
        stmt = stmt.where(PasswordRequest.handled_at.is_(None))
    out = []
    for req, shop_name in db.execute(stmt.limit(200)).all():
        out.append(
            {
                "id": req.id,
                "shop_id": req.shop_id,
                "shop_name": shop_name,
                "user_id": req.user_id,
                "name": req.name,
                "phone": req.phone,
                "role": req.role,
                "sent_to": req.sent_to,
                "created_at": req.created_at,
                "handled_at": req.handled_at,
            }
        )
    return out


def mark_done(db: Session, admin: User, req_id: uuid.UUID) -> None:
    req = db.get(PasswordRequest, req_id)
    if req is None:
        raise NotFound()
    req.handled_at = utcnow()
    req.handled_by = admin.id
    db.commit()
