"""Units, purchase batches (cost history + FIFO), price history, prices by customer tier, the item
timeline and the item reports (owner addendum 5, docs/24 + docs/25). The old `Accessory.qty` /
`avg_cost` stay the live projection; every movement is still an `AccessoryMovement` row."""

import datetime as dt
import uuid
from decimal import Decimal

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.clock import today as shop_today
from app.core.errors import ValidationFailed
from app.db.base import ZERO
from app.modules.accessories.models import (
    Accessory,
    AccessoryBatch,
    AccessoryMovement,
    AccessoryPriceChange,
    AccessorySupplierSku,
)
from app.modules.auth.models import Shop
from app.modules.ledger.service import money
from app.modules.parties.models import Party

GRADES = ("unspecified", "original", "oem", "a_grade", "copy", "used")
BASE_UNIT = "piece"
DEFAULT_UNITS = {"piece": 1, "dozen": 12, "box": 10, "carton": 120}
DEFAULT_PREFS = {
    "valuation": "avg",  # avg | fifo
    "allow_negative_stock": False,
    "units": dict(DEFAULT_UNITS),
    "grades": list(GRADES),
}
PRICE_FIELDS = ("avg_cost", "price", "wholesale_price", "min_price", "promo_price")


# ---- shop preferences ---------------------------------------------------------------------------


def prefs_for(shop: Shop) -> dict:
    p = {k: (dict(v) if isinstance(v, dict) else list(v) if isinstance(v, list) else v) for k, v in DEFAULT_PREFS.items()}
    raw = shop.item_prefs or {}
    if raw.get("valuation") in ("avg", "fifo"):
        p["valuation"] = raw["valuation"]
    if "allow_negative_stock" in raw:
        p["allow_negative_stock"] = bool(raw["allow_negative_stock"])
    if isinstance(raw.get("units"), dict):
        for k, v in raw["units"].items():
            try:
                n = int(v)
            except (TypeError, ValueError):
                continue
            if 1 <= n <= 100000 and str(k).strip():
                p["units"][str(k).strip().lower()] = n
        p["units"]["piece"] = 1
    if isinstance(raw.get("grades"), list) and raw["grades"]:
        p["grades"] = ["unspecified", *[str(g).strip().lower() for g in raw["grades"] if str(g).strip() and str(g).strip().lower() != "unspecified"]][:20]
    return p


def clean_prefs(raw: dict | None) -> dict | None:
    if raw is None:
        return None
    if not isinstance(raw, dict):
        raise TypeError("item_prefs must be an object")
    out: dict = {}
    if "valuation" in raw:
        if raw["valuation"] not in ("avg", "fifo"):
            raise ValueError("valuation must be avg or fifo")
        out["valuation"] = raw["valuation"]
    if "allow_negative_stock" in raw:
        out["allow_negative_stock"] = bool(raw["allow_negative_stock"])
    if "units" in raw and isinstance(raw["units"], dict):
        out["units"] = {str(k).strip().lower(): int(v) for k, v in raw["units"].items() if str(k).strip() and 1 <= int(v) <= 100000}
    if "grades" in raw and isinstance(raw["grades"], list):
        out["grades"] = [str(g).strip().lower() for g in raw["grades"] if str(g).strip()][:20]
    return out


# ---- units --------------------------------------------------------------------------------------


def units_for(shop: Shop, a: Accessory | None = None) -> dict[str, int]:
    """piece → 1, dozen → 12, …: the shop's table, overridden by the item's own packaging."""
    u = dict(prefs_for(shop)["units"])
    if a is not None and isinstance(a.pack_units, dict):
        for k, v in a.pack_units.items():
            try:
                n = int(v)
            except (TypeError, ValueError):
                continue
            if n >= 1:
                u[str(k).lower()] = n
    u[BASE_UNIT] = 1
    return u


