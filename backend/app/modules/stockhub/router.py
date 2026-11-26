"""Mock-up 23: the stock screen's figures, read-only (`stockhub/service.py`)."""

import datetime as dt
import uuid
from typing import Literal

from fastapi import APIRouter, Query

from app.core.permissions import Cap
from app.core.tenancy import DB, Ctx
from app.modules.stockhub import service
from app.modules.units.router import _plain

router = APIRouter(prefix="/api/v1/stock-hub", tags=["stock-hub"])
Kind = Literal["phone", "tablet", "watch", "laptop", "items"]


@router.get("/overview")
def overview(ctx: Ctx, db: DB):
    """a card per kind of stock, a row per brand, the totals at cost and asking, what is owed to suppliers"""
    return _plain(service.overview(db, ctx.shop_id, can_cost=ctx.can(Cap.VIEW_COST)))


@router.get("/models")
def models(ctx: Ctx, db: DB, category: Kind | None = None, brand_id: uuid.UUID | None = None):
    """per model (brand + one name, ADR-125) or per item: in the shop, sold, cost, asking"""
    return _plain(
        service.models(
            db, ctx.shop_id, category=category, brand_id=brand_id, can_cost=ctx.can(Cap.VIEW_COST)
        )
    )


@router.get("/parties")
def parties(ctx: Ctx, db: DB):
    """each dealer / customer the stock was bought from: still here, sold, returned, cost, billed, khata"""
    return _plain(service.parties(db, ctx.shop_id, can_cost=ctx.can(Cap.VIEW_COST)))


@router.get("/ledger")
def ledger(
    ctx: Ctx,
    db: DB,
    date_from: dt.date | None = None,
    date_to: dt.date | None = None,
    category: Kind | None = None,
    move: Literal["in", "out", "return", "transfer", "adjust", "parts"] | None = None,
    brand_id: uuid.UUID | None = None,
    party_id: uuid.UUID | None = None,
    limit: int = Query(default=500, le=2000),
):
    """every piece in and out with its cost, price, profit and the stock at cost after it"""
    data = service.ledger(
        db,
        ctx.shop_id,
        date_from=date_from,
        date_to=date_to,
        category=category,
        move=move,
        brand_id=brand_id,
        party_id=party_id,
        can_cost=ctx.can(Cap.VIEW_COST),
    )
    data["total_rows"] = len(data["rows"])
    data["rows"] = data["rows"][:limit]
    return _plain(data)
