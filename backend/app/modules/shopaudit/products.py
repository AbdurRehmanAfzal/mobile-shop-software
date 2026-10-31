"""Sales performance & product analytics, and the invoice audit (docs/16 §8, §12 — docs/17 P7).

Products are read from the bill lines: phones by model (and rolled up to brand and type), other
items by name. Performance classes use the shop's own thresholds and the thresholds are returned
with the rows, so "top" and "low" are never a mystery."""

import datetime as dt
import uuid
from collections import defaultdict

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.periods import Period
from app.db.base import ZERO
from app.db.refs import user_name
from app.modules.catalogue.models import Brand, Model
from app.modules.devices.ageing import intake_map
from app.modules.devices.models import Device
from app.modules.ledger.service import money
from app.modules.payments.models import Payment
from app.modules.purchases.models import Purchase, PurchaseLine, PurchaseStatus
from app.modules.returns.models import ReturnDoc
from app.modules.sales.models import Invoice, InvoiceLine, InvoiceStatus
from app.modules.shopaudit.finance import bucket_of, buckets, granularity
from app.modules.shopaudit.prefs import prefs_for

# ---- product analytics --------------------------------------------------------------------------


def _blank() -> dict:
    return {
        "units": 0,
        "revenue": ZERO,
        "cost": ZERO,
        "profit": ZERO,
        "returns": 0,
        "returns_amount": ZERO,
        "holding_days": [],
        "prices": [],
        "in_stock": 0,
    }