def to_pieces(shop: Shop, a: Accessory | None, unit: str | None, qty: int) -> tuple[int, int]:
    """(pieces, pieces per unit) for a quantity typed in `unit`."""
    unit = (unit or BASE_UNIT).lower()
    table = units_for(shop, a)
    if unit not in table:
        raise ValidationFailed(
            code="unit_unknown",
            message_en=f"Unknown unit '{unit}'. Known: {', '.join(table)}",
            message_ur=f"نامعلوم یونٹ '{unit}'۔ معلوم: {', '.join(table)}",
        )
    per = table[unit]
    return qty * per, per


# ---- prices -------------------------------------------------------------------------------------


def promo_active(a: Accessory, today: dt.date | None = None) -> bool:
    if a.promo_price is None:
        return False
    today = today or shop_today()
    if a.promo_from and today < a.promo_from:
        return False
    return not (a.promo_to and today > a.promo_to)


def sale_price_for(a: Accessory, party: Party | None, today: dt.date | None = None) -> tuple[Decimal, str]:
    """(price, tier): promo beats everything; a wholesale customer gets the wholesale price; else retail."""
    if promo_active(a, today):
        return money(a.promo_price), "promo"
    if party is not None and getattr(party, "wholesale", False) and a.wholesale_price is not None:
        return money(a.wholesale_price), "wholesale"
    return money(a.price), "retail"


def margin(a: Accessory) -> dict:
    cost = money(a.avg_cost or ZERO)
    price = money(a.price or ZERO)
    profit = money(price - cost)
    pct = money(profit / cost * 100) if cost > ZERO else None
    return {"profit": profit, "margin_pct": pct}


def price_from_markup(cost: Decimal, markup_pct: Decimal) -> Decimal:
    """fixed-amount pricing types the price; markup pricing derives it from cost, rounded to Rs. 10"""
    raw = cost * (Decimal(1) + markup_pct / 100)
    return money((raw / 10).to_integral_value() * 10)


def log_price_change(db: Session, shop_id: uuid.UUID, user_id: uuid.UUID | None, a: Accessory, field: str, old, new, source: str = "edit") -> None:
    old_m = money(old) if old is not None else None
    new_m = money(new) if new is not None else None
    if old_m == new_m:
        return
    db.add(
        AccessoryPriceChange(
            shop_id=shop_id,
            accessory_id=a.id,
            field=field,
            old_value=old_m,
            new_value=new_m,
            source=source,
            user_id=user_id,
        )
    )


# ---- batches (cost history, FIFO) ---------------------------------------------------------------


def add_batch(
    db: Session,
    shop_id: uuid.UUID,
    a: Accessory,
    *,
    qty: int,
    unit_cost: Decimal,
    source: str,
    document_type: str | None = None,
    document_id: uuid.UUID | None = None,
    party_id: uuid.UUID | None = None,
    pack_unit: str | None = None,
    pack_qty: int | None = None,
    batch_ref: str | None = None,
    day: dt.date | None = None,
) -> AccessoryBatch:
    b = AccessoryBatch(
        shop_id=shop_id,
        accessory_id=a.id,
        source=source,
        document_type=document_type,
        document_id=document_id,
        party_id=party_id,
        date=day or shop_today(),
        qty_in=qty,
        qty_left=qty,
        unit_cost=money(unit_cost),
        pack_unit=pack_unit,
        pack_qty=pack_qty,
        batch_ref=batch_ref,
    )
    db.add(b)
    db.flush()
    return b


def consume_batches(db: Session, a: Accessory, qty: int) -> Decimal:
    """Takes `qty` pieces out of the oldest batches first; returns their total cost (FIFO)."""
    left = qty
    total = ZERO
    batches = db.scalars(
        select(AccessoryBatch)
        .where(AccessoryBatch.accessory_id == a.id, AccessoryBatch.qty_left > 0)
        .order_by(AccessoryBatch.date, AccessoryBatch.created_at)
    ).all()
    for b in batches:
        if left <= 0:
            break
        take = min(b.qty_left, left)
        b.qty_left -= take
        total += b.unit_cost * take
        left -= take
    if left > 0:  # more sold than ever batched (negative stock allowed, or pre-batch rows): average
        total += money(a.avg_cost or ZERO) * left
    return money(total)


