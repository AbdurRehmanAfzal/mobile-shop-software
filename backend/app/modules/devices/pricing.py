"""Rate suggestion (FR-AI-03, owner 2026-10-30): what this shop sold the same phone for lately, so the
asking price and the sale price start from the shop's own history instead of memory. Only the shop's
own sales are read: no cross-tenant data."""

import datetime as dt
import statistics
import uuid
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import today as shop_today
from app.modules.devices.models import Device
from app.modules.devices.state import DeviceStatus
from app.modules.sales.models import Invoice, InvoiceLine, InvoiceStatus

WINDOW_DAYS = 180
ROUND_TO = Decimal(100)


def _round(v: Decimal) -> Decimal:
    return ((v / ROUND_TO).quantize(Decimal(1)) * ROUND_TO).quantize(Decimal("0.01"))


def price_hint(
    db: Session,
    shop_id: uuid.UUID,
    model_id: uuid.UUID,
    storage_id: uuid.UUID | None,
    condition: str | None,
    *,
    can_cost: bool,
    exclude_device_id: uuid.UUID | None = None,
) -> dict:
    since = shop_today() - dt.timedelta(days=WINDOW_DAYS)
    rows = db.execute(
        select(
            InvoiceLine.unit_price,
            Invoice.date,
            Device.first_seen_at,
            Device.cost_price,
            Device.storage_id,
            Device.condition,
        )
        .join(Invoice, Invoice.id == InvoiceLine.invoice_id)
        .join(Device, Device.id == InvoiceLine.device_id)
        .where(
            Invoice.shop_id == shop_id,
            Invoice.status.notin_([InvoiceStatus.VOID, InvoiceStatus.RETURNED]),
            Invoice.date >= since,
            InvoiceLine.kind == "device",
            InvoiceLine.returned_at.is_(None),
            Device.model_id == model_id,
        )
        .order_by(Invoice.date.desc(), Invoice.created_at.desc())
    ).all()

    def pick(level: str):
        if level == "exact":
            return [r for r in rows if r.storage_id == storage_id and r.condition == condition]
        if level == "condition":
            return [r for r in rows if r.condition == condition]
        return rows

    basis, sample = "none", []
    for level in ("exact", "condition", "model"):
        cand = pick(level)
        if len(cand) >= 2 or (cand and level == "model"):
            basis, sample = level, cand
            break
    if not sample and rows:
        basis, sample = "model", rows

    # the same model sitting in stock right now, and what it is priced at
    stock_q = select(Device.asking_price).where(
        Device.shop_id == shop_id,
        Device.model_id == model_id,
        Device.status == DeviceStatus.IN_STOCK,
        Device.is_active.is_(True),
    )
    if exclude_device_id:
        stock_q = stock_q.where(Device.id != exclude_device_id)
    asking = [Decimal(a) for a in db.scalars(stock_q).all() if a is not None]

    out: dict = {
        "basis": basis,
        "samples": len(sample),
        "in_stock_same": len(asking),
        "stock_asking_low": min(asking) if asking else None,
        "stock_asking_high": max(asking) if asking else None,
        "last": None,
        "median": None,
        "low": None,
        "high": None,
        "suggested": None,
        "avg_days_to_sell": None,
        "cost_median": None,
    }
    if not sample:
        return out
    prices = [Decimal(r.unit_price) for r in sample]
    last = sample[0]
    days = []
    for r in sample:
        if r.first_seen_at:
            seen = (
                r.first_seen_at.date()
                if isinstance(r.first_seen_at, dt.datetime)
                else r.first_seen_at
            )
            days.append(max(0, (r.date - seen).days))
    median = Decimal(statistics.median(prices))
    out.update(
        {
            "last": {
                "price": Decimal(last.unit_price),
                "date": last.date,
                "days_to_sell": (
                    max(
                        0,
                        (
                            last.date
                            - (
                                last.first_seen_at.date()
                                if isinstance(last.first_seen_at, dt.datetime)
                                else last.first_seen_at
                            )
                        ).days,
                    )
                    if last.first_seen_at
                    else None
                ),
            },
            "median": median,
            "low": min(prices),
            "high": max(prices),
            "suggested": _round(median),
            "avg_days_to_sell": round(sum(days) / len(days), 1) if days else None,
        }
    )
    if can_cost:
        costs = [Decimal(r.cost_price) for r in sample if r.cost_price is not None]
        if costs:
            out["cost_median"] = Decimal(statistics.median(costs))
    return out
