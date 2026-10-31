"""Price rules (owner 2026-10-30, anti-fraud): who may sell below the asking price and who may
change the asking price. Per shop, three settings each:

    allow    anyone
    manager  owner or manager (their login), others refused
    pin      owner or manager by login; anyone else with the owner's PIN typed on the spot

Owner and manager always pass. An approval by PIN is recorded as `approved_by` on the event and
the sale, so the owner sees who stood behind it."""

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.core.permissions import Cap
from app.core.ratelimit import FailureLimiter
from app.core.security import verify_password
from app.modules.audit.service import record_audit
from app.modules.auth.models import Shop, User

RULES = ("allow", "manager", "pin")
KEYS = ("below_asking", "asking_change")
DEFAULT_RULES = {"below_asking": "manager", "asking_change": "manager"}
pin_limiter = FailureLimiter(max_failures=5, window_seconds=600)


class ApprovalRequired(AppError):
    status_code = 403
    code = "approval_required"
    message_en = "Only the owner or manager can do this (price below asking / asking price change)"
    message_ur = "یہ صرف مالک یا منیجر کر سکتا ہے (طے قیمت سے کم بیچنا / طے قیمت بدلنا)"


class PinRequired(AppError):
    status_code = 409
    code = "pin_required"
    message_en = "The owner's PIN is needed for this price"
    message_ur = "اس قیمت کے لیے مالک کا پن چاہیے"


class PinWrong(AppError):
    status_code = 403
    code = "pin_wrong"
    message_en = "Wrong owner PIN"
    message_ur = "مالک کا پن غلط ہے"


def rules_for(shop: Shop) -> dict:
    raw = shop.sale_rules or {}
    return {k: (raw.get(k) if raw.get(k) in RULES else DEFAULT_RULES[k]) for k in KEYS}


def clean_rules(raw: dict | None) -> dict | None:
    if raw is None:
        return None
    out = {}
    for k in KEYS:
        v = raw.get(k, DEFAULT_RULES[k])
        if v not in RULES:
            raise ValueError(f"{k} must be one of {RULES}")
        out[k] = v
    return out


def require(db: Session, shop: Shop, ctx, key: str, pin: str | None) -> uuid.UUID | None:
    """Returns the approving owner's id when a PIN was used; None when the role itself allows it.
    Raises when the rule refuses."""
    rule = rules_for(shop)[key]
    if rule == "allow" or ctx.can(Cap.VIEW_COST):
        return None
    if rule == "manager":
        raise ApprovalRequired()
    if not pin:
        raise PinRequired()
    key_ = f"pin:{shop.id}"
    pin_limiter.check(key_)
    owners = db.scalars(
        select(User).where(
            User.organisation_id == shop.organisation_id,
            User.role == "owner",
            User.is_active.is_(True),
            User.pin_hash.is_not(None),
        )
    ).all()
    for owner in owners:
        if verify_password(pin, owner.pin_hash):
            pin_limiter.reset(key_)
            return owner.id
    pin_limiter.fail(key_)
    record_audit(
        db,
        shop_id=shop.id,
        user_id=ctx.id,
        entity="approval",
        entity_id=None,
        action="pin_wrong",
        after={"for": key},
    )
    db.commit()
    raise PinWrong()
