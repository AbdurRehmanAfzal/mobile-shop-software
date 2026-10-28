import uuid
from datetime import datetime
from typing import Annotated
from urllib.parse import parse_qsl, urlsplit

from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel, ConfigDict, Field

from app.core.errors import ValidationFailed
from app.core.permissions import Cap
from app.core.security import LINK_SECONDS, create_link_token
from app.core.tenancy import DB, Ctx, CurrentUser, get_current_user, link_target, require_cap
from app.modules.auth import service
from app.modules.auth.schemas import (
    AuthResponse,
    LoginRequest,
    MeOut,
    PinLoginRequest,
    RefreshRequest,
    SetPinRequest,
    ShopCreate,
    ShopOut,
    ShopSettingsOut,
    ShopUpdate,
    SignupRequest,
    StaffCreate,
    StaffUpdate,
    TokenPair,
    UserOut,
)
from app.modules.fingerprint import service as fp

router = APIRouter(prefix="/api/v1", tags=["auth"])


def _me(db, user, x_shop_id: str | None) -> MeOut:
    shops = service.shops_for_user(db, user.id)
    active = None
    if x_shop_id:
        try:
            wanted = uuid.UUID(x_shop_id)
            active = next((s.id for s in shops if s.id == wanted), None)
        except ValueError:
            active = None
    if active is None and len(shops) == 1:
        active = shops[0].id
    return MeOut(
        user=UserOut.model_validate(user).model_copy(
            update={"has_pin": bool(user.pin_hash), "is_superuser": service.is_superuser(user)}
        ),
        shops=[ShopOut.model_validate(s) for s in shops],
        active_shop_id=active,
    )


@router.post("/auth/signup", response_model=AuthResponse, status_code=201)
def signup(data: SignupRequest, db: DB):
    user, tokens = service.signup(db, data)
    return AuthResponse(tokens=tokens, me=_me(db, user, None))


@router.post("/auth/login", response_model=AuthResponse)
def login(data: LoginRequest, db: DB):
    user, tokens = service.login(db, data.phone, data.password)
    return AuthResponse(tokens=tokens, me=_me(db, user, None))


@router.post("/auth/pin-login", response_model=AuthResponse)
def pin_login(data: PinLoginRequest, db: DB):
    user, tokens = service.login_with_pin(db, data.phone, data.pin)
    return AuthResponse(tokens=tokens, me=_me(db, user, None))


@router.put("/me/pin", status_code=204)
def set_pin(
    data: SetPinRequest, current: Annotated[CurrentUser, Depends(get_current_user)], db: DB
):
    service.set_own_pin(db, current.user, data.password, data.pin)


@router.post("/auth/refresh", response_model=TokenPair)
def refresh(data: RefreshRequest, db: DB):
    _, tokens = service.refresh(db, data.refresh_token)
    return tokens


@router.get("/me", response_model=MeOut)
def me(
    current: Annotated[CurrentUser, Depends(get_current_user)],
    db: DB,
    x_shop_id: Annotated[str | None, Header(alias="X-Shop-Id")] = None,
):
    return _me(db, current.user, x_shop_id)


# ---- shops ----------------------------------------------------------------

shops = APIRouter(prefix="/api/v1/shops", tags=["shops"])


@shops.get("", response_model=list[ShopOut])
def list_shops(current: Annotated[CurrentUser, Depends(get_current_user)], db: DB):
    return service.shops_for_user(db, current.id)


@shops.get("/current", response_model=ShopSettingsOut)
def current_shop(ctx: Ctx):
    return ctx.shop


@shops.post("", response_model=ShopOut, status_code=201)
def create_shop(
    data: ShopCreate, ctx: Annotated[Ctx, Depends(require_cap(Cap.MANAGE_SETTINGS))], db: DB
):
    return service.create_shop(db, ctx.user, data)


@shops.patch("/current", response_model=ShopSettingsOut)
def update_current_shop(
    data: ShopUpdate, ctx: Annotated[Ctx, Depends(require_cap(Cap.MANAGE_SETTINGS))], db: DB
):
    return service.update_shop(db, ctx.user, ctx.shop, data)


# ---- staff ----------------------------------------------------------------

staff = APIRouter(prefix="/api/v1/staff", tags=["staff"])


@staff.get("", response_model=list[UserOut])
def list_staff(ctx: Annotated[Ctx, Depends(require_cap(Cap.MANAGE_STAFF))], db: DB):
    return service.list_staff(db, ctx.organisation_id)