def batches_of(db: Session, shop_id: uuid.UUID, accessory_id: uuid.UUID) -> list[dict]:
    rows = db.execute(
        select(AccessoryBatch, Party.name)
        .outerjoin(Party, Party.id == AccessoryBatch.party_id)
        .where(AccessoryBatch.shop_id == shop_id, AccessoryBatch.accessory_id == accessory_id)
        .order_by(AccessoryBatch.date.desc(), AccessoryBatch.created_at.desc())
    ).all()
    return [
        {
            "id": str(b.id), "date": b.date, "source": b.source, "document_type": b.document_type,
            "document_id": str(b.document_id) if b.document_id else None, "party_id": str(b.party_id) if b.party_id else None,
            "party_name": pname, "qty_in": b.qty_in, "qty_left": b.qty_left, "unit_cost": b.unit_cost,
            "pack_unit": b.pack_unit, "pack_qty": b.pack_qty, "batch_ref": b.batch_ref,
        }
        for b, pname in rows
    ]


def backfill_batches(db: Session, shop: Shop) -> int:
    """Items that have stock but no batch get one 'Opening stock' batch at today's average cost.
    Idempotent: items with any batch are left alone."""
    n = 0
    with_batches = set(
        db.scalars(select(AccessoryBatch.accessory_id).where(AccessoryBatch.shop_id == shop.id)).all()
    )
    for a in db.scalars(select(Accessory).where(Accessory.shop_id == shop.id)).all():
        if a.id in with_batches or (a.qty or 0) <= 0:
            continue
        first = db.scalar(
            select(func.min(AccessoryMovement.at)).where(AccessoryMovement.accessory_id == a.id)
        )
        add_batch(
            db, shop.id, a, qty=a.qty, unit_cost=a.avg_cost or ZERO, source="opening",
            document_type="opening_stock", document_id=a.id, batch_ref="Opening stock",
            day=first.date() if isinstance(first, dt.datetime) else None,
        )
        n += 1
    db.commit()
    return n


# ---- supplier SKUs, duplicates ------------------------------------------------------------------


def set_supplier_skus(db: Session, shop_id: uuid.UUID, a: Accessory, rows: list[dict]) -> None:
    for old in db.scalars(select(AccessorySupplierSku).where(AccessorySupplierSku.accessory_id == a.id)).all():
        db.delete(old)
    seen = set()
    for r in rows or []:
        sku = str(r.get("sku") or "").strip()
        pid = r.get("party_id")
        if not sku or (pid, sku.upper()) in seen:
            continue
        seen.add((pid, sku.upper()))
        db.add(AccessorySupplierSku(shop_id=shop_id, accessory_id=a.id, party_id=pid, sku=sku))
    db.flush()


def supplier_skus_of(db: Session, accessory_id: uuid.UUID) -> list[dict]:
    rows = db.execute(
        select(AccessorySupplierSku, Party.name)
        .outerjoin(Party, Party.id == AccessorySupplierSku.party_id)
        .where(AccessorySupplierSku.accessory_id == accessory_id)
    ).all()
    return [{"party_id": str(s.party_id) if s.party_id else None, "party_name": n, "sku": s.sku} for s, n in rows]


def by_supplier_sku(db: Session, shop_id: uuid.UUID, code: str, party_id: uuid.UUID | None = None) -> Accessory | None:
    q = (
        select(Accessory)
        .join(AccessorySupplierSku, AccessorySupplierSku.accessory_id == Accessory.id)
        .where(Accessory.shop_id == shop_id, func.lower(AccessorySupplierSku.sku) == code.strip().lower())
    )
    if party_id is not None:
        q = q.where(AccessorySupplierSku.party_id == party_id)
    return db.scalar(q.order_by(AccessorySupplierSku.created_at))


