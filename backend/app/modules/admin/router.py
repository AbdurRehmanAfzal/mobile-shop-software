"""Super admin (the product owner): every customer shop, and opening a new one.

Owner (2026-10-26): shops are not self-service; only the product owner creates them. Super users are
the mobile numbers in SUPERUSER_PHONES.
"""

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app.core.errors import Forbidden, NotFound
from app.core.permissions import Role
from app.core.tenancy import DB, CurrentUser, get_current_user
from app.modules.admin import access, fees, modules, plans
from app.modules.audit.service import record_audit
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
    modules: list[str]
    modules_custom: bool


class ModulesIn(BaseModel):
    modules: list[str] | None  # None = follow the plan


class AdminShopCreate(SignupRequest):
    plan: Literal["trial", "basic", "pro", "chain"] = "trial"
    modules: list[str] | None = None


class PlanIn(BaseModel):
    plan: Literal["trial", "basic", "pro", "chain"] | None = None
    expires_on: date | None = None
    clear_expiry: bool = False
    extend_months: int | None = Field(default=None, ge=1, le=36)
    monthly_fee: Decimal | None = Field(default=None, ge=0)
    note: str | None = Field(default=None, max_length=200)


class PasswordIn(BaseModel):
    password: str = Field(min_length=6, max_length=128)
    user_id: uuid.UUID | None = None


class PasswordSetOut(BaseModel):
    user_id: str
    name: str
    phone: str


class PasswordRequestOut(BaseModel):
    id: uuid.UUID
    shop_id: uuid.UUID
    shop_name: str
    user_id: uuid.UUID
    name: str
    phone: str
    role: str
    sent_to: str
    created_at: datetime
    handled_at: datetime | None


class AccountIn(BaseModel):
    label: str = Field(min_length=1, max_length=40)  # e.g. Easypaisa, SadaPay, Meezan Bank
    account_name: str = Field(default="", max_length=80)
    number: str = Field(min_length=3, max_length=60)  # number or IBAN
    note: str | None = Field(default=None, max_length=120)


class FeeRowOut(BaseModel):
    id: uuid.UUID
    shop_id: uuid.UUID
    shop_name: str
    plan: str
    plan_expires_at: datetime | None
    amount: Decimal
    method: str
    reference: str | None
    proof_path: str | None
    months: int
    note: str | None
    status: str
    decision_note: str | None
    created_at: datetime
    handled_at: datetime | None


class FeeStatsOut(BaseModel):
    pending: int
    month_total: Decimal
    month: str


class DecideIn(BaseModel):
    months: int | None = Field(default=None, ge=1, le=36)
    note: str | None = Field(default=None, max_length=200)


class EnterOut(BaseModel):
    id: str
    name: str


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
                modules=info["modules"],
                modules_custom=info["modules_custom"],
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


@router.post("/shops/{shop_id}/enter", response_model=EnterOut)
def enter_shop(shop_id: uuid.UUID, current: Super, db: DB):
    """Open a customer shop as the product owner (recorded in that shop's audit log)."""
    shop = access.enter_shop(db, current.user, shop_id)
    return EnterOut(id=str(shop.id), name=shop.name)


@router.post("/shops/{shop_id}/owner-password", response_model=PasswordSetOut)
def set_owner_password(shop_id: uuid.UUID, data: PasswordIn, current: Super, db: DB):
    """A new password for the shop owner (or one user of the shop) who forgot theirs."""
    u = access.set_password(db, current.user, shop_id, data.password, data.user_id)
    return PasswordSetOut(user_id=str(u.id), name=u.name, phone=u.phone)


@router.get("/password-requests", response_model=list[PasswordRequestOut])
def password_requests(_: Super, db: DB, open_only: bool = True):
    return access.list_requests(db, open_only)


@router.post("/password-requests/{req_id}/done", status_code=204)
def password_request_done(req_id: uuid.UUID, current: Super, db: DB):
    access.mark_done(db, current.user, req_id)


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
def create_shop(data: AdminShopCreate, current: Super, db: DB):
    """Open a shop for a customer: their shop name and their own owner login (phone + password),
    the plan and, when not the plan's defaults, the modules switched on (owner 2026-10-29)."""
    user = service.create_shop_with_owner(db, data, created_by=current.id)
    shop = db.scalar(select(Shop).where(Shop.organisation_id == user.organisation_id))
    org = shop.organisation
    org.plan = data.plan
    org.modules = modules.clean(data.modules)
    db.commit()
    db.refresh(shop)
    return _rows(db, [shop])[0]


@router.get("/payment-accounts")
def payment_accounts(_: Super, db: DB):
    return fees.accounts(db)


@router.put("/payment-accounts")
def set_payment_accounts(data: list[AccountIn], current: Super, db: DB):
    return fees.set_accounts(db, current.user, [a.model_dump() for a in data])


@router.get("/fee-payments", response_model=list[FeeRowOut])
def fee_payments(
    _: Super,
    db: DB,
    status: str | None = Query(default=None, pattern="^(pending|approved|rejected)$"),
):
    return fees.listing(db, status)


@router.get("/fee-stats", response_model=FeeStatsOut)
def fee_stats(_: Super, db: DB):
    return fees.stats(db)


@router.post("/fee-payments/{payment_id}/approve", response_model=FeeRowOut)
def approve_fee(payment_id: uuid.UUID, data: DecideIn, current: Super, db: DB):
    p = fees.approve(db, current.user, payment_id, data.months)
    return next(r for r in fees.listing(db, None) if r["id"] == p.id)


@router.post("/fee-payments/{payment_id}/reject", response_model=FeeRowOut)
def reject_fee(payment_id: uuid.UUID, data: DecideIn, current: Super, db: DB):
    p = fees.reject(db, current.user, payment_id, data.note)
    return next(r for r in fees.listing(db, None) if r["id"] == p.id)


@router.get("/modules")
def module_catalogue(_: Super):
    """every switchable module with its names, and each plan's defaults"""
    return {"modules": modules.MODULES, "plans": modules.PLAN_DEFAULTS}


@router.patch("/shops/{shop_id}/modules", response_model=AdminShopOut)
def set_modules(shop_id: uuid.UUID, data: ModulesIn, current: Super, db: DB):
    shop = _shop(db, shop_id)
    org = shop.organisation
    before = modules.effective(org)
    org.modules = modules.clean(data.modules)
    record_audit(
        db,
        shop_id=shop.id,
        user_id=current.id,
        entity="organisation",
        entity_id=org.id,
        action="modules",
        before={"modules": before},
        after={"modules": modules.effective(org)},
    )
    db.commit()
    db.refresh(shop)
    return _rows(db, [shop])[0]