@staff.post("", response_model=UserOut, status_code=201)
def create_staff(
    data: StaffCreate, ctx: Annotated[Ctx, Depends(require_cap(Cap.MANAGE_STAFF))], db: DB
):
    return service.create_staff(db, ctx.user, ctx.shop_id, data)


@staff.patch("/{staff_id}", response_model=UserOut)
def update_staff(
    staff_id: uuid.UUID,
    data: StaffUpdate,
    ctx: Annotated[Ctx, Depends(require_cap(Cap.MANAGE_STAFF))],
    db: DB,
):
    return service.update_staff(db, ctx.user, ctx.shop_id, staff_id, data)


# ---- links for the Android app's print pages and downloads -------------------------------------

LINKABLE = ("/api/v1/exports/", "/api/v1/sales/", "/api/v1/repairs/", "/api/v1/devices/")


class LinkIn(BaseModel):
    path: str = Field(max_length=600)


class LinkOut(BaseModel):
    url: str
    expires_in: int


@router.post("/auth/link", response_model=LinkOut)
def make_link(data: LinkIn, ctx: Ctx):
    """A 2-minute address for one print page or download, to open in Chrome (Android app)."""
    parts = urlsplit(data.path)
    if parts.scheme or parts.netloc or not parts.path.startswith(LINKABLE):
        raise ValidationFailed(code="link_not_allowed")
    target = link_target(parts.path, parse_qsl(parts.query, keep_blank_values=True))
    token = create_link_token(ctx.id, ctx.shop_id, target)
    sep = "&" if "?" in target else "?"
    return {"url": f"{target}{sep}dl={token}", "expires_in": LINK_SECONDS}


# ---- fingerprint login (owner 2026-10-28): the owner, and staff when the owner allows it ---------


class DeviceKeyIn(BaseModel):
    name: str = Field(default="Android phone", min_length=1, max_length=80)


class DeviceKeyOut(BaseModel):
    key_id: uuid.UUID
    secret: str


class DeviceLoginIn(BaseModel):
    key_id: uuid.UUID
    secret: str = Field(min_length=20, max_length=200)


class PasskeyIn(BaseModel):
    credential: dict
    token: str
    name: str = Field(default="This browser", min_length=1, max_length=80)


class PasskeyLoginIn(BaseModel):
    credential: dict
    token: str


class LoginKeyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    kind: str
    name: str
    created_at: datetime
    last_used_at: datetime | None


class FingerprintStatus(BaseModel):
    allowed: bool
    keys: list[LoginKeyOut]


@router.get("/auth/fingerprint", response_model=FingerprintStatus)
def fingerprint_status(current: Annotated[CurrentUser, Depends(get_current_user)], db: DB):
    return {"allowed": fp.allowed(db, current.user), "keys": fp.list_keys(db, current.user)}


@router.post("/auth/fingerprint/device", response_model=DeviceKeyOut, status_code=201)
def fingerprint_device(
    data: DeviceKeyIn, current: Annotated[CurrentUser, Depends(get_current_user)], db: DB
):
    return fp.add_device(db, current.user, data.name)


@router.post("/auth/fingerprint/device-login", response_model=AuthResponse)
def fingerprint_device_login(data: DeviceLoginIn, db: DB):
    user = fp.device_login(db, data.key_id, data.secret)
    return AuthResponse(tokens=service._tokens(user), me=_me(db, user, None))


@router.post("/auth/passkey/register-options")
def passkey_register_options(current: Annotated[CurrentUser, Depends(get_current_user)], db: DB):
    return fp.passkey_register_options(db, current.user)


@router.post("/auth/passkey/register", status_code=204)
def passkey_register(
    data: PasskeyIn, current: Annotated[CurrentUser, Depends(get_current_user)], db: DB
):
    fp.passkey_register(db, current.user, data.credential, data.token, data.name)


@router.post("/auth/passkey/login-options")
def passkey_login_options():
    return fp.passkey_login_options()


@router.post("/auth/passkey/login", response_model=AuthResponse)
def passkey_login(data: PasskeyLoginIn, db: DB):
    user = fp.passkey_login(db, data.credential, data.token)
    return AuthResponse(tokens=service._tokens(user), me=_me(db, user, None))


@router.delete("/auth/fingerprint/keys/{key_id}", status_code=204)
def fingerprint_remove(
    key_id: uuid.UUID, current: Annotated[CurrentUser, Depends(get_current_user)], db: DB
):
    fp.remove_key(db, current.user, key_id)