def products(
    db: Session, shop_id: uuid.UUID, shop, p: Period, *, can_cost: bool, group: str = "model"
) -> dict:
    prefs = prefs_for(shop)
    g = granularity(p)
    rows = db.execute(
        select(InvoiceLine, Invoice.date, Device, Brand.name, Model.name)
        .join(Invoice, Invoice.id == InvoiceLine.invoice_id)
        .join(Device, Device.id == InvoiceLine.device_id, isouter=True)
        .join(Brand, Brand.id == Device.brand_id, isouter=True)
        .join(Model, Model.id == Device.model_id, isouter=True)
        .where(
            Invoice.shop_id == shop_id,
            Invoice.date >= p.date_from,
            Invoice.date <= p.date_to,
            Invoice.status != InvoiceStatus.VOID,
        )
    ).all()
    dev_ids = [ln.device_id for ln, _d, dev, _b, _m in rows if ln.device_id]
    intakes = intake_map(db, shop_id, dev_ids) if dev_ids else {}
    agg: dict[str, dict] = defaultdict(_blank)
    meta: dict[str, dict] = {}
    series: dict[dt.date, dict] = defaultdict(lambda: {"units": 0, "revenue": ZERO, "profit": ZERO})
    for ln, date, dev, brand, model in rows:
        if ln.kind == "device" and dev is not None:
            key = (
                f"model:{dev.model_id}"
                if group == "model"
                else f"brand:{dev.brand_id}"
                if group == "brand"
                else f"category:{dev.category}"
            )
            label = (
                f"{brand} {model}"
                if group == "model"
                else brand
                if group == "brand"
                else dev.category
            )
            meta.setdefault(
                key,
                {
                    "key": key,
                    "kind": "device",
                    "label": label,
                    "brand": brand,
                    "model": model if group == "model" else None,
                    "category": dev.category,
                    "model_id": dev.model_id if group == "model" else None,
                    "brand_id": dev.brand_id if group != "category" else None,
                },
            )
        else:
            if group != "model":
                continue  # other items roll up under their own name only
            key = f"item:{ln.accessory_id or (ln.description or '').strip().lower()}"
            meta.setdefault(
                key,
                {
                    "key": key,
                    "kind": "misc",
                    "label": ln.description or "item",
                    "brand": None,
                    "model": None,
                    "category": "item",
                    "model_id": None,
                    "brand_id": None,
                },
            )
        a = agg[key]
        if ln.returned_at is not None:
            a["returns"] += ln.qty
            a["returns_amount"] = money(a["returns_amount"] + ln.line_total)
            continue
        a["units"] += ln.qty
        a["revenue"] = money(a["revenue"] + ln.line_total)
        a["cost"] = money(a["cost"] + ln.cost)
        a["profit"] = money(a["profit"] + (ln.line_total - ln.cost))
        a["prices"].append(ln.unit_price)
        if dev is not None:
            seen = intakes.get(dev.id)
            if seen is not None:
                a["holding_days"].append(max((date - seen.date()).days, 0))
        b = series[bucket_of(date, g)]
        b["units"] += ln.qty
        b["revenue"] = money(b["revenue"] + ln.line_total)
        b["profit"] = money(b["profit"] + (ln.line_total - ln.cost))
    # what is in stock of the same thing right now (phones only)
    if group == "model":
        stock = dict(
            db.execute(
                select(Device.model_id, func.count(Device.id))
                .where(Device.shop_id == shop_id, Device.status == "in_stock")
                .group_by(Device.model_id)
            ).all()
        )
        for key, m in meta.items():
            if m["model_id"] is not None:
                agg[key]["in_stock"] = int(stock.get(m["model_id"], 0))
    total_units = sum(a["units"] for a in agg.values())
    out_rows = []
    for key, m in meta.items():
        a = agg[key]
        share = round(a["units"] / total_units * 100, 1) if total_units else 0.0
        # a thing that barely sold is "low" even when it is a big share of a tiny sample
        cls = (
            "low"
            if a["units"] <= prefs["low_units"]
            else "top"
            if share >= prefs["top_share"]
            else "average"
        )
        out_rows.append(
            {
                **m,
                "units": a["units"],
                "share": share,
                "revenue": a["revenue"],
                "cost": a["cost"] if can_cost else None,
                "profit": a["profit"] if can_cost else None,
                "margin_pct": (
                    round(float(a["profit"] / a["cost"] * 100), 1)
                    if (can_cost and a["cost"])
                    else None
                ),
                "avg_price": money(sum(a["prices"], ZERO) / len(a["prices"]))
                if a["prices"]
                else None,
                "avg_holding_days": (
                    round(sum(a["holding_days"]) / len(a["holding_days"]), 1)
                    if a["holding_days"]
                    else None
                ),
                "returns": a["returns"],
                "returns_amount": a["returns_amount"],
                "in_stock": a["in_stock"],
                "performance": cls,
            }
        )
    out_rows.sort(key=lambda r: (-r["units"], -r["revenue"]))
    # purchases of phones in the same buckets, for purchases vs sales
    bought: dict[dt.date, dict] = defaultdict(lambda: {"units": 0, "cost": ZERO})
    for date, qty, net in db.execute(
        select(Purchase.date, PurchaseLine.qty, PurchaseLine.net_cost)
        .join(Purchase, Purchase.id == PurchaseLine.purchase_id)
        .where(
            Purchase.shop_id == shop_id,
            Purchase.date >= p.date_from,
            Purchase.date <= p.date_to,
            Purchase.status == PurchaseStatus.POSTED,
            PurchaseLine.returned_at.is_(None),
        )
    ).all():
        b = bought[bucket_of(date, g)]
        b["units"] += qty
        b["cost"] = money(b["cost"] + net)
    return {
        "period": p.as_dict(),
        "group": group,
        "granularity": g,
        "total_units": total_units,
        "total_revenue": money(sum((r["revenue"] for r in out_rows), ZERO)),
        "total_profit": money(sum((a["profit"] for a in agg.values()), ZERO)) if can_cost else None,
        "rows": out_rows,
        "classes": {
            "top": sum(1 for r in out_rows if r["performance"] == "top"),
            "average": sum(1 for r in out_rows if r["performance"] == "average"),
            "low": sum(1 for r in out_rows if r["performance"] == "low"),
        },
        "thresholds": {"top_share": prefs["top_share"], "low_units": prefs["low_units"]},
        "series": [
            {
                "bucket": b,
                "units": series[b]["units"] if b in series else 0,
                "revenue": series[b]["revenue"] if b in series else ZERO,
                "profit": (series[b]["profit"] if b in series else ZERO) if can_cost else None,
                "bought_units": bought[b]["units"] if b in bought else 0,
                "bought_cost": (bought[b]["cost"] if b in bought else ZERO) if can_cost else None,
            }
            for b in buckets(p)
        ],
        "notes": [
            "Units, revenue and profit count lines that were not returned; returns are listed apart.",
            (
                "Top = share of units sold at or above the threshold; low = units at or below the threshold "
                "(Settings → Stock audit thresholds)."
            ),
            "Holding days run from the day the phone came in to the day it was sold.",
        ],
    }


# ---- invoice audit --------------------------------------------------------------------------------


