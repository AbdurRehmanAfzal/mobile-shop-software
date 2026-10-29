"""Super admin (the product owner): every customer shop, and opening a new one.

Owner (2026-10-26): shops are not self-service; only the product owner creates them. Super users are
the mobile numbers in SUPERUSER_PHONES.
"""

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app.core.errors import Forbidden, NotFound
from app.core.permissions import Role
from app.core.tenancy import DB, CurrentUser, get_current_user
from app.modules.admin import plans
from app.modules.auth import service
from app.modules.auth.models import Shop, User
from app.modules.auth.schemas import SignupRequest

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


def _super(current: Annotated[CurrentUser, Depends(get_current_user)]) -> CurrentUser:
    if not service.is_superuser(current.user):
        raise Forbidden(
            code="superuser_only",
            message_en="Only the product owner can do this",
            message_ur="یہ صرف پروڈکٹ کا مالک کر سکتا ہے",
        )
    return current


Super = Annotated[CurrentUser, Depends(_super)]


class AdminShopOut(BaseModel):
    id: str
    organisation_id: str
    name: str
    city: str | None
    owner_name: str | None
    owner_phone: str | None
    users: int
    branches: int
    created_at: datetime
    plan: str
    plan_expires_at: datetime | None
    days_left: int | None
    monthly_fee: Decimal
    fee_note: str | None
    plan_status: str


class PlanIn(BaseModel):
    plan: Literal["trial", "basic", "pro", "chain"] | None = None
    expires_on: date | None = None
    clear_expiry: bool = False
    extend_months: int | None = Field(default=None, ge=1, le=36)
    monthly_fee: Decimal | None = Field(default=None, ge=0)
    note: str | None = Field(default=None, max_length=200)


class BranchIn(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    name_ur: str | None = Field(default=None, max_length=200)
    city: str | None = Field(default=None, max_length=100)


def _rows(db, shops: list[Shop]) -> list[AdminShopOut]:
    out = []
    for s in shops:
        owner = db.scalar(
            select(User)
            .where(User.organisation_id == s.organisation_id, User.role == Role.OWNER)
            .order_by(User.created_at)
        )
        users = db.scalar(
            select(func.count(User.id)).where(User.organisation_id == s.organisation_id)
        )
        branches = db.scalar(
            select(func.count(Shop.id)).where(Shop.organisation_id == s.organisation_id)
        )
        org = s.organisation
        info = plans.plan_info(org)
        out.append(
            AdminShopOut(
                id=str(s.id),
                organisation_id=str(s.organisation_id),
                name=s.name,
                city=s.city,
                owner_name=owner.name if owner else None,
                owner_phone=owner.phone if owner else None,
                users=users or 0,
                branches=branches or 0,
                created_at=s.created_at,
                plan=org.plan,
                plan_expires_at=org.plan_expires_at,
                days_left=info["days_left"],
                monthly_fee=org.monthly_fee,
                fee_note=org.fee_note,
                plan_status=info["status"],
            )
        )
    return out


def _shop(db, shop_id: uuid.UUID) -> Shop:
    shop = db.get(Shop, shop_id)
    if shop is None:
        raise NotFound()
    return shop


@router.patch("/shops/{shop_id}/plan", response_model=AdminShopOut)
def set_plan(shop_id: uuid.UUID, data: PlanIn, current: Super, db: DB):
    """Plan, monthly fee and expiry of the shop's organisation (all its branches)."""
    shop = _shop(db, shop_id)
    plans.set_plan(
        db,
        shop.organisation,
        by=current.id,
        plan=data.plan,
        expires_on=data.expires_on,
        clear_expiry=data.clear_expiry,
        extend_months=data.extend_months,
        monthly_fee=data.monthly_fee,
        note=data.note,
    )
    db.refresh(shop)
    return _rows(db, [shop])[0]


@router.post("/shops/{shop_id}/branches", response_model=AdminShopOut, status_code=201)
def add_branch(shop_id: uuid.UUID, data: BranchIn, current: Super, db: DB):
    """Another shop for the same owner, opened from the same login."""
    shop = _shop(db, shop_id)
    branch = plans.add_branch(
        db, shop.organisation, by=current.id, name=data.name, name_ur=data.name_ur, city=data.city
    )
    return _rows(db, [branch])[0]


@router.get("/shops", response_model=list[AdminShopOut])
def list_shops(_: Super, db: DB, q: str | None = None):
    stmt = select(Shop).order_by(Shop.created_at.desc())
    if q:
        stmt = stmt.where(Shop.name.ilike(f"%{q}%"))
    return _rows(db, list(db.scalars(stmt).all()))


@router.post("/shops", response_model=AdminShopOut, status_code=201)
def create_shop(data: SignupRequest, current: Super, db: DB):
    """Open a shop for a customer: their shop name and their own owner login (phone + password)."""
    user = service.create_shop_with_owner(db, data, created_by=current.id)
    shop = db.scalar(select(Shop).where(Shop.organisation_id == user.organisation_id))
    return _rows(db, [shop])[0]
