import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.idempotency import IdemKey
from app.core.idempotency import run as idempotent
from app.core.permissions import Cap
from app.core.tenancy import DB, Ctx, require_cap
from app.modules.exchanges import service
from app.modules.exchanges.schemas import ExchangeCreate, ExchangeOut
from app.modules.sales.schemas import VoidIn

router = APIRouter(prefix="/api/v1/exchanges", tags=["exchanges"])
Transact = Annotated[Ctx, Depends(require_cap(Cap.TRANSACT))]


@router.post("", response_model=ExchangeOut, status_code=201)
def create(data: ExchangeCreate, ctx: Transact, db: DB, idem: IdemKey = None):
    # owner 2026-11-10: a double tap or a retry never posts it twice
    return idempotent(
        db,
        ctx.shop_id,
        idem,
        "exchanges",
        lambda: service.to_out(db, service.create_exchange(db, ctx.shop_id, ctx, data)),
    )


@router.get("", response_model=list[ExchangeOut])
def list_exchanges(ctx: Transact, db: DB, limit: int = Query(default=100, le=500)):
    return [service.to_out(db, e) for e in service.list_exchanges(db, ctx.shop_id, limit)]


@router.get("/{exchange_id}", response_model=ExchangeOut)
def get(exchange_id: uuid.UUID, ctx: Ctx, db: DB):
    return service.to_out(db, service.get_exchange(db, ctx.shop_id, exchange_id))


@router.post("/{exchange_id}/void", response_model=ExchangeOut)
def void(exchange_id: uuid.UUID, data: VoidIn, ctx: Ctx, db: DB):
    """owner 2026-11-15 (ADR-090): delete an exchange entered by mistake — both halves together"""
    return service.to_out(db, service.void_exchange(db, ctx.shop_id, ctx, exchange_id, data.reason))