def invoices(db: Session, shop_id: uuid.UUID, p: Period, *, can_cost: bool) -> dict:
    inv = db.scalars(
        select(Invoice).where(
            Invoice.shop_id == shop_id, Invoice.date >= p.date_from, Invoice.date <= p.date_to
        )
    ).all()
    pur = db.scalars(
        select(Purchase).where(
            Purchase.shop_id == shop_id, Purchase.date >= p.date_from, Purchase.date <= p.date_to
        )
    ).all()
    pay = db.scalars(
        select(Payment).where(
            Payment.shop_id == shop_id, Payment.date >= p.date_from, Payment.date <= p.date_to
        )
    ).all()
    ret = db.scalars(
        select(ReturnDoc).where(
            ReturnDoc.shop_id == shop_id, ReturnDoc.date >= p.date_from, ReturnDoc.date <= p.date_to
        )
    ).all()

    def _sum(rows, attr="amount"):
        return money(sum((getattr(r, attr) for r in rows), ZERO))

    live_inv = [i for i in inv if i.status != InvoiceStatus.VOID]
    live_pur = [x for x in pur if x.status == PurchaseStatus.POSTED]
    live_pay = [x for x in pay if x.status != "voided"]
    by_kind = [
        {
            "kind": "sale",
            "count": len(live_inv),
            "amount": _sum(live_inv, "total"),
            "voided": len(inv) - len(live_inv),
        },
        {
            "kind": "purchase",
            "count": len(live_pur),
            "amount": _sum(live_pur, "total") if can_cost else None,
            "voided": len(pur) - len(live_pur),
        },
        {
            "kind": "payment_in",
            "count": sum(1 for x in live_pay if x.direction == "in"),
            "amount": _sum([x for x in live_pay if x.direction == "in"]),
            "voided": sum(1 for x in pay if x.status == "voided" and x.direction == "in"),
        },
        {
            "kind": "payment_out",
            "count": sum(1 for x in live_pay if x.direction == "out"),
            "amount": _sum([x for x in live_pay if x.direction == "out"]) if can_cost else None,
            "voided": sum(1 for x in pay if x.status == "voided" and x.direction == "out"),
        },
        {
            "kind": "sale_return",
            "count": sum(1 for r in ret if r.kind == "sale"),
            "amount": _sum([r for r in ret if r.kind == "sale"]),
            "voided": 0,
        },
        {
            "kind": "purchase_return",
            "count": sum(1 for r in ret if r.kind == "purchase"),
            "amount": _sum([r for r in ret if r.kind == "purchase"]) if can_cost else None,
            "voided": 0,
        },
    ]
    by_status = defaultdict(lambda: {"count": 0, "amount": ZERO, "due": ZERO})
    for i in inv:
        s = by_status[i.status]
        s["count"] += 1
        s["amount"] = money(s["amount"] + i.total)
        if i.status in (InvoiceStatus.OPEN, InvoiceStatus.PARTIALLY_PAID):
            s["due"] = money(s["due"] + (i.total - i.paid))
    by_user: dict = defaultdict(
        lambda: {
            "user_id": None,
            "user_name": None,
            "sales": 0,
            "sales_amount": ZERO,
            "purchases": 0,
            "payments": 0,
            "voids": 0,
        }
    )
    for i in inv:
        u = by_user[i.created_by]
        u["user_id"] = i.created_by
        if i.status == InvoiceStatus.VOID:
            u["voids"] += 1
        else:
            u["sales"] += 1
            u["sales_amount"] = money(u["sales_amount"] + i.total)
    for x in pur:
        u = by_user[x.created_by]
        u["user_id"] = x.created_by
        if x.status == PurchaseStatus.POSTED:
            u["purchases"] += 1
        else:
            u["voids"] += 1
    for x in pay:
        u = by_user[x.created_by]
        u["user_id"] = x.created_by
        if x.status == "voided":
            u["voids"] += 1
        else:
            u["payments"] += 1
    for u in by_user.values():
        u["user_name"] = user_name(db, u["user_id"])
    voided = (
        [
            {
                "kind": "sale",
                "id": i.id,
                "no": i.no,
                "date": i.date,
                "amount": i.total,
                "by": user_name(db, i.voided_by),
                "reason": i.void_reason,
            }
            for i in inv
            if i.status == InvoiceStatus.VOID
        ]
        + [
            {
                "kind": "purchase",
                "id": x.id,
                "no": x.no,
                "date": x.date,
                "amount": x.total if can_cost else None,
                "by": user_name(db, x.voided_by),
                "reason": x.void_reason,
            }
            for x in pur
            if x.status != PurchaseStatus.POSTED
        ]
        + [
            {
                "kind": "payment",
                "id": x.id,
                "no": x.no,
                "date": x.date,
                "amount": x.amount,
                "by": None,
                "reason": x.void_reason,
            }
            for x in pay
            if x.status == "voided"
        ]
    )
    voided.sort(key=lambda r: r["date"], reverse=True)
    return {
        "period": p.as_dict(),
        "by_kind": by_kind,
        "by_status": [{"status": k, **v} for k, v in by_status.items()],
        "by_user": sorted(by_user.values(), key=lambda u: -u["sales"]),
        "voided": voided,
        "totals": {
            "documents": len(live_inv) + len(live_pur) + len(live_pay) + len(ret),
            "voided": len(voided),
        },
        "notes": [
            (
                "Every document here opens in its own screen; amounts are the finalised figures the "
                "customer's and the owner's copies share."
            ),
        ],
    }
