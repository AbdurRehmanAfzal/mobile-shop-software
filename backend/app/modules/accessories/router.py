import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.permissions import Cap
from app.core.tenancy import DB, Ctx, require_cap
from app.modules.accessories import service
from app.modules.accessories.models import CATEGORIES
from app.modules.accessories.schemas import (
    AccessoryCreate,
    AccessoryOut,
    AccessoryUpdate,
    AdjustIn,
    MovementOut,
    PendingItemOut,
)

router = APIRouter(prefix="/api/v1/accessories", tags=["accessories"])
Transact = Annotated[Ctx, Depends(require_cap(Cap.TRANSACT))]
Cost = Annotated[Ctx, Depends(require_cap(Cap.VIEW_COST))]


@router.get("/categories")
def categories():
    return list(CATEGORIES)


@router.get("/pending", response_model=list[PendingItemOut])
def pending(ctx: Ctx, db: DB):
    return service.pending_items(db, ctx.shop_id)


@router.post("/pending/{item_id}/deliver")
def deliver_pending(item_id: uuid.UUID, ctx: Transact, db: DB):
    return service.deliver_pending(db, ctx.shop_id, ctx.id, item_id)


@router.get("", response_model=list[AccessoryOut])
def list_accessories(
    ctx: Ctx,
    db: DB,
    q: str | None = Query(default=None, max_length=60),
    category: str | None = None,
    low_only: bool = False,
    include_inactive: bool = False,
):
    rows = service.list_accessories(
        db,
        ctx.shop_id,
        q=q,
        category=category,
        low_only=low_only,
        include_inactive=include_inactive,
    )
    return [service.to_out(a, ctx.can(Cap.VIEW_COST)) for a in rows]


@router.post("", response_model=AccessoryOut, status_code=201)
def create(data: AccessoryCreate, ctx: Transact, db: DB):
    return service.to_out(service.create(db, ctx.shop_id, ctx.id, data), ctx.can(Cap.VIEW_COST))


@router.get("/{accessory_id}", response_model=AccessoryOut)
def get(accessory_id: uuid.UUID, ctx: Ctx, db: DB):
    return service.to_out(
        service.get_accessory(db, ctx.shop_id, accessory_id), ctx.can(Cap.VIEW_COST)
    )


@router.patch("/{accessory_id}", response_model=AccessoryOut)
def update(accessory_id: uuid.UUID, data: AccessoryUpdate, ctx: Transact, db: DB):
    return service.to_out(
        service.update(db, ctx.shop_id, ctx.id, accessory_id, data), ctx.can(Cap.VIEW_COST)
    )


@router.post("/{accessory_id}/adjust", response_model=AccessoryOut)
def adjust(accessory_id: uuid.UUID, data: AdjustIn, ctx: Cost, db: DB):
    return service.to_out(service.adjust(db, ctx.shop_id, ctx.id, accessory_id, data), True)


@router.get("/{accessory_id}/movements", response_model=list[MovementOut])
def movements(accessory_id: uuid.UUID, ctx: Cost, db: DB, limit: int = Query(default=100, le=500)):
    return service.movements(db, ctx.shop_id, accessory_id, limit)
