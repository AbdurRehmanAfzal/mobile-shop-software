"""The shop owner's side of software fees: the accounts to pay into, their plan, and "I have paid"."""

import datetime as dt
import uuid
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.core.permissions import Cap
from app.core.tenancy import DB, Ctx, require_cap
from app.modules.admin import fees, plans
from app.modules.auth.schemas import PlanOut

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


class MyFeesOut(BaseModel):
    plan: PlanOut
    accounts: list[dict]
    payments: list[FeeOut]


class ReportIn(BaseModel):
    amount: Decimal = Field(gt=0)
    method: str = Field(min_length=1, max_length=60)
    reference: str | None = Field(default=None, max_length=80)
    proof_path: str | None = Field(default=None, max_length=500)
    months: int = Field(default=1, ge=1, le=36)
    note: str | None = Field(default=None, max_length=300)


@router.get("", response_model=MyFeesOut)
def my_fees(ctx: Owner, db: DB):
    org = ctx.shop.organisation
    return {
        "plan": plans.plan_info(org),
        "accounts": [{k: v for k, v in a.items()} for a in fees.accounts(db)],
        "payments": [fees.out(p) for p in fees.mine(db, org.id)],
    }


@router.post("", status_code=201, response_model=FeeOut)
def report_payment(data: ReportIn, ctx: Owner, db: DB):
    p = fees.report(
        db,
        ctx.shop,
        ctx.user,
        amount=data.amount,
        method=data.method,
        reference=data.reference,
        proof_path=data.proof_path,
        months=data.months,
        note=data.note,
    )
    return fees.out(p)
