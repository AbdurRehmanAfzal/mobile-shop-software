import datetime as dt
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.core.permissions import Cap
from app.core.tenancy import DB, Ctx, require_cap
from app.modules.devices.schemas import DeviceOut
from app.modules.devices.service import get_device_out, with_source
from app.modules.reserve import service
from app.modules.units.router import _plain

router = APIRouter(prefix="/api/v1", tags=["reserve"])
Transact = Annotated[Ctx, Depends(require_cap(Cap.TRANSACT))]


class ReserveIn(BaseModel):
    party_id: uuid.UUID
    until: dt.date | None = None
    note: str | None = Field(default=None, max_length=200)


class ReserveItemIn(ReserveIn):
    qty: int = Field(ge=1, le=100000)


class ReleaseIn(BaseModel):
    reason: str | None = Field(default=None, max_length=200)


def _out(ctx, db, device_id):
    d = with_source(db, [get_device_out(db, ctx.shop_id, device_id)])[0]
    if not ctx.can(Cap.VIEW_COST):
        d = {**d, "cost_price": None}
    return d


@router.post("/devices/{device_id}/reserve", response_model=DeviceOut)
def reserve_device(device_id: uuid.UUID, data: ReserveIn, ctx: Transact, db: DB):
    """hold a phone for one customer (ADR-060)"""
    service.reserve_device(
        db, ctx.shop_id, ctx.id, device_id, party_id=data.party_id, until=data.until, note=data.note
    )
    return _out(ctx, db, device_id)


@router.post("/devices/{device_id}/release", response_model=DeviceOut)
def release_device(device_id: uuid.UUID, data: ReleaseIn, ctx: Transact, db: DB):
    service.release_device(db, ctx.shop_id, ctx.id, device_id, data.reason)
    return _out(ctx, db, device_id)


@router.post("/accessories/{accessory_id}/reserve", status_code=201)
def reserve_item(accessory_id: uuid.UUID, data: ReserveItemIn, ctx: Transact, db: DB):
    """hold some pieces of an item for one customer (ADR-060)"""
    service.reserve_item(
        db,
        ctx.shop_id,
        ctx.id,
        accessory_id,
        party_id=data.party_id,
        qty=data.qty,
        until=data.until,
        note=data.note,
    )
    return _plain(service.item_reservations(db, ctx.shop_id, accessory_id))


@router.get("/accessories/{accessory_id}/reservations")
def item_reservations(accessory_id: uuid.UUID, ctx: Ctx, db: DB):
    return _plain(service.item_reservations(db, ctx.shop_id, accessory_id))


@router.post("/accessories/reservations/{reservation_id}/release")
def release_item(reservation_id: uuid.UUID, data: ReleaseIn, ctx: Transact, db: DB):
    r = service.release_item(db, ctx.shop_id, ctx.id, reservation_id, data.reason)
    return _plain(service.item_reservations(db, ctx.shop_id, r.accessory_id))
