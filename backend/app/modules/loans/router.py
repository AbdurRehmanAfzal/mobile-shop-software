import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.permissions import Cap
from app.core.tenancy import DB, Ctx, require_cap
from app.modules.loans import service
from app.modules.loans.models import LoanStatus
from app.modules.loans.schemas import LoanCreate, LoanOut, LoanReturnIn, LoanSellIn

router = APIRouter(prefix="/api/v1/loans", tags=["loans"])
Transact = Annotated[Ctx, Depends(require_cap(Cap.TRANSACT))]


@router.post("", response_model=LoanOut, status_code=201)
def create(data: LoanCreate, ctx: Transact, db: DB):
    return service.to_out(db, service.create_loan(db, ctx.shop_id, ctx.id, data))


@router.get("", response_model=list[LoanOut])
def list_loans(
    ctx: Ctx,
    db: DB,
    status: LoanStatus | None = None,
    party_id: uuid.UUID | None = None,
    limit: int = Query(default=100, le=500),
):
    return [
        service.to_out(db, loan)
        for loan in service.list_loans(
            db, ctx.shop_id, status=status, party_id=party_id, limit=limit
        )
    ]


@router.get("/{loan_id}", response_model=LoanOut)
def get(loan_id: uuid.UUID, ctx: Ctx, db: DB):
    return service.to_out(db, service.get_loan(db, ctx.shop_id, loan_id))


@router.post("/{loan_id}/return", response_model=LoanOut)
def return_loan(loan_id: uuid.UUID, data: LoanReturnIn, ctx: Transact, db: DB):
    return service.to_out(db, service.return_loan(db, ctx.shop_id, ctx.id, loan_id, data.notes))


@router.post("/{loan_id}/sell", response_model=LoanOut)
def sell(loan_id: uuid.UUID, data: LoanSellIn, ctx: Transact, db: DB):
    return service.to_out(db, service.sell_loan(db, ctx.shop_id, ctx, loan_id, data))
