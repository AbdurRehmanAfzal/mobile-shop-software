import uuid
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import Conflict, NotFound, Unauthorized, ValidationFailed
from app.core.permissions import Role
from app.core.security import create_token, decode_token, hash_password, hash_pin, verify_password
from app.db.base import utcnow
from app.modules.audit.service import record_audit
from app.modules.auth.models import Organisation, Shop, User, UserShop
from app.modules.auth.schemas import (
    ShopCreate,
    ShopUpdate,
    SignupRequest,
    StaffCreate,
    StaffUpdate,
    TokenPair,
)


def _tokens(user: User) -> TokenPair:
    return TokenPair(
        access_token=create_token(user.id, user.organisation_id, "access"),
        refresh_token=create_token(user.id, user.organisation_id, "refresh"),
    )


def phone_taken(db: Session, phone: str) -> bool:
    return db.scalar(select(User.id).where(User.phone == phone)) is not None


def signup(db: Session, data: SignupRequest) -> tuple[User, TokenPair]:
    if phone_taken(db, data.phone):
        raise Conflict(
            code="phone_taken",
            message_en="This phone number is already registered",
            message_ur="یہ فون نمبر پہلے سے رجسٹرڈ ہے",
        )
    org = Organisation(name=data.shop_name)
    shop = Shop(
        organisation=org,
        name=data.shop_name,
        name_ur=data.shop_name_ur,
        city=data.city,
        phone=data.phone,
        default_locale=data.locale,
    )
    user = User(
        organisation=org,
        name=data.owner_name,
        phone=data.phone,
        email=str(data.email) if data.email else None,
        password_hash=hash_password(data.password),
        role=Role.OWNER,
        locale=data.locale,
        last_login_at=utcnow(),
    )
    db.add_all([org, shop, user])
    db.flush()
    db.add(UserShop(user_id=user.id, shop_id=shop.id))
    record_audit(
        db, shop_id=shop.id, user_id=user.id, entity="shop", entity_id=shop.id, action="create"
    )
    db.commit()
    return user, _tokens(user)


def login(db: Session, phone: str, password: str) -> tuple[User, TokenPair]:
    user = db.scalar(select(User).where(User.phone == phone))
    if user is None or not verify_password(password, user.password_hash):
        raise Unauthorized(
            code="bad_credentials",
            message_en="Wrong phone number or password",
            message_ur="فون نمبر یا پاس ورڈ غلط ہے",
        )
    if not user.is_active:
        raise Unauthorized(
            code="user_inactive", message_en="Account disabled", message_ur="اکاؤنٹ بند ہے"
        )
    user.last_login_at = utcnow()
    db.commit()
    return user, _tokens(user)


def refresh(db: Session, refresh_token: str) -> tuple[User, TokenPair]:
    payload = decode_token(refresh_token, "refresh")
    user = db.get(User, uuid.UUID(payload["sub"]))
    if user is None or not user.is_active:
        raise Unauthorized(code="user_inactive")
    return user, _tokens(user)


def shops_for_user(db: Session, user_id: uuid.UUID) -> list[Shop]:
    return list(
        db.scalars(
            select(Shop)
            .join(UserShop, UserShop.shop_id == Shop.id)
            .where(UserShop.user_id == user_id)
            .order_by(Shop.created_at)
        ).all()
    )


# ---- shops -----------------------------------------------------------------


def create_shop(db: Session, owner: User, data: ShopCreate) -> Shop:
    shop = Shop(organisation_id=owner.organisation_id, **data.model_dump())
    db.add(shop)
    db.flush()
    db.add(UserShop(user_id=owner.id, shop_id=shop.id))
    record_audit(
        db, shop_id=shop.id, user_id=owner.id, entity="shop", entity_id=shop.id, action="create"
    )
    db.commit()
    return shop


def update_shop(db: Session, actor: User, shop: Shop, data: ShopUpdate) -> Shop:
    changes = data.model_dump(exclude_unset=True)
    before = {k: _plain(getattr(shop, k)) for k in changes}
    for key, value in changes.items():
        if key == "tax_rate" and value is not None:
            value = Decimal(str(value)).quantize(Decimal("0.01"))
        setattr(shop, key, value)
    record_audit(
        db,
        shop_id=shop.id,
        user_id=actor.id,
        entity="shop",
        entity_id=shop.id,
        action="update",
        before=before,
        after={k: _plain(v) for k, v in changes.items()},
    )
    db.commit()
    return shop


# ---- staff -----------------------------------------------------------------


def _org_shop_ids(db: Session, organisation_id: uuid.UUID) -> set[uuid.UUID]:
    return set(db.scalars(select(Shop.id).where(Shop.organisation_id == organisation_id)).all())


def list_staff(db: Session, organisation_id: uuid.UUID) -> list[User]:
    return list(
        db.scalars(
            select(User).where(User.organisation_id == organisation_id).order_by(User.created_at)
        ).all()
    )


def create_staff(db: Session, owner: User, active_shop_id: uuid.UUID, data: StaffCreate) -> User:
    if phone_taken(db, data.phone):
        raise Conflict(
            code="phone_taken",
            message_en="Phone already registered",
            message_ur="فون نمبر پہلے سے موجود ہے",
        )
    allowed = _org_shop_ids(db, owner.organisation_id)
    wanted = set(data.shop_ids) or {active_shop_id}
    if not wanted.issubset(allowed):
        raise ValidationFailed(code="shop_not_in_org")
    user = User(
        organisation_id=owner.organisation_id,
        name=data.name,
        phone=data.phone,
        password_hash=hash_password(data.password),
        pin_hash=hash_pin(data.pin) if data.pin else None,
        role=data.role,
        locale=data.locale,
    )
    db.add(user)
    db.flush()
    db.add_all([UserShop(user_id=user.id, shop_id=sid) for sid in wanted])
    record_audit(
        db,
        shop_id=active_shop_id,
        user_id=owner.id,
        entity="user",
        entity_id=user.id,
        action="create",
        after={"name": user.name, "phone": user.phone, "role": user.role},
    )
    db.commit()
    return user


def update_staff(
    db: Session, owner: User, active_shop_id: uuid.UUID, staff_id: uuid.UUID, data: StaffUpdate
) -> User:
    user = db.get(User, staff_id)
    if user is None or user.organisation_id != owner.organisation_id:
        raise NotFound()
    if user.id == owner.id and data.is_active is False:
        raise ValidationFailed(code="cannot_disable_self")
    if user.role == Role.OWNER and data.role not in (None, Role.OWNER):
        raise ValidationFailed(code="cannot_demote_owner")
    changes = data.model_dump(exclude_unset=True)
    before: dict = {}
    after: dict = {}
    for key, value in changes.items():
        if key == "password":
            user.password_hash = hash_password(value)
        elif key == "pin":
            user.pin_hash = hash_pin(value) if value else None
        elif key == "shop_ids":
            allowed = _org_shop_ids(db, owner.organisation_id)
            wanted = set(value)
            if not wanted.issubset(allowed):
                raise ValidationFailed(code="shop_not_in_org")
            user.shop_links = [UserShop(user_id=user.id, shop_id=sid) for sid in wanted]
        else:
            before[key] = _plain(getattr(user, key))
            setattr(user, key, value)
            after[key] = _plain(value)
    record_audit(
        db,
        shop_id=active_shop_id,
        user_id=owner.id,
        entity="user",
        entity_id=user.id,
        action="update",
        before=before,
        after=after,
    )
    db.commit()
    return user


def _plain(value):
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, uuid.UUID):
        return str(value)
    return value
