import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.errors import Forbidden
from app.core.permissions import Cap
from app.core.tenancy import DB, Ctx, require_cap
from app.modules.purchases import service
from app.modules.purchases.schemas import PurchaseCreate, PurchaseOut, VoidIn

router = APIRouter(prefix="/api/v1/purchases", tags=["purchases"])
Transact = Annotated[Ctx, Depends(require_cap(Cap.TRANSACT))]


@router.post("", response_model=PurchaseOut, status_code=201)
def create(data: PurchaseCreate, ctx: Transact, db: DB):
    return service.to_out(db, service.create_purchase(db, ctx.shop_id, ctx.id, data))


@router.get("", response_model=list[PurchaseOut])
def list_purchases(
    ctx: Annotated[Ctx, Depends(require_cap(Cap.VIEW_COST))],
    db: DB,
    party_id: uuid.UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = Query(default=100, le=500),
):
    return [
        service.to_out(db, p)
        for p in service.list_purchases(
            db, ctx.shop_id, party_id=party_id, date_from=date_from, date_to=date_to, limit=limit
        )
    ]


@router.get("/{purchase_id}", response_model=PurchaseOut)
def get(purchase_id: uuid.UUID, ctx: Ctx, db: DB):
    p = service.get_purchase(db, ctx.shop_id, purchase_id)
    if not ctx.can(Cap.VIEW_COST) and p.created_by != ctx.id:
        raise Forbidden()
    return service.to_out(db, p)


@router.post("/{purchase_id}/void", response_model=PurchaseOut)
def void(purchase_id: uuid.UUID, data: VoidIn, ctx: Ctx, db: DB):
    return service.to_out(db, service.void_purchase(db, ctx.shop_id, ctx, purchase_id, data.reason))