def similar(db: Session, shop_id: uuid.UUID, name: str, brand: str | None = None, color: str | None = None, exclude_id: uuid.UUID | None = None) -> list[Accessory]:
    """Items whose name shares its words with the new one (the duplicate warning)."""
    words = [w for w in "".join(ch if ch.isalnum() else " " for ch in (name or "").lower()).split() if len(w) >= 3]
    if not words:
        return []
    conds = [Accessory.name.ilike(f"%{w}%") for w in words[:4]]
    q = select(Accessory).where(Accessory.shop_id == shop_id, Accessory.is_active.is_(True), or_(*conds))
    if exclude_id is not None:
        q = q.where(Accessory.id != exclude_id)
    rows = db.scalars(q.limit(50)).all()

    def score(a: Accessory) -> int:
        n = a.name.lower()
        s = sum(1 for w in words if w in n)
        if brand and a.brand and a.brand.lower() == brand.lower():
            s += 1
        if color and a.color and a.color.lower() == color.lower():
            s += 1
        return s

    ranked = sorted(rows, key=score, reverse=True)
    return [a for a in ranked if score(a) >= max(1, min(2, len(words)))][:5]


# ---- timeline -----------------------------------------------------------------------------------


def timeline(db: Session, shop_id: uuid.UUID, a: Accessory) -> list[dict]:
    """Purchases, sales, returns, adjustments and price changes of one item, newest first, each
    pointing at its document and person."""
    from app.modules.purchases.models import Purchase
    from app.modules.sales.models import Invoice

    out: list[dict] = []
    moves = db.scalars(
        select(AccessoryMovement).where(AccessoryMovement.accessory_id == a.id).order_by(AccessoryMovement.at.desc())
    ).all()
    for m in moves:
        row = {
            "kind": "move", "at": m.at, "reason": m.reason, "qty_delta": m.qty_delta, "qty_after": m.qty_after,
            "unit_cost": m.unit_cost, "document_type": m.document_type, "document_id": str(m.document_id) if m.document_id else None,
            "doc_no": m.note, "party_id": None, "party_name": None, "amount": None, "paid": None, "remaining": None,
        }
        if m.document_type == "purchase" and m.document_id:
            p = db.get(Purchase, m.document_id)
            if p:
                party = db.get(Party, p.party_id) if p.party_id else None
                row.update({"doc_no": p.no, "party_id": str(p.party_id) if p.party_id else None, "party_name": party.name if party else None, "amount": p.total, "paid": p.paid, "remaining": money(p.total - p.paid)})
        elif m.document_type == "invoice" and m.document_id:
            inv = db.get(Invoice, m.document_id)
            if inv:
                party = db.get(Party, inv.party_id) if inv.party_id else None
                row.update({"doc_no": inv.no, "party_id": str(inv.party_id) if inv.party_id else None, "party_name": party.name if party else None, "amount": inv.total, "paid": inv.paid, "remaining": money(inv.total - inv.paid)})
        out.append(row)
    for c in db.scalars(select(AccessoryPriceChange).where(AccessoryPriceChange.accessory_id == a.id).order_by(AccessoryPriceChange.at.desc())).all():
        out.append({"kind": "price", "at": c.at, "field": c.field, "old": c.old_value, "new": c.new_value, "source": c.source})
    out.sort(key=lambda r: r["at"], reverse=True)
    return out


# ---- reports ------------------------------------------------------------------------------------


def _last_supplier(db: Session, shop_id: uuid.UUID) -> dict[uuid.UUID, tuple[uuid.UUID | None, str | None]]:
    """item → (party_id, name) of its latest purchase batch"""
    rows = db.execute(
        select(AccessoryBatch.accessory_id, AccessoryBatch.party_id, Party.name, AccessoryBatch.date)
        .outerjoin(Party, Party.id == AccessoryBatch.party_id)
        .where(AccessoryBatch.shop_id == shop_id, AccessoryBatch.source == "purchase")
        .order_by(AccessoryBatch.date)
    ).all()
    out: dict = {}
    for aid, pid, name, _d in rows:
        out[aid] = (pid, name)
    return out


