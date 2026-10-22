import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.permissions import Cap
from app.core.tenancy import DB, Ctx, require_cap
from app.modules.catalogue import service
from app.modules.catalogue.schemas import (
    BrandCreate,
    BrandOut,
    ColourCreate,
    ColourOut,
    ModelCreate,
    ModelOut,
    StorageCreate,
    StorageOut,
)

router = APIRouter(prefix="/api/v1/catalogue", tags=["catalogue"])

Transact = Annotated[Ctx, Depends(require_cap(Cap.TRANSACT))]


@router.get("/brands", response_model=list[BrandOut])
def brands(ctx: Ctx, db: DB):
    return service.list_brands(db, ctx.shop_id)


@router.post("/brands", response_model=BrandOut, status_code=201)
def create_brand(data: BrandCreate, ctx: Transact, db: DB):
    return service.create_brand(db, ctx.shop_id, ctx.id, data)


@router.get("/models", response_model=list[ModelOut])
def models(
    ctx: Ctx,
    db: DB,
    brand_id: uuid.UUID | None = None,
    q: str | None = Query(default=None, min_length=1, max_length=60),
    limit: int = Query(default=200, le=500),
):
    return service.list_models(db, ctx.shop_id, brand_id, q, limit)


@router.post("/models", response_model=ModelOut, status_code=201)
def create_model(data: ModelCreate, ctx: Transact, db: DB):
    return service.create_model(db, ctx.shop_id, ctx.id, data)


@router.get("/storages", response_model=list[StorageOut])
def storages(ctx: Ctx, db: DB):
    return service.list_storages(db, ctx.shop_id)


@router.post("/storages", response_model=StorageOut, status_code=201)
def create_storage(data: StorageCreate, ctx: Transact, db: DB):
    return service.create_storage(db, ctx.shop_id, ctx.id, data)


@router.get("/colours", response_model=list[ColourOut])
def colours(ctx: Ctx, db: DB):
    return service.list_colours(db, ctx.shop_id)


@router.post("/colours", response_model=ColourOut, status_code=201)
def create_colour(data: ColourCreate, ctx: Transact, db: DB):
    return service.create_colour(db, ctx.shop_id, ctx.id, data)
