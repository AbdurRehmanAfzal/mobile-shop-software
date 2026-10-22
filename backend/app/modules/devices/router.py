import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query

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
):
    rows = service.list_devices(
        db,
        ctx.shop_id,
        status=status,
        condition=condition,
        pta_status=pta_status,
        brand_id=brand_id,
        q=q,
        limit=limit,
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
    return _hide_cost(ctx, service.update_device(db, ctx.shop_id, ctx.id, device_id, data))


@router.put("/{device_id}/accessories", response_model=list[AccessoryItemOut])
def set_accessories(device_id: uuid.UUID, items: list[AccessoryItemIn], ctx: Transact, db: DB):
    return service.set_accessories(db, ctx.shop_id, ctx.id, device_id, items)


@router.post("/{device_id}/events", response_model=DeviceOut, status_code=201)
def raise_event(device_id: uuid.UUID, data: EventIn, ctx: Transact, db: DB):
    return _hide_cost(ctx, service.raise_event(db, ctx.shop_id, ctx.id, device_id, data))