def low_stock(db: Session, shop_id: uuid.UUID) -> dict:
    items = db.scalars(select(Accessory).where(Accessory.shop_id == shop_id, Accessory.is_active.is_(True), Accessory.qty <= Accessory.reorder_level).order_by(Accessory.name)).all()
    sup = _last_supplier(db, shop_id)
    groups: dict[str, dict] = {}
    for a in items:
        pid, pname = sup.get(a.id, (None, None))
        key = str(pid) if pid else "none"
        g = groups.setdefault(key, {"party_id": str(pid) if pid else None, "party_name": pname, "lines": [], "estimated_cost": ZERO})
        want = max((a.max_stock or (a.reorder_level * 3) or 10) - a.qty, 1)
        g["lines"].append({"id": str(a.id), "sku": a.sku, "name": a.name, "qty": a.qty, "reorder_level": a.reorder_level, "suggest_qty": want, "last_cost": a.avg_cost, "unit": a.unit})
        g["estimated_cost"] = money(g["estimated_cost"] + (a.avg_cost or ZERO) * want)
    return {"count": len(items), "groups": sorted(groups.values(), key=lambda g: (g["party_name"] or "~"))}


def valuation(db: Session, shop_id: uuid.UUID) -> dict:
    items = db.scalars(select(Accessory).where(Accessory.shop_id == shop_id, Accessory.is_active.is_(True), Accessory.qty != 0)).all()
    by_cat: dict[str, dict] = {}
    cost_total = retail_total = ZERO
    units = 0
    for a in items:
        c = money((a.avg_cost or ZERO) * a.qty)
        r = money((a.price or ZERO) * a.qty)
        cost_total += c
        retail_total += r
        units += a.qty
        g = by_cat.setdefault(a.category, {"category": a.category, "items": 0, "units": 0, "cost": ZERO, "retail": ZERO})
        g["items"] += 1
        g["units"] += a.qty
        g["cost"] = money(g["cost"] + c)
        g["retail"] = money(g["retail"] + r)
    return {"items": len(items), "units": units, "cost": money(cost_total), "retail": money(retail_total), "expected_profit": money(retail_total - cost_total), "by_category": sorted(by_cat.values(), key=lambda g: -g["cost"])}


def _sold(db: Session, shop_id: uuid.UUID, d_from: dt.date, d_to: dt.date):
    from app.modules.sales.models import Invoice, InvoiceLine, InvoiceStatus

    return db.execute(
        select(InvoiceLine, Invoice.date, Invoice.party_id)
        .join(Invoice, Invoice.id == InvoiceLine.invoice_id)
        .where(Invoice.shop_id == shop_id, Invoice.date >= d_from, Invoice.date <= d_to, Invoice.status != InvoiceStatus.VOID, InvoiceLine.returned_at.is_(None), InvoiceLine.accessory_id.is_not(None))
    ).all()


def movers(db: Session, shop_id: uuid.UUID, d_from: dt.date, d_to: dt.date, show_cost: bool) -> dict:
    """fast and slow movers in the period: sold units per item, with stock and days of cover"""
    sold: dict[uuid.UUID, dict] = {}
    for ln, _date, _pid in _sold(db, shop_id, d_from, d_to):
        s = sold.setdefault(ln.accessory_id, {"units": 0, "revenue": ZERO, "cost": ZERO})
        s["units"] += ln.qty
        s["revenue"] = money(s["revenue"] + ln.line_total)
        s["cost"] = money(s["cost"] + ln.cost)
    items = db.scalars(select(Accessory).where(Accessory.shop_id == shop_id, Accessory.is_active.is_(True))).all()
    days = max((d_to - d_from).days + 1, 1)
    rows = []
    for a in items:
        s = sold.get(a.id, {"units": 0, "revenue": ZERO, "cost": ZERO})
        per_day = Decimal(s["units"]) / days
        rows.append({
            "id": str(a.id), "sku": a.sku, "name": a.name, "category": a.category, "brand": a.brand, "qty": a.qty,
            "sold": s["units"], "revenue": s["revenue"], "profit": money(s["revenue"] - s["cost"]) if show_cost else None,
            "days_of_cover": int(a.qty / per_day) if per_day > 0 else None,
        })
    fast = sorted([r for r in rows if r["sold"] > 0], key=lambda r: -r["sold"])[:20]
    slow = sorted([r for r in rows if r["qty"] > 0], key=lambda r: (r["sold"], -r["qty"]))[:20]
    return {"from": d_from, "to": d_to, "fast": fast, "slow": slow}


