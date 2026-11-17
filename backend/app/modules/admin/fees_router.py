"""The shop owner's side of software fees: the accounts to pay into, their plan, and "I have paid"."""

import datetime as dt
import uuid
from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.core.permissions import Cap
from app.core.tenancy import DB, Ctx, require_cap
from app.modules.admin import fees, plans
from app.modules.auth.schemas import PlanOut
from app.modules.plan import order as orders

router = APIRouter(prefix="/api/v1/fees", tags=["fees"])
Owner = Annotated[Ctx, Depends(require_cap(Cap.MANAGE_SETTINGS))]


class FeeOut(BaseModel):
    id: uuid.UUID
    amount: Decimal
    method: str
    reference: str | None
    proof_path: str | None
    months: int
    note: str | None
    status: str
    decision_note: str | None
    created_at: dt.datetime
    handled_at: dt.datetime | None
    paid_on: dt.date | None = None
    receipt_no: str | None = None
    to_dues: Decimal = Decimal(0)
    order: dict | None = None  # the package order it paid for (ADR-095)


class DueOut(BaseModel):
    invoice_no: str
    months: int
    amount: Decimal
    paid: Decimal
    left: Decimal
    status: str
    period_from: dt.date | None
    period_to: dt.date | None
    due_on: dt.date | None
    overdue: bool


class DuesOut(BaseModel):
    rows: list[DueOut]
    total: Decimal
    paid: Decimal
    left: Decimal


class DueAdminOut(DueOut):
    id: uuid.UUID
    note: str | None = None  # the provider's own note
    created_at: dt.datetime


class DuesAdminOut(BaseModel):
    rows: list[DueAdminOut]
    total: Decimal
    paid: Decimal
    left: Decimal


class MyFeesOut(BaseModel):
    plan: PlanOut
    accounts: list[dict]
    payments: list[FeeOut]
    dues: DuesOut  # fee still to pay for packages already given (ADR-053); no provider notes


class OrderIn(BaseModel):
    plan: Literal["basic", "pro", "chain"]
    modules: list[str] = Field(default_factory=list, max_length=40)
    addons: list[int] = Field(default_factory=list, max_length=20)
    months: int = Field(ge=1, le=60)


class ReportIn(BaseModel):
    amount: Decimal = Field(gt=0)
    method: str = Field(min_length=1, max_length=60)
    reference: str | None = Field(default=None, max_length=80)
    proof_path: str | None = Field(default=None, max_length=500)
    months: int = Field(default=1, ge=1, le=60)
    note: str | None = Field(default=None, max_length=300)
    paid_on: dt.date | None = None
    # the package / modules / add-ons / duration chosen on the fees page (ADR-095); the months
    # and the expected total then come from the server's own quote
    order: OrderIn | None = None


@router.get("", response_model=MyFeesOut)
def my_fees(ctx: Owner, db: DB):
    org = ctx.shop.organisation
    return {
        "plan": plans.plan_info(org, db=db),
        "accounts": [{k: v for k, v in a.items()} for a in fees.accounts(db)],
        "payments": [fees.out(p) for p in fees.mine(db, org.id)],
        "dues": fees.dues(db, org.id, for_provider=False),
    }


@router.get("/catalog")
def catalog(ctx: Owner, db: DB):
    """Packages, modules, add-ons and durations with this shop's prices (ADR-095)"""
    return orders.catalog(db, ctx.shop.organisation)


@router.post("/quote")
def quote(data: OrderIn, ctx: Owner, db: DB):
    """What the chosen package, modules, add-ons and duration cost — worked out by the server"""
    return orders.quote(db, ctx.shop.organisation, **data.model_dump())


@router.post("", status_code=201, response_model=FeeOut)
def report_payment(data: ReportIn, ctx: Owner, db: DB):
    snap = None
    if data.order is not None:
        q = orders.quote(db, ctx.shop.organisation, **data.order.model_dump())
        snap = orders.snapshot(q)
    p = fees.report(
        db,
        ctx.shop,
        ctx.user,
        amount=data.amount,
        method=data.method,
        reference=data.reference,
        proof_path=data.proof_path,
        months=data.order.months if data.order else data.months,
        note=data.note,
        paid_on=data.paid_on,
        order=snap,
    )
    return fees.out(p)
