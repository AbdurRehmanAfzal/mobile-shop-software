"""Branch transfers (docs/35 §5 item 2): the owner / manager sends phones and items to another of
the owner's branches. Moving stock moves its cost, so it needs the cost-seeing role."""

import uuid
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.permissions import Cap
from app.core.tenancy import DB, Ctx, require_cap
from app.modules.transfers import service
from app.modules.transfers.schemas import TransferIn

router = APIRouter(prefix="/api/v1/transfers", tags=["transfers"])
Mover = Annotated[Ctx, Depends(require_cap(Cap.VIEW_COST))]


def _out(v):
    if isinstance(v, Decimal):
        return f"{v:.2f}"
    if isinstance(v, dict):
        return {k: _out(x) for k, x in v.items()}
    if isinstance(v, list):
        return [_out(x) for x in v]
    return v


@router.get("/branches")
def branches(ctx: Mover, db: DB):
    """the owner's other branches this user works in (empty: the button stays hidden)"""
    return service.branches(db, ctx.user.id, ctx.shop)


@router.get("")
def list_transfers(ctx: Mover, db: DB):
    return _out(service.list_transfers(db, ctx.shop_id))


@router.get("/{transfer_id}")
def get_transfer(transfer_id: uuid.UUID, ctx: Mover, db: DB):
    return _out(service.get(db, ctx.shop_id, transfer_id))


@router.post("", status_code=201)
def create(data: TransferIn, ctx: Mover, db: DB):
    ctx.require(Cap.TRANSACT)
    return _out(service.create(db, ctx.user.id, ctx.shop, data))
