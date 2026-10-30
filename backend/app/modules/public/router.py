"""What the landing page needs without a login (owner 2026-10-29): plans, prices, modules, the
product owner's payment accounts, and the "open a shop for me" request that reaches the product
owner's dashboard and WhatsApp."""

import datetime as dt
import uuid

from fastapi import APIRouter
from pydantic import BaseModel, Field
from sqlalchemy import DateTime, ForeignKey, String, Text, Uuid, select
from sqlalchemy.orm import Mapped, mapped_column

from app.core.config import settings
from app.core.pk import normalise_phone
from app.core.ratelimit import login_limiter
from app.core.tenancy import DB
from app.db.base import Base, UUIDPk, utcnow
from app.modules.admin import fees, modules
from app.modules.admin.access import _home_shop
from app.modules.auth.models import User
from app.modules.notifications import jobs, provider
from app.modules.notifications.models import Channel
from app.modules.notifications.service import queue

router = APIRouter(prefix="/api/v1/public", tags=["public"])

# PKR per month; the trial is free (owner 2026-10-29). Changed here until a settings screen exists.
PLAN_PRICES = {"trial": 0, "basic": 1500, "pro": 3000, "chain": 6000}
TRIAL_DAYS = 14


class ShopRequest(UUIDPk, Base):
    """A shopkeeper asking for a shop from the landing page."""

    __tablename__ = "shop_requests"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    shop_name: Mapped[str] = mapped_column(String(200), nullable=False)
    city: Mapped[str | None] = mapped_column(String(100))
    phone: Mapped[str] = mapped_column(String(20), nullable=False)
    plan: Mapped[str] = mapped_column(String(20), nullable=False)
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    handled_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))
    handled_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )


class RequestIn(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    shop_name: str = Field(min_length=2, max_length=200)
    city: str | None = Field(default=None, max_length=100)
    phone: str
    plan: str = Field(default="trial", pattern="^(trial|basic|pro|chain)$")
    note: str | None = Field(default=None, max_length=500)


@router.get("/info")
def info(db: DB):
    """plans with prices and modules, module names, the accounts to pay into, the contact"""
    return {
        "plans": [
            {"key": k, "price": PLAN_PRICES.get(k, 0), "modules": v}
            for k, v in modules.PLAN_DEFAULTS.items()
        ],
        "trial_days": TRIAL_DAYS,
        "modules": modules.MODULES,
        "accounts": fees.accounts(db),
        "whatsapp": settings.admin_whatsapp
        or (min(settings.superusers) if settings.superusers else None),
        "signup_otp": settings.signup_otp,
        "otp_available": settings.otp_dev_echo or provider.configured(),
    }


@router.post("/shop-requests", status_code=201)
def request_shop(data: RequestIn, db: DB):
    try:
        phone = normalise_phone(data.phone)
    except ValueError:
        from app.core.errors import ValidationFailed

        raise ValidationFailed(
            "bad_phone", "Enter a valid Pakistani mobile number", "درست پاکستانی موبائل نمبر لکھیں"
        ) from None
    key = f"shop-request:{phone}"
    login_limiter.check(key)
    login_limiter.fail(key)
    req = ShopRequest(
        name=data.name.strip(),
        shop_name=data.shop_name.strip(),
        city=(data.city or "").strip() or None,
        phone=phone,
        plan=data.plan,
        note=(data.note or "").strip() or None,
    )
    db.add(req)
    db.flush()
    # the product owner hears about it on WhatsApp (queued through their own shop's outbox)
    admin_phone = settings.admin_whatsapp or (
        min(settings.superusers) if settings.superusers else None
    )
    admin = (
        db.scalar(select(User).where(User.phone.in_(list(settings.superusers))))
        if settings.superusers
        else None
    )
    home = _home_shop(db, admin) if admin else None
    if admin_phone and home is not None:
        queue(
            db,
            home,
            channel=Channel.WHATSAPP,
            audience="admin",
            recipient=admin_phone,
            template_key="shop_request_admin",
            lang="en",
            ctx={
                "name": req.name,
                "shop": req.shop_name,
                "city": req.city or "-",
                "phone": req.phone,
                "plan": req.plan,
            },
            event_type="shop_request",
            document_type="shop_request",
            document_id=req.id,
        )
    db.commit()
    jobs.dispatch(db)
    return {"id": str(req.id), "ok": True}
