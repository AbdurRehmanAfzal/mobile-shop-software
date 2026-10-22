import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.permissions import Cap
from app.core.tenancy import DB, Ctx, require_cap
from app.modules.returns import service
from app.modules.returns.models import ReturnKind
from app.modules.returns.schemas import PurchaseReturnIn, ReturnOut, SaleReturnIn

router = APIRouter(prefix="/api/v1/returns", tags=["returns"])
Transact = Annotated[Ctx, Depends(require_cap(Cap.TRANSACT))]


@router.post("/sale", response_model=ReturnOut, status_code=201)
def sale_return(data: SaleReturnIn, ctx: Transact, db: DB):
    return service.to_out(db, service.sale_return(db, ctx.shop_id, ctx.id, data))


@router.post("/purchase", response_model=ReturnOut, status_code=201)
def purchase_return(data: PurchaseReturnIn, ctx: Transact, db: DB):
    return service.to_out(db, service.purchase_return(db, ctx.shop_id, ctx.id, data))


@router.get("", response_model=list[ReturnOut])
def list_returns(
    ctx: Ctx,
    db: DB,
    kind: ReturnKind | None = None,
    party_id: uuid.UUID | None = None,
    limit: int = Query(default=100, le=500),
):
    return [
        service.to_out(db, r)
        for r in service.list_returns(db, ctx.shop_id, kind=kind, party_id=party_id, limit=limit)
    ]


@router.get("/{return_id}", response_model=ReturnOut)
def get(return_id: uuid.UUID, ctx: Ctx, db: DB):
    return service.to_out(db, service.get_return(db, ctx.shop_id, return_id))
