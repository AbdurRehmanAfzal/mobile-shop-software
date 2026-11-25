"""Model-wise sales and purchases with every phone's trail (owner 2026-11-25, mock-up 22 — the
audit's "sales & purchases" tab, ADR-134).

Read-only, from the bill lines. A sold phone: its sale bill (buyer, price, the bill's paid / due
today), the purchase it came in on before that sale (supplier, purchase no) and its cost on the
sale line; a bought phone: its purchase bill (supplier, cost, the bill's paid / owed), where it is
now and, when sold since, to whom and the profit on that sale. Grouped by model the way the
products audit groups them (ADR-125: brand + name key), with the server's own totals and its own
picks (highest profit, lowest / highest cost) — the app adds nothing up. Cost and profit only with
VIEW_COST; returned lines are left out, as in the products audit."""

import uuid
from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.periods import Period
from app.db.base import ZERO
from app.modules.catalogue.models import Brand, Colour, Model, Storage
from app.modules.catalogue.service import name_key
from app.modules.devices.models import Device
from app.modules.ledger.service import money
from app.modules.parties.models import Party
from app.modules.purchases.models import Purchase, PurchaseLine, PurchaseStatus
from app.modules.sales.models import Invoice, InvoiceLine, InvoiceStatus
from app.modules.shopaudit.trade import _pay_status

MAX_LINES = 1000


def _labels(db: Session, devs: list[Device]) -> dict:
    """device id -> (brand, model, storage, colour)"""

    def names(model, ids):
        ids = {i for i in ids if i is not None}
        return (
            dict(db.execute(select(model.id, model.name).where(model.id.in_(ids))).all())
            if ids
            else {}
        )

    b = names(Brand, [d.brand_id for d in devs])
    m = names(Model, [d.model_id for d in devs])
    s = names(Storage, [d.storage_id for d in devs])
    c = names(Colour, [d.colour_id for d in devs])
    return {
        d.id: (
            b.get(d.brand_id, ""),
            m.get(d.model_id, ""),
            s.get(d.storage_id),
            c.get(d.colour_id),
        )
        for d in devs
    }


def _party_names(db: Session, ids) -> dict:
    ids = {i for i in ids if i is not None}
    return (
        dict(db.execute(select(Party.id, Party.name).where(Party.id.in_(ids))).all()) if ids else {}
    )


def _device_fields(d: Device, lab) -> dict:
    _brand, _model, storage, colour = lab
    return {
        "device_id": d.id,
        "imei1": d.imei1,
        "storage": storage,
        "colour": colour,
        "condition": d.condition,
        "pta_status": d.pta_status,
        "category": d.category,
        "status_now": d.status,
    }


def _group(key: str, brand: str, model: str) -> dict:
    return {
        "key": key,
        "brand": brand,
        "model": model,
        "label": f"{brand} {model}".strip(),
        "rows": [],
    }


def sold(db: Session, shop_id: uuid.UUID, p: Period, *, can_cost: bool) -> dict:
    lines = db.execute(
        select(InvoiceLine, Invoice, Device)
        .join(Invoice, Invoice.id == InvoiceLine.invoice_id)
        .join(Device, Device.id == InvoiceLine.device_id)
        .where(
            Invoice.shop_id == shop_id,
            Invoice.date >= p.date_from,
            Invoice.date <= p.date_to,
            Invoice.status != InvoiceStatus.VOID,
            InvoiceLine.kind == "device",
            InvoiceLine.returned_at.is_(None),
        )
        .order_by(Invoice.date.desc(), Invoice.no.desc())
        .limit(MAX_LINES)
    ).all()
    devs = [d for _ln, _inv, d in lines]
    labels = _labels(db, devs)
    # every posted purchase of these phones: the one before (or on) the sale day is its source
    bought: dict = defaultdict(list)
    if devs:
        for dev_id, date, no, pur_id, party_id in db.execute(
            select(
                PurchaseLine.device_id, Purchase.date, Purchase.no, Purchase.id, Purchase.party_id
            )
            .join(Purchase, Purchase.id == PurchaseLine.purchase_id)
            .where(
                Purchase.shop_id == shop_id,
                PurchaseLine.device_id.in_([d.id for d in devs]),
                Purchase.status == PurchaseStatus.POSTED,
            )
            .order_by(Purchase.date, Purchase.created_at)
        ).all():
            bought[dev_id].append((date, no, pur_id, party_id))
    names = _party_names(
        db, [inv.party_id for _l, inv, _d in lines] + [x[3] for v in bought.values() for x in v]
    )
    groups: dict[str, dict] = {}
    for ln, inv, d in lines:
        lab = labels[d.id]
        key = f"model:{d.brand_id}:{name_key(lab[1])}"
        g = groups.setdefault(key, _group(key, lab[0], lab[1]))
        src = [x for x in bought.get(d.id, []) if x[0] <= inv.date]
        src = src[-1] if src else None
        due = money(inv.total - inv.paid - inv.returned_total)
        g["rows"].append(
            {
                **_device_fields(d, lab),
                "invoice_id": inv.id,
                "invoice_no": inv.no,
                "date": inv.date,
                "buyer_id": inv.party_id,
                "buyer": names.get(inv.party_id),
                "price": ln.line_total,
                "bill_total": inv.total,
                "bill_paid": inv.paid,
                "bill_due": max(ZERO, due),
                "pay_status": _pay_status(inv.total, inv.paid, inv.returned_total, inv.status),
                "supplier_id": src[3] if src else None,
                "supplier": names.get(src[3]) if src else None,
                "purchase_id": src[2] if src else None,
                "purchase_no": src[1] if src else None,
                "cost": ln.cost if can_cost else None,
                "profit": money(ln.line_total - ln.cost) if can_cost else None,
            }
        )
    models = []
    for g in groups.values():
        rows = g["rows"]
        out = {
            **g,
            "units": len(rows),
            "revenue": money(sum((r["price"] for r in rows), ZERO)),
            "cost": money(sum((r["cost"] for r in rows), ZERO)) if can_cost else None,
            "profit": money(sum((r["profit"] for r in rows), ZERO)) if can_cost else None,
            "highest_profit": max(rows, key=lambda r: r["profit"]) if can_cost else None,
            "lowest_cost": min(rows, key=lambda r: r["cost"]) if can_cost else None,
        }
        models.append(out)
    models.sort(key=lambda m: (-m["units"], -m["revenue"]))
    return {
        "period": p.as_dict(),
        "models": models,
        "units": sum(m["units"] for m in models),
        "truncated": len(lines) >= MAX_LINES,
        "notes": [
            "Phones only, lines not returned; the supplier is the purchase the phone came in on before the sale.",
            "Paid and due are the whole bill's figures today; a bill with several phones shows them on each.",
        ],
    }


