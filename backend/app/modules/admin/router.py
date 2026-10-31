"""Super admin (the product owner): every customer shop, and opening a new one.

Owner (2026-10-26): shops are not self-service; only the product owner creates them. Super users are
the mobile numbers in SUPERUSER_PHONES.
"""

import uuid
from datetime import UTC, date, datetime
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
from app.modules.auth.models import Shop, User, UserShop
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
    request_id: uuid.UUID | None = None  # the landing-page request this shop answers


class PlanIn(BaseModel):
    plan: Literal["trial", "basic", "pro", "chain"] | None = None
    expires_on: date | None = None
    clear_expiry: bool = False
    extend_months: int | None = Field(default=None, ge=1, le=36)
    monthly_fee: Decimal | None = Field(default=None, ge=0)
    note: str | None = Field(default=None, max_length=200)
    # owner addendum 3: this shop's own grace days (None keeps the provider's default)
    grace_days: int | None = Field(default=None, ge=0, le=90)
    set_grace: bool = False


class ManualPaymentIn(BaseModel):
    amount: Decimal = Field(gt=0)
    method: str = Field(default="cash", min_length=1, max_length=60)
    months: int = Field(default=1, ge=1, le=36)
    reference: str | None = Field(default=None, max_length=80)
    paid_on: date | None = None
    note: str | None = Field(default=None, max_length=300)


class RenewalCodeIn(BaseModel):
    months: int = Field(default=1, ge=1, le=36)


class BillingIn(BaseModel):
    bank: dict | None = None
    support: dict | None = None
    schedule: dict | None = None
    note: dict | None = None
    qr_path: str | None = None


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
    paid_on: date | None = None
    receipt_no: str | None = None


class FeeStatsOut(BaseModel):
    pending: int
    month_total: Decimal
    month: str


class DecideIn(BaseModel):
    months: int | None = Field(default=None, ge=1, le=36)
    note: str | None = Field(default=None, max_length=200)


class ShopRequestOut(BaseModel):
    id: uuid.UUID
    name: str
    shop_name: str
    city: str | None
    phone: str
    plan: str
    note: str | None
    created_at: datetime
    handled_at: datetime | None


class EnterOut(BaseModel):
    id: str
    name: str


class BranchIn(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    name_ur: str | None = Field(default=None, max_length=200)
    city: str | None = Field(default=None, max_length=100)


def _rows(db, shops: list[Shop]) -> list[AdminShopOut]:
    """One row per shop; owners, user counts and branch counts come from three grouped queries
    (the dev database holds thousands of e2e shops: per-shop queries took most of a minute)."""
    from app.modules.plan import billing

    org_ids = list({s.organisation_id for s in shops})
    owners: dict[uuid.UUID, User] = {}
    if org_ids:
        for u in db.scalars(
            select(User)
            .where(User.organisation_id.in_(org_ids), User.role == Role.OWNER)
            .order_by(User.created_at)
        ).all():
            owners.setdefault(u.organisation_id, u)
        users = dict(
            db.execute(
                select(User.organisation_id, func.count(User.id))
                .where(User.organisation_id.in_(org_ids))
                .group_by(User.organisation_id)
            ).all()
        )
        branches = dict(
            db.execute(
                select(Shop.organisation_id, func.count(Shop.id))
                .where(Shop.organisation_id.in_(org_ids))
                .group_by(Shop.organisation_id)
            ).all()
        )
    else:
        users, branches = {}, {}
    sched = billing.schedule(db)
    out = []
    for s in shops:
        owner = owners.get(s.organisation_id)
        org = s.organisation
        info = plans.plan_info(org, with_pending=False, sched=sched)
        out.append(
            AdminShopOut(
                id=str(s.id),
                organisation_id=str(s.organisation_id),
                name=s.name,
                city=s.city,
                owner_name=owner.name if owner else None,
                owner_phone=owner.phone if owner else None,
                users=users.get(s.organisation_id, 0) or 0,
                branches=branches.get(s.organisation_id, 0) or 0,
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
    if data.set_grace:
        shop.organisation.grace_days = data.grace_days
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
    if data.request_id is not None:
        from app.modules.public.router import ShopRequest

        req = db.get(ShopRequest, data.request_id)
        if req is not None and req.handled_at is None:
            req.handled_at = datetime.now(tz=UTC)
            req.handled_by = current.id
    db.commit()
    db.refresh(shop)
    return _rows(db, [shop])[0]


@router.get("/shop-requests", response_model=list[ShopRequestOut])
def shop_requests(_: Super, db: DB, open_only: bool = True):
    from app.modules.public.router import ShopRequest

    stmt = select(ShopRequest).order_by(ShopRequest.created_at.desc())
    if open_only:
        stmt = stmt.where(ShopRequest.handled_at.is_(None))
    return list(db.scalars(stmt.limit(200)).all())


@router.post("/shop-requests/{req_id}/done", status_code=204)
def shop_request_done(req_id: uuid.UUID, current: Super, db: DB):
    from app.modules.public.router import ShopRequest

    req = db.get(ShopRequest, req_id)
    if req is None:
        raise NotFound()
    req.handled_at = datetime.now(tz=UTC)
    req.handled_by = current.id
    db.commit()


@router.get("/billing")
def get_billing(_: Super, db: DB):
    """bank / support / schedule / note / QR — the provider's billing settings (docs/19 §A)"""
    from app.modules.plan import billing

    v = billing.get(db)
    return {**v, "placeholders": billing.is_placeholder(v), "wallets": fees.accounts(db)}


@router.put("/billing")
def put_billing(data: BillingIn, current: Super, db: DB):
    from app.modules.plan import billing

    before = billing.get(db)
    v = billing.set_(db, data.model_dump(exclude_none=True))
    home = db.scalar(
        select(Shop)
        .join(UserShop, UserShop.shop_id == Shop.id)
        .where(UserShop.user_id == current.id)
        .order_by(Shop.created_at)
    )
    if home is not None:
        record_audit(
            db,
            shop_id=home.id,
            user_id=current.id,
            entity="billing",
            entity_id=None,
            action="update",
            before={"schedule": before["schedule"]},
            after={"schedule": v["schedule"]},
        )
        db.commit()
    return {**v, "placeholders": billing.is_placeholder(v), "wallets": fees.accounts(db)}


@router.post("/shops/{shop_id}/payments", response_model=FeeRowOut, status_code=201)
def record_payment(shop_id: uuid.UUID, data: ManualPaymentIn, current: Super, db: DB):
    """A payment received by hand: logged as verified and the plan extended at once."""
    shop = _shop(db, shop_id)
    p = fees.record_manual(
        db,
        shop,
        by=current.user,
        amount=data.amount,
        method=data.method,
        months=data.months,
        reference=data.reference,
        paid_on=data.paid_on,
        note=data.note,
    )
    return next(r for r in fees.listing(db, None) if r["id"] == p.id)


@router.post("/shops/{shop_id}/renewal-code")
def renewal_code(shop_id: uuid.UUID, data: RenewalCodeIn, current: Super, db: DB):
    """A signed code the owner pastes in More → Software fees (works offline, once)."""
    from app.modules.plan import renewal

    shop = _shop(db, shop_id)
    code = renewal.make_code(shop.organisation_id, data.months)
    record_audit(
        db,
        shop_id=shop.id,
        user_id=current.id,
        entity="organisation",
        entity_id=shop.organisation_id,
        action="renewal_code_issued",
        after={"months": data.months},
    )
    db.commit()
    return {"code": code, "months": data.months, "shop": shop.name}


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
