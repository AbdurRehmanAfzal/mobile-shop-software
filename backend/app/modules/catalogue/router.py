import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query, Response

from app.core.permissions import Cap
from app.core.tenancy import DB, Ctx, require_cap
from app.modules.catalogue import service
from app.modules.catalogue.schemas import (
    BrandCreate,
    BrandOut,
    CatalogueUpdate,
    ColourCreate,
    ColourOut,
    ModelCreate,
    ModelOut,
    StorageCreate,
    StorageOut,
)

Category = Literal["phone", "tablet", "watch"]

router = APIRouter(prefix="/api/v1/catalogue", tags=["catalogue"])

Transact = Annotated[Ctx, Depends(require_cap(Cap.TRANSACT))]
Editor = Annotated[Ctx, Depends(require_cap(Cap.CATALOGUE_EDIT))]


@router.get("/brands", response_model=list[BrandOut])
def brands(ctx: Ctx, db: DB, category: Category | None = None):
    return service.list_brands(db, ctx.shop_id, category)


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
    category: Category | None = None,
):
    return service.list_models(db, ctx.shop_id, brand_id, q, limit, category)


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


# ---- rename / delete shop-own rows (owner, manager) ----------------------------


def _register(plural: str, entity: str, out):
    @router.patch(f"/{plural}/{{row_id}}", response_model=out, name=f"update_{entity}")
    def update(row_id: uuid.UUID, data: CatalogueUpdate, ctx: Editor, db: DB):
        return service.update_item(db, entity, ctx.shop_id, ctx.id, row_id, data)

    @router.delete(f"/{plural}/{{row_id}}", status_code=204, name=f"delete_{entity}")
    def delete(row_id: uuid.UUID, ctx: Editor, db: DB):
        service.delete_item(db, entity, ctx.shop_id, ctx.id, row_id)
        return Response(status_code=204)


_register("brands", "brand", BrandOut)
_register("models", "model", ModelOut)
_register("storages", "storage", StorageOut)
_register("colours", "colour", ColourOut)
