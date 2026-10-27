import datetime as dt
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.permissions import Cap
from app.core.tenancy import DB, Ctx, require_cap
from app.modules.payments import service
from app.modules.payments.models import PaymentDirection
from app.modules.payments.schemas import PaymentCreate, PaymentOut, VoidIn

router = APIRouter(prefix="/api/v1/payments", tags=["payments"])
Transact = Annotated[Ctx, Depends(require_cap(Cap.TRANSACT))]


@router.post("", response_model=PaymentOut, status_code=201)
def create(data: PaymentCreate, ctx: Transact, db: DB):
    return service.to_out(db, service.create_payment(db, ctx.shop_id, ctx.id, data))


@router.get("", response_model=list[PaymentOut])
def list_payments(
    ctx: Transact,
    db: DB,
    party_id: uuid.UUID | None = None,
    direction: PaymentDirection | None = None,
    date_from: dt.date | None = None,
    date_to: dt.date | None = None,
    limit: int = Query(default=100, le=500),
):
    rows = service.list_payments(
        db,
        ctx.shop_id,
        party_id=party_id,
        direction=direction,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
    )
    return [service.to_out(db, p) for p in rows]


@router.get("/{payment_id}", response_model=PaymentOut)
def get(payment_id: uuid.UUID, ctx: Ctx, db: DB):
    return service.to_out(db, service.get_payment(db, ctx.shop_id, payment_id))


@router.post("/{payment_id}/void", response_model=PaymentOut)
def void(payment_id: uuid.UUID, data: VoidIn, ctx: Ctx, db: DB):
    return service.to_out(db, service.void_payment(db, ctx.shop_id, ctx, payment_id, data.reason))
