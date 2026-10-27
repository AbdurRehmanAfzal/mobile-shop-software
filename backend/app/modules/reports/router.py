import datetime as dt
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.errors import ValidationFailed
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
    d_from, d_to = date_from or today.replace(day=1), date_to or today
    _check_range(d_from, d_to)
    return d_from, d_to


def _check_range(d_from: dt.date, d_to: dt.date) -> None:
    if d_from > d_to:
        raise ValidationFailed(
            code="bad_date_range",
            message_en="The 'from' date must be on or before the 'to' date",
            message_ur="شروع کی تاریخ آخری تاریخ سے پہلے ہونی چاہیے",
        )


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


@router.get("/stock-summary")
def stock_summary(ctx: Ctx, db: DB):
    """Stock worth by brand and model (cost for owner/manager, asking price for others)."""
    return _money(service.stock_summary(db, ctx.shop_id, ctx.can(Cap.VIEW_COST)))


@router.get("/day")
def day(
    ctx: Ctx,
    db: DB,
    date: dt.date | None = None,
    date_from: dt.date | None = None,
    date_to: dt.date | None = None,
):
    """Hisaab of a day (`date`, default today) or a period (`date_from`..`date_to`: week, month,
    from-to); profit only with VIEW_COST."""
    d_from = date_from or date or dt.date.today()
    _check_range(d_from, date_to or d_from)
    return _money(
        service.day_report(db, ctx.shop_id, d_from, ctx.can(Cap.VIEW_COST), date_to or d_from)
    )


@router.get("/top-sellers")
def top_sellers(
    ctx: Reports, db: DB, date_from: dt.date | None = None, date_to: dt.date | None = None
):
    """What sold the most (phones by model, other items by name); profit with VIEW_COST."""
    return _money(
        service.top_sellers(db, ctx.shop_id, *_range(date_from, date_to), ctx.can(Cap.VIEW_COST))
    )


@router.get("/forecast")
def forecast(ctx: Reports, db: DB):
    """Next 7 days' expected sales and how long each model's stock lasts (an estimate)."""
    return _money(service.forecast(db, ctx.shop_id, dt.date.today()))
