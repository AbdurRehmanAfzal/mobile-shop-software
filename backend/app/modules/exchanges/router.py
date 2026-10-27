import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.permissions import Cap
from app.core.tenancy import DB, Ctx, require_cap
from app.modules.exchanges import service
from app.modules.exchanges.schemas import ExchangeCreate, ExchangeOut

router = APIRouter(prefix="/api/v1/exchanges", tags=["exchanges"])
Transact = Annotated[Ctx, Depends(require_cap(Cap.TRANSACT))]


@router.post("", response_model=ExchangeOut, status_code=201)
def create(data: ExchangeCreate, ctx: Transact, db: DB):
    return service.to_out(db, service.create_exchange(db, ctx.shop_id, ctx, data))


@router.get("", response_model=list[ExchangeOut])
def list_exchanges(ctx: Transact, db: DB, limit: int = Query(default=100, le=500)):
    return [service.to_out(db, e) for e in service.list_exchanges(db, ctx.shop_id, limit)]


@router.get("/{exchange_id}", response_model=ExchangeOut)
def get(exchange_id: uuid.UUID, ctx: Ctx, db: DB):
    return service.to_out(db, service.get_exchange(db, ctx.shop_id, exchange_id))
