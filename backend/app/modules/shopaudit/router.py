"""`/api/v1/shop-audit/*` — owner and manager (REPORTS_ALL); cost and profit only with VIEW_COST."""

import datetime as dt
import uuid
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.errors import Forbidden, ValidationFailed
from app.core.periods import PRESETS, Period, resolve
from app.core.permissions import Cap, Role
from app.core.tenancy import DB, Ctx, require_cap
from app.modules.auth.models import Shop
from app.modules.shopaudit import (
    finance,
    inventory,
    parties,
    products,
    reconcile,
    report,
    security,
    service,
)

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


# ---- P5: customers & suppliers -----------------------------------------------------------------

Metric = Annotated[str, Query(pattern="^(" + "|".join(parties.METRICS) + ")$")]


@router.get("/parties/{party_id}/journey")
def journey(party_id: uuid.UUID, ctx: Reports, db: DB, as_of: dt.date | None = None):
    """One person from their first bill to the chosen day: counts, totals, money, balance, timeline."""
    from app.core.clock import today as shop_today

    return plain(
        parties.journey(
            db, ctx.shop_id, party_id, as_of or shop_today(), can_cost=ctx.can(Cap.VIEW_COST)
        )
    )


@router.get("/rankings")
def rankings(
    ctx: Reports,
    db: DB,
    metric: Metric = "customers_sales",
    preset: Preset = None,
    date_from: dt.date | None = None,
    date_to: dt.date | None = None,
    as_of: dt.date | None = None,
    limit: int = 10,
):
    """Top customers / suppliers by one named metric."""
    p = _p(db, ctx, preset, date_from, date_to, as_of)
    return plain(
        parties.rankings(
            db, ctx.shop_id, p, metric, can_cost=ctx.can(Cap.VIEW_COST), limit=min(limit, 50)
        )
    )


@router.get("/udhaar")
def udhaar(
    ctx: Reports,
    db: DB,
    preset: Preset = None,
    date_from: dt.date | None = None,
    date_to: dt.date | None = None,
    as_of: dt.date | None = None,
    limit: int = 20,
):
    """Receivables and payables apart: totals, period movement, age bands, people, phones."""
    p = _p(db, ctx, preset, date_from, date_to, as_of)
    return plain(
        parties.udhaar(db, ctx.shop_id, p, can_cost=ctx.can(Cap.VIEW_COST), limit=min(limit, 100))
    )


# ---- P6: inventory intelligence -----------------------------------------------------------------


def _shop(db, ctx) -> Shop:
    return db.get(Shop, ctx.shop_id)


@router.get("/inventory")
def inventory_(ctx: Reports, db: DB, as_of: dt.date | None = None):
    """What is in stock now (or on a day): every dimension, values, most expensive, status counts."""
    return plain(
        inventory.summary(db, ctx.shop_id, _shop(db, ctx), as_of, can_cost=ctx.can(Cap.VIEW_COST))
    )


@router.get("/inventory/ageing")
def ageing(ctx: Reports, db: DB):
    """Every phone in stock with its age in the shop's bands, supplier, cost, asking, margin; alerts."""
    return plain(inventory.ageing(db, ctx.shop_id, _shop(db, ctx), can_cost=ctx.can(Cap.VIEW_COST)))


@router.get("/verification")
def verification_(
    ctx: Reports,
    db: DB,
    preset: Preset = None,
    date_from: dt.date | None = None,
    date_to: dt.date | None = None,
):
    """ID checks: status counts, checks done in the period, every bypass with who skipped it."""
    p = _p(db, ctx, preset, date_from, date_to)
    return plain(inventory.verification(db, ctx.shop_id, _shop(db, ctx), p))


# ---- P7: products & invoice audit ---------------------------------------------------------------

Group = Annotated[str, Query(pattern="^(model|brand|category)$")]


@router.get("/products")
def products_(
    ctx: Reports,
    db: DB,
    preset: Preset = None,
    date_from: dt.date | None = None,
    date_to: dt.date | None = None,
    group: Group = "model",
):
    """What sold: per model / brand / type — units, revenue, cost, profit, margin, average price,
    holding days, returns, stock left — with the performance class and its thresholds."""
    p = _p(db, ctx, preset, date_from, date_to)
    return plain(
        products.products(
            db, ctx.shop_id, _shop(db, ctx), p, can_cost=ctx.can(Cap.VIEW_COST), group=group
        )
    )


@router.get("/invoices")
def invoices_(
    ctx: Reports,
    db: DB,
    preset: Preset = None,
    date_from: dt.date | None = None,
    date_to: dt.date | None = None,
):
    """Documents in the period by kind, status and employee; everything that was voided."""
    p = _p(db, ctx, preset, date_from, date_to)
    return plain(products.invoices(db, ctx.shop_id, p, can_cost=ctx.can(Cap.VIEW_COST)))


# ---- P8: owner security feed ---------------------------------------------------------------------

Kind = Annotated[str | None, Query(pattern="^(" + "|".join(security.KINDS) + ")$")]


@router.get("/security")
def security_(
    ctx: Reports,
    db: DB,
    preset: Preset = None,
    date_from: dt.date | None = None,
    date_to: dt.date | None = None,
    kind: Kind = None,
    user_id: uuid.UUID | None = None,
    limit: int = 200,
):
    """Owner only: price changes, sales under asking / cost, discounts, voids, reversals, stock
    adjustments, opening balances, skipped ID checks, wrong PINs, admin actions — who, when, why."""
    if ctx.role != Role.OWNER:
        raise Forbidden()
    p = _p(db, ctx, preset, date_from, date_to)
    return plain(
        security.feed(
            db, ctx.shop_id, _shop(db, ctx), p, kind=kind, user_id=user_id, limit=min(limit, 500)
        )
    )


# ---- P10: the complete shop audit report ---------------------------------------------------------

Fmt = Annotated[str, Query(pattern="^(pdf|xlsx|json)$")]
Mode = Annotated[str, Query(pattern="^(summary|detail)$")]


@router.get("/report")
def report_(
    ctx: Reports,
    db: DB,
    preset: Preset = None,
    date_from: dt.date | None = None,
    date_to: dt.date | None = None,
    as_of: dt.date | None = None,
    sections: str | None = None,
    mode: Mode = "summary",
    format: Fmt = "pdf",
    lang: Annotated[str | None, Query(pattern="^(en|ur)$")] = None,
):
    """One report of the chosen sections for the period: a printable page (Save as PDF) or an
    Excel workbook with a sheet per section; `json` returns the same tables for the screen."""
    p = _p(db, ctx, preset, date_from, date_to, as_of)
    shop = _shop(db, ctx)
    wanted = [
        x
        for x in (sections.split(",") if sections else list(report.SECTIONS))
        if x in report.SECTIONS
    ]
    secs = report.build(
        db,
        ctx.shop_id,
        shop,
        p,
        sections=wanted,
        detail=mode == "detail",
        can_cost=ctx.can(Cap.VIEW_COST),
        is_owner=ctx.role == Role.OWNER,
    )
    if format == "xlsx":
        return report.xlsx(shop.name, p, secs, mode)
    if format == "json":
        return plain(
            {
                "period": p.as_dict(),
                "sections": secs,
                "available": list(report.SECTIONS),
                "titles": report.TITLES,
            }
        )
    return report.printable(shop.name, p, secs, mode, lang)
