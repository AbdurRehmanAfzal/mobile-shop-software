import datetime as dt
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.permissions import Cap
from app.core.tenancy import DB, Ctx, require_cap
from app.modules.reports import service

router = APIRouter(prefix="/api/v1/reports", tags=["reports"])
Reports = Annotated[Ctx, Depends(require_cap(Cap.REPORTS_ALL))]


def _money(v):
    """Serialise Decimals as "1234.00" strings like every other endpoint."""
    if isinstance(v, Decimal):
        return f"{v:.2f}"
    if isinstance(v, dict):
        return {k: _money(x) for k, x in v.items()}
    if isinstance(v, list):
        return [_money(x) for x in v]
    return v


def _range(date_from: dt.date | None, date_to: dt.date | None) -> tuple[dt.date, dt.date]:
    today = dt.date.today()
    return date_from or today.replace(day=1), date_to or today


@router.get("/dashboard")
def dashboard(ctx: Ctx, db: DB):
    return _money(service.dashboard(db, ctx.shop_id, ctx.can(Cap.VIEW_COST)))


@router.get("/profit-loss")
def profit_loss(
    ctx: Reports, db: DB, date_from: dt.date | None = None, date_to: dt.date | None = None
):
    return _money(service.profit_and_loss(db, ctx.shop_id, *_range(date_from, date_to)))


@router.get("/cash-flow")
def cash_flow(
    ctx: Reports, db: DB, date_from: dt.date | None = None, date_to: dt.date | None = None
):
    return _money(service.cash_flow(db, ctx.shop_id, *_range(date_from, date_to)))


@router.get("/tax")
def tax(ctx: Reports, db: DB, date_from: dt.date | None = None, date_to: dt.date | None = None):
    return _money(service.tax_report(db, ctx.shop_id, *_range(date_from, date_to)))


@router.get("/stock-ageing")
def stock_ageing(ctx: Reports, db: DB):
    return _money(service.stock_ageing(db, ctx.shop_id, ctx.can(Cap.VIEW_COST)))
