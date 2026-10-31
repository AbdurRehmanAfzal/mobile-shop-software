import uuid
from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from app.core.permissions import Cap
from app.core.tenancy import DB, Ctx, require_cap
from app.modules.devices import service
from app.modules.devices.schemas import (
    AccessoryItemIn,
    AccessoryItemOut,
    DeviceDetailOut,
    DeviceOut,
    DeviceUpdate,
    EventIn,
    EventOut,
    ImeiLookupOut,
    OpeningStockIn,
)
from app.modules.devices.state import DeviceCondition, DeviceStatus, PtaStatus

router = APIRouter(prefix="/api/v1/devices", tags=["devices"])
Transact = Annotated[Ctx, Depends(require_cap(Cap.TRANSACT))]


def _hide_cost(ctx, d: dict) -> dict:
    if not ctx.can(Cap.VIEW_COST):
        d = {**d, "cost_price": None}
    return d


@router.get("", response_model=list[DeviceOut])
def list_devices(
    ctx: Ctx,
    db: DB,
    status: DeviceStatus | None = None,
    condition: DeviceCondition | None = None,
    pta_status: PtaStatus | None = None,
    brand_id: uuid.UUID | None = None,
    q: str | None = Query(default=None, min_length=1, max_length=60),
    limit: int = Query(default=100, le=500),
    category: Literal["phone", "tablet", "watch"] | None = None,
    model_id: uuid.UUID | None = None,
    storage_id: uuid.UUID | None = None,
    colour_id: uuid.UUID | None = None,
    ram_gb: int | None = None,
    grade: str | None = None,
    price_min: Decimal | None = None,
    price_max: Decimal | None = None,
    age_min: int | None = None,
    lock_unchecked: bool = False,
):
    rows = service.list_devices(
        db,
        ctx.shop_id,
        category=category,
        status=status,
        condition=condition,
        pta_status=pta_status,
        brand_id=brand_id,
        q=q,
        limit=limit,
        model_id=model_id,
        storage_id=storage_id,
        colour_id=colour_id,
        ram_gb=ram_gb,
        grade=grade,
        price_min=price_min,
        price_max=price_max,
        age_min=age_min,
        lock_unchecked=lock_unchecked
    )
    return [_hide_cost(ctx, r) for r in rows]


@router.get("/imei/{imei}", response_model=ImeiLookupOut)
def imei_lookup(imei: str, ctx: Ctx, db: DB):
    res = service.imei_lookup(db, ctx.shop_id, imei)
    if res["device"]:
        res["device"] = _hide_cost(ctx, res["device"])
    return res


@router.post("/opening-stock", response_model=DeviceOut, status_code=201)
def opening_stock(
    data: OpeningStockIn, ctx: Annotated[Ctx, Depends(require_cap(Cap.VIEW_COST))], db: DB
):
    return service.add_opening_stock(db, ctx.shop_id, ctx.id, data)


class PriceHintOut(BaseModel):
    basis: str  # exact | condition | model | none
    samples: int
    in_stock_same: int
    stock_asking_low: Decimal | None
    stock_asking_high: Decimal | None
    last: dict | None
    median: Decimal | None
    low: Decimal | None
    high: Decimal | None
    suggested: Decimal | None
    avg_days_to_sell: float | None
    cost_median: Decimal | None


@router.get("/price-hint", response_model=PriceHintOut)
def price_hint(
    ctx: Ctx,
    db: DB,
    model_id: uuid.UUID,
    storage_id: uuid.UUID | None = None,
    condition: str | None = None,
    exclude_device_id: uuid.UUID | None = None,
):
    """What this shop sold the same model for lately (owner 2026-10-30)."""
    from app.modules.devices.pricing import price_hint as hint

    return hint(
        db,
        ctx.shop_id,
        model_id,
        storage_id,
        condition,
        can_cost=ctx.can(Cap.VIEW_COST),
        exclude_device_id=exclude_device_id,
    )


# ---- owner addendum 6: model library, lock checks, reclassification, counted item → unit ----------


class ModelSpecsIn(BaseModel):
    model_number: str | None = Field(default=None, max_length=40)
    ram_gb: int | None = Field(default=None, ge=1, le=64)
    specs: dict | None = None


class LockCheckIn(BaseModel):
    checks: dict[str, str]
    note: str | None = Field(default=None, max_length=200)


class ReclassifyIn(BaseModel):
    device_ids: list[uuid.UUID] = Field(min_length=1, max_length=200)
    to_category: Literal["phone", "tablet", "watch"]
    model_id: uuid.UUID | None = None
    reason: str | None = Field(default=None, max_length=200)


class ConvertIn(BaseModel):
    identity: OpeningStockIn
    cost: Decimal | None = Field(default=None, ge=0)


class LibraryCsvIn(BaseModel):
    csv: str = Field(min_length=1, max_length=2_000_000)


@router.get("/options")
def options(ctx: Ctx):
    """grades, lock keys, spec keys and the shop's device settings (for the forms)"""
    from app.modules.devices import types as dtypes

    return {**dtypes.prefs_for(ctx.shop), "lock_keys": list(dtypes.LOCK_KEYS), "spec_keys": list(dtypes.SPEC_KEYS)}