def profit_by(db: Session, shop_id: uuid.UUID, d_from: dt.date, d_to: dt.date, group: str) -> list[dict]:
    items = {a.id: a for a in db.scalars(select(Accessory).where(Accessory.shop_id == shop_id)).all()}
    out: dict[str, dict] = {}
    for ln, _date, _pid in _sold(db, shop_id, d_from, d_to):
        a = items.get(ln.accessory_id)
        key = (a.brand or "—") if group == "brand" else (a.category if a else "other")
        g = out.setdefault(key, {"key": key, "units": 0, "revenue": ZERO, "cost": ZERO, "profit": ZERO})
        g["units"] += ln.qty
        g["revenue"] = money(g["revenue"] + ln.line_total)
        g["cost"] = money(g["cost"] + ln.cost)
        g["profit"] = money(g["revenue"] - g["cost"])
    return sorted(out.values(), key=lambda g: -g["profit"])


def dead_stock(db: Session, shop_id: uuid.UUID, days: int) -> list[dict]:
    """in stock, and not sold for `days` days (or never)"""
    from app.modules.sales.models import Invoice, InvoiceLine, InvoiceStatus

    cutoff = shop_today() - dt.timedelta(days=days)
    last = dict(
        db.execute(
            select(InvoiceLine.accessory_id, func.max(Invoice.date))
            .join(Invoice, Invoice.id == InvoiceLine.invoice_id)
            .where(Invoice.shop_id == shop_id, Invoice.status != InvoiceStatus.VOID, InvoiceLine.accessory_id.is_not(None))
            .group_by(InvoiceLine.accessory_id)
        ).all()
    )
    rows = []
    for a in db.scalars(select(Accessory).where(Accessory.shop_id == shop_id, Accessory.is_active.is_(True), Accessory.qty > 0)).all():
        ls = last.get(a.id)
        if ls is None or ls <= cutoff:
            rows.append({"id": str(a.id), "sku": a.sku, "name": a.name, "category": a.category, "qty": a.qty, "value": money((a.avg_cost or ZERO) * a.qty), "last_sold": ls, "days": (shop_today() - ls).days if ls else None})
    return sorted(rows, key=lambda r: -r["value"])


def supplier_summary(db: Session, shop_id: uuid.UUID, d_from: dt.date, d_to: dt.date) -> list[dict]:
    from app.modules.purchases.models import Purchase, PurchaseLine

    rows = db.execute(
        select(Purchase.party_id, Party.name, func.count(func.distinct(Purchase.id)), func.sum(PurchaseLine.qty), func.sum(PurchaseLine.net_cost))
        .join(PurchaseLine, PurchaseLine.purchase_id == Purchase.id)
        .outerjoin(Party, Party.id == Purchase.party_id)
        .where(Purchase.shop_id == shop_id, Purchase.date >= d_from, Purchase.date <= d_to, PurchaseLine.accessory_id.is_not(None), PurchaseLine.returned_at.is_(None))
        .group_by(Purchase.party_id, Party.name)
    ).all()
    out = [{"party_id": str(pid) if pid else None, "party_name": name, "bills": n, "units": int(units or 0), "amount": money(Decimal(str(amt or 0)))} for pid, name, n, units, amt in rows]
    return sorted(out, key=lambda r: -r["amount"])
