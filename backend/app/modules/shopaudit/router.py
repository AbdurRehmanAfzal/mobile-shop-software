"""`/api/v1/shop-audit/*` — owner and manager (REPORTS_ALL); cost and profit only with VIEW_COST."""

import datetime as dt
import uuid
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.errors import ValidationFailed
from app.core.periods import PRESETS, Period, resolve
from app.core.permissions import Cap
from app.core.tenancy import DB, Ctx, require_cap
from app.modules.shopaudit import finance, reconcile, service

router = APIRouter(prefix="/api/v1/shop-audit", tags=["shop-audit"])
Reports = Annotated[Ctx, Depends(require_cap(Cap.REPORTS_ALL))]
Preset = Annotated[str | None, Query(pattern="^(" + "|".join(PRESETS) + ")$")]


def plain(v):
    """Decimals as fixed strings, dates as ISO (the shape the other money endpoints use)."""
    if isinstance(v, Decimal):
        return f"{v:.2f}"
    if isinstance(v, dt.datetime | dt.date):
        return v.isoformat()
    if isinstance(v, uuid.UUID):
        return str(v)
    if isinstance(v, dict):
        return {k: plain(x) for k, x in v.items()}
    if isinstance(v, list | tuple):
        return [plain(x) for x in v]
    return v


def period_of(
    db: Session,
    shop_id: uuid.UUID,
    preset: str | None,
    date_from: dt.date | None,
    date_to: dt.date | None,
    as_of: dt.date | None,
) -> Period:
    try:
        return resolve(
            preset,
            date_from,
            date_to,
            as_of,
            first_day=service.first_day(db, shop_id) if preset == "all_time" else None,
        )
    except ValueError as e:
        raise ValidationFailed(code="bad_period", message_en=str(e), message_ur=str(e)) from e


@router.get("/period")
def period(
    ctx: Reports,
    db: DB,
    preset: Preset = None,
    date_from: dt.date | None = None,
    date_to: dt.date | None = None,
    as_of: dt.date | None = None,
):
    """What a preset means today (from, to, as-of, the period before) — the UI shows it back."""
    return plain(period_of(db, ctx.shop_id, preset, date_from, date_to, as_of).as_dict())


@router.get("/overview")
def overview(
    ctx: Reports,
    db: DB,
    preset: Preset = None,
    date_from: dt.date | None = None,
    date_to: dt.date | None = None,
    as_of: dt.date | None = None,
):
    """The KPI set for the period: sales, purchases, profit, expenses, money, debt, stock — each
    balance with opening / closing / as-of / current, each flow as the period's sum."""
    p = period_of(db, ctx.shop_id, preset, date_from, date_to, as_of)
    return plain(service.overview(db, ctx.shop_id, p, can_cost=ctx.can(Cap.VIEW_COST)))


@router.get("/reconcile")
def reconcile_(
    ctx: Reports,
    db: DB,
    preset: Preset = None,
    date_from: dt.date | None = None,
    date_to: dt.date | None = None,
):
    """The books proving themselves: cash, groups, khata caches, stock units, allocations."""
    p = period_of(db, ctx.shop_id, preset, date_from, date_to, None)
    rows = reconcile.checks(db, ctx.shop_id, p)
    return plain({"period": p.as_dict(), "ok": all(r["ok"] for r in rows), "checks": rows})


# ---- P4: financial audit --------------------------------------------------------------------


def _p(db, ctx, preset, date_from, date_to, as_of=None):
    return period_of(db, ctx.shop_id, preset, date_from, date_to, as_of)


@router.get("/pnl")
def pnl(
    ctx: Reports,
    db: DB,
    preset: Preset = None,
    date_from: dt.date | None = None,
    date_to: dt.date | None = None,
):
    """Profit & loss for the period, the period before, and a day / week / month series."""
    p = _p(db, ctx, preset, date_from, date_to)
    out = finance.pnl(db, ctx.shop_id, p)
    if not ctx.can(Cap.VIEW_COST):
        for k in ("current", "previous"):
            out[k] = {
                x: v
                for x, v in out[k].items()
                if x
                in (
                    "date_from",
                    "date_to",
                    "sales",
                    "net_sales",
                    "gross_sales",
                    "discounts",
                    "sales_returns",
                    "tax_collected",
                )
            }
        out["series"] = [
            {"bucket": r["bucket"], "net_sales": r["net_sales"]} for r in out["series"]
        ]
    return plain(out)


@router.get("/cash")
def cash(
    ctx: Reports,
    db: DB,
    preset: Preset = None,
    date_from: dt.date | None = None,
    date_to: dt.date | None = None,
    as_of: dt.date | None = None,
):
    """Every cash / bank / wallet account: opening, what came in and went out by reason, closing;
    channels and payment methods."""
    return plain(finance.cash(db, ctx.shop_id, _p(db, ctx, preset, date_from, date_to, as_of)))


@router.get("/international")
def international(
    ctx: Reports,
    db: DB,
    preset: Preset = None,
    date_from: dt.date | None = None,
    date_to: dt.date | None = None,
):
    """Remittances from abroad on sales, purchases and stand-alone payments."""
    return plain(finance.international(db, ctx.shop_id, _p(db, ctx, preset, date_from, date_to)))


@router.get("/expenses")
def expenses(
    ctx: Reports,
    db: DB,
    preset: Preset = None,
    date_from: dt.date | None = None,
    date_to: dt.date | None = None,
):
    """Expenses by category, account, person; series; largest; the period before."""
    return plain(finance.expenses(db, ctx.shop_id, _p(db, ctx, preset, date_from, date_to)))


@router.get("/tax")
def tax(
    ctx: Reports,
    db: DB,
    preset: Preset = None,
    date_from: dt.date | None = None,
    date_to: dt.date | None = None,
):
    """Tax charged on bills: summary and every taxed bill."""
    return plain(finance.tax(db, ctx.shop_id, _p(db, ctx, preset, date_from, date_to)))
