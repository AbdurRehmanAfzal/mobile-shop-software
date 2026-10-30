import datetime as dt
import uuid
from decimal import Decimal

from fastapi import APIRouter, Query
from fastapi.responses import HTMLResponse

from app.core.permissions import Cap
from app.core.tenancy import DB, Ctx
from app.modules.units import service

router = APIRouter(prefix="/api/v1", tags=["units"])


def _plain(v):
    """Decimals as fixed strings, dates as ISO: the same shape the other money endpoints use."""
    if isinstance(v, Decimal):
        return f"{v:.2f}"
    if isinstance(v, dt.datetime | dt.date):
        return v.isoformat()
    if isinstance(v, uuid.UUID):
        return str(v)
    if isinstance(v, dict):
        return {k: _plain(x) for k, x in v.items()}
    if isinstance(v, list | tuple):
        return [_plain(x) for x in v]
    return v


@router.get("/devices/{device_id}/money")
def device_money(device_id: uuid.UUID, ctx: Ctx, db: DB):
    """One phone's money story: purchase side, sale side, payments, margin, timeline."""
    return _plain(service.device_money(db, ctx.shop_id, device_id, can_cost=ctx.can(Cap.VIEW_COST)))


@router.get("/parties/{party_id}/units")
def party_units(party_id: uuid.UUID, ctx: Ctx, db: DB):
    """Every phone bought from / sold to this person, with what is still owed either way."""
    return _plain(service.party_units(db, ctx.shop_id, party_id, can_cost=ctx.can(Cap.VIEW_COST)))


@router.get("/payments/{payment_id}/receipt", response_class=HTMLResponse)
def payment_receipt(
    payment_id: uuid.UUID,
    ctx: Ctx,
    db: DB,
    format: str = Query(default="thermal", pattern="^(thermal|a4)$"),
    lang: str | None = Query(default=None, pattern="^(en|ur)$"),
):
    return service.payment_receipt_html(db, ctx.shop_id, payment_id, format, lang)