def bought(db: Session, shop_id: uuid.UUID, p: Period) -> dict:
    """phones bought in the period (VIEW_COST only — the router checks)"""
    lines = db.execute(
        select(PurchaseLine, Purchase, Device)
        .join(Purchase, Purchase.id == PurchaseLine.purchase_id)
        .join(Device, Device.id == PurchaseLine.device_id)
        .where(
            Purchase.shop_id == shop_id,
            Purchase.date >= p.date_from,
            Purchase.date <= p.date_to,
            Purchase.status == PurchaseStatus.POSTED,
            PurchaseLine.kind == "device",
            PurchaseLine.returned_at.is_(None),
        )
        .order_by(Purchase.date.desc(), Purchase.no.desc())
        .limit(MAX_LINES)
    ).all()
    devs = [d for _ln, _pur, d in lines]
    labels = _labels(db, devs)
    # the sale of each phone after it was bought (not voided, not returned)
    sales: dict = defaultdict(list)
    if devs:
        for dev_id, date, inv_id, no, party_id, total, cost in db.execute(
            select(
                InvoiceLine.device_id,
                Invoice.date,
                Invoice.id,
                Invoice.no,
                Invoice.party_id,
                InvoiceLine.line_total,
                InvoiceLine.cost,
            )
            .join(Invoice, Invoice.id == InvoiceLine.invoice_id)
            .where(
                Invoice.shop_id == shop_id,
                InvoiceLine.device_id.in_([d.id for d in devs]),
                Invoice.status != InvoiceStatus.VOID,
                InvoiceLine.returned_at.is_(None),
            )
            .order_by(Invoice.date, Invoice.created_at)
        ).all():
            sales[dev_id].append((date, inv_id, no, party_id, total, cost))
    names = _party_names(
        db, [pur.party_id for _l, pur, _d in lines] + [x[3] for v in sales.values() for x in v]
    )
    groups: dict[str, dict] = {}
    for ln, pur, d in lines:
        lab = labels[d.id]
        key = f"model:{d.brand_id}:{name_key(lab[1])}"
        g = groups.setdefault(key, _group(key, lab[0], lab[1]))
        sale = next((x for x in sales.get(d.id, []) if x[0] >= pur.date), None)
        owed = money(pur.total - pur.paid - pur.returned_total)
        g["rows"].append(
            {
                **_device_fields(d, lab),
                "purchase_id": pur.id,
                "purchase_no": pur.no,
                "date": pur.date,
                "supplier_id": pur.party_id,
                "supplier": names.get(pur.party_id),
                "cost": ln.net_cost,
                "bill_total": pur.total,
                "bill_paid": pur.paid,
                "bill_owed": max(ZERO, owed),
                "pay_status": _pay_status(pur.total, pur.paid, pur.returned_total, pur.status),
                "sold": sale is not None,
                "invoice_id": sale[1] if sale else None,
                "invoice_no": sale[2] if sale else None,
                "buyer_id": sale[3] if sale else None,
                "buyer": names.get(sale[3]) if sale else None,
                "sold_for": sale[4] if sale else None,
                "profit": money(sale[4] - sale[5]) if sale else None,
            }
        )
    models = []
    for g in groups.values():
        rows = g["rows"]
        models.append(
            {
                **g,
                "units": len(rows),
                "invested": money(sum((r["cost"] for r in rows), ZERO)),
                "sold": sum(1 for r in rows if r["sold"]),
                "in_stock": sum(1 for r in rows if r["status_now"] == "in_stock"),
                "profit": money(sum((r["profit"] for r in rows if r["profit"] is not None), ZERO)),
                "lowest_cost": min(rows, key=lambda r: r["cost"]),
                "highest_cost": max(rows, key=lambda r: r["cost"]),
            }
        )
    models.sort(key=lambda m: (-m["units"], -m["invested"]))
    return {
        "period": p.as_dict(),
        "models": models,
        "units": sum(m["units"] for m in models),
        "truncated": len(lines) >= MAX_LINES,
        "notes": [
            "Phones only, lines not returned to the supplier; the cost is the line's net cost.",
            "Paid and owed are the whole purchase bill's figures today; profit is the sale since, if any.",
        ],
    }