@router.get("/model-specs/{model_id}")
def get_model_specs(model_id: uuid.UUID, ctx: Ctx, db: DB):
    """the spec sheet that fills the add-device form (global sheet + what the shop learned)"""
    from app.modules.devices import types as dtypes

    return dtypes.model_specs(db, ctx.shop_id, model_id)


@router.put("/model-specs/{model_id}")
def put_model_specs(model_id: uuid.UUID, data: ModelSpecsIn, ctx: Transact, db: DB):
    from app.modules.devices import types as dtypes

    return dtypes.set_model_specs(db, ctx.shop_id, model_id, model_number=data.model_number, ram_gb=data.ram_gb, specs=data.specs)


@router.post("/model-specs/import")
def import_model_specs(data: LibraryCsvIn, ctx: Transact, db: DB):
    """CSV: brand, model, category, model_number + spec columns (os, chipset, display_in, …)"""
    from app.modules.devices import types as dtypes

    return dtypes.import_library(db, ctx.shop_id, ctx.id, data.csv)


@router.post("/reclassify/preview")
def reclassify_preview(data: ReclassifyIn, ctx: Transact, db: DB):
    from app.modules.devices import types as dtypes

    return dtypes.reclassify_preview(db, ctx.shop_id, data.device_ids, data.to_category, data.model_id)


@router.post("/reclassify/apply")
def reclassify_apply(data: ReclassifyIn, ctx: Transact, db: DB):
    from app.modules.devices import types as dtypes

    return dtypes.reclassify_apply(db, ctx.shop_id, ctx.id, data.device_ids, data.to_category, data.model_id, data.reason)


@router.post("/from-item/{accessory_id}", response_model=DeviceOut, status_code=201)
def from_item(accessory_id: uuid.UUID, data: ConvertIn, ctx: Transact, db: DB):
    """one counted watch / tablet becomes one serialized unit (the item's count goes down by one)"""
    from app.modules.devices import types as dtypes

    return dtypes.convert_item(db, ctx.shop_id, ctx.id, accessory_id, data.identity, data.cost)


@router.get("/lock-unchecked")
def lock_unchecked(ctx: Ctx, db: DB):
    """used units in stock whose locks were never checked, or failed"""
    from app.modules.devices import types as dtypes

    return dtypes.lock_unchecked(db, ctx.shop_id)


@router.post("/{device_id}/lock-check", response_model=DeviceOut)
def lock_check(device_id: uuid.UUID, data: LockCheckIn, ctx: Transact, db: DB):
    from app.modules.devices import types as dtypes

    d = service.get_device(db, ctx.shop_id, device_id)
    dtypes.record_lock_check(db, ctx.shop_id, ctx.id, d, data.checks, data.note)
    db.commit()
    return service.get_device_out(db, ctx.shop_id, device_id)


@router.get("/{device_id}", response_model=DeviceDetailOut)
def get_device(device_id: uuid.UUID, ctx: Ctx, db: DB):
    d = _hide_cost(ctx, service.get_device_out(db, ctx.shop_id, device_id))
    device = service.get_device(db, ctx.shop_id, device_id)
    events = service.history(db, ctx.shop_id, device_id)
    return {**d, "accessories": list(device.accessories), "recent_events": events[-5:]}


@router.get("/{device_id}/history", response_model=list[EventOut])
def device_history(device_id: uuid.UUID, ctx: Ctx, db: DB):
    rows = service.history(db, ctx.shop_id, device_id)
    if not ctx.can(Cap.VIEW_COST):
        rows = [{**r, "amount": None} if r["type"] == "purchased" else r for r in rows]
    return rows


@router.patch("/{device_id}", response_model=DeviceOut)
def update_device(device_id: uuid.UUID, data: DeviceUpdate, ctx: Transact, db: DB):
    return _hide_cost(ctx, service.update_device(db, ctx.shop_id, ctx, device_id, data))


@router.put("/{device_id}/accessories", response_model=list[AccessoryItemOut])
def set_accessories(device_id: uuid.UUID, items: list[AccessoryItemIn], ctx: Transact, db: DB):
    return service.set_accessories(db, ctx.shop_id, ctx.id, device_id, items)


@router.post("/{device_id}/events", response_model=DeviceOut, status_code=201)
def raise_event(device_id: uuid.UUID, data: EventIn, ctx: Transact, db: DB):
    return _hide_cost(ctx, service.raise_event(db, ctx.shop_id, ctx.id, device_id, data))


class CancelIn(BaseModel):
    reason: str = Field(min_length=2, max_length=300)


@router.post("/{device_id}/cancel-opening", response_model=DeviceOut)
def cancel_opening(device_id: uuid.UUID, data: CancelIn, ctx: Transact, db: DB):
    return _hide_cost(
        ctx, service.cancel_opening_stock(db, ctx.shop_id, ctx, device_id, data.reason)
    )
