import uuid
from datetime import date
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from app.core.errors import Forbidden
from app.core.idempotency import IdemKey
from app.core.idempotency import run as idempotent
from app.core.permissions import Cap
from app.core.tenancy import DB, Ctx, require_cap
from app.modules.paymode.schemas import PaymentInfo
from app.modules.purchases import service
from app.modules.purchases.schemas import PurchaseCreate, PurchaseOut, VoidIn

router = APIRouter(prefix="/api/v1/purchases", tags=["purchases"])
Transact = Annotated[Ctx, Depends(require_cap(Cap.TRANSACT))]


@router.post("", response_model=PurchaseOut, status_code=201)
def create(data: PurchaseCreate, ctx: Transact, db: DB, idem: IdemKey = None):
    return idempotent(
        db,
        ctx.shop_id,
        idem,
        "purchases",
        lambda: service.to_out(db, service.create_purchase(db, ctx.shop_id, ctx.id, data)),
    )


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


class PartyChangeIn(BaseModel):
    party_id: uuid.UUID
    reason: str = Field(min_length=2, max_length=200)


@router.post("/{purchase_id}/party", response_model=PurchaseOut)
def change_party(purchase_id: uuid.UUID, data: PartyChangeIn, ctx: Ctx, db: DB):
    """owner / manager: the wrong dealer / customer was picked (ADR-056)"""
    return service.to_out(
        db,
        service.change_party(db, ctx.shop_id, ctx, purchase_id, data.party_id, data.reason.strip()),
    )


class PaidChangeIn(BaseModel):
    paid_now: Decimal = Field(ge=0, max_digits=14, decimal_places=2)
    payment: PaymentInfo | None = None
    due_date: date | None = None
    reason: str = Field(min_length=2, max_length=200)


@router.get("/{purchase_id}/paid")
def paid_info(purchase_id: uuid.UUID, ctx: Ctx, db: DB):
    """what was paid at the purchase and later, for the "change what was paid" sheet (ADR-067)"""
    later, at_purchase, room = service.paid_split(
        db, service.get_purchase(db, ctx.shop_id, purchase_id)
    )
    return {"paid_at_purchase": at_purchase, "paid_later": later, "max_at_purchase": room}


@router.post("/{purchase_id}/paid", response_model=PurchaseOut)
def change_paid(purchase_id: uuid.UUID, data: PaidChangeIn, ctx: Ctx, db: DB):
    """owner / manager: what was paid at the purchase was entered wrong (ADR-067)"""
    return service.to_out(
        db,
        service.change_paid(
            db,
            ctx.shop_id,
            ctx,
            purchase_id,
            data.paid_now,
            data.payment,
            data.due_date,
            data.reason.strip(),
        ),
    )


class CostChangeIn(BaseModel):
    device_id: uuid.UUID
    cost: Decimal = Field(ge=0, max_digits=14, decimal_places=2)
    reason: str = Field(min_length=2, max_length=200)


@router.post("/cost", response_model=PurchaseOut)
def change_cost(data: CostChangeIn, ctx: Ctx, db: DB):
    """owner / manager: the wrong purchase price was typed for a phone still in the shop (ADR-063)"""
    return service.to_out(
        db,
        service.change_cost(db, ctx.shop_id, ctx, data.device_id, data.cost, data.reason.strip()),
    )
