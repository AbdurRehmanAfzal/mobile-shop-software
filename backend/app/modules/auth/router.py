import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Header

from app.core.permissions import Cap
from app.core.tenancy import DB, Ctx, CurrentUser, get_current_user, require_cap
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
    ShopUpdate,
    SignupRequest,
    StaffCreate,
    StaffUpdate,
    TokenPair,
    UserOut,
)

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
        user=UserOut.model_validate(user).model_copy(update={"has_pin": bool(user.pin_hash)}),
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


@shops.get("/current", response_model=ShopOut)
def current_shop(ctx: Ctx):
    return ctx.shop


@shops.post("", response_model=ShopOut, status_code=201)
def create_shop(
    data: ShopCreate, ctx: Annotated[Ctx, Depends(require_cap(Cap.MANAGE_SETTINGS))], db: DB
):
    return service.create_shop(db, ctx.user, data)


@shops.patch("/current", response_model=ShopOut)
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
