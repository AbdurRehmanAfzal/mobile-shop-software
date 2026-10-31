import datetime as dt
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select

from app.core.clock import today as shop_today
from app.core.permissions import Cap
from app.core.tenancy import DB, Ctx, require_cap
from app.modules.accessories import service
from app.modules.accessories import stock as inv
from app.modules.accessories.models import CATEGORIES, Accessory
from app.modules.accessories.schemas import (
    AccessoryCreate,
    AccessoryOut,
    AccessoryUpdate,
    AdjustIn,
    BulkPriceIn,
    MovementOut,
    PendingItemOut,
)
from app.modules.shopaudit.router import plain

router = APIRouter(prefix="/api/v1/accessories", tags=["accessories"])
Transact = Annotated[Ctx, Depends(require_cap(Cap.TRANSACT))]
Cost = Annotated[Ctx, Depends(require_cap(Cap.VIEW_COST))]


@router.get("/categories")
def categories(ctx: Ctx, db: DB):
    """The known kinds, then the shop's own kinds (e.g. "Ring light") in the order first used."""
    own = db.scalars(
        select(Accessory.category)
        .where(Accessory.shop_id == ctx.shop_id, Accessory.category.not_in(CATEGORIES))
        .group_by(Accessory.category)
        .order_by(func.min(Accessory.created_at))
    ).all()
    return [*CATEGORIES, *own]


@router.get("/pending", response_model=list[PendingItemOut])
def pending(ctx: Ctx, db: DB):
    return service.pending_items(db, ctx.shop_id)


@router.post("/pending/{item_id}/deliver")
def deliver_pending(item_id: uuid.UUID, ctx: Transact, db: DB):
    return service.deliver_pending(db, ctx.shop_id, ctx.id, item_id)


@router.get("", response_model=list[AccessoryOut])
def list_accessories(
    ctx: Ctx,
    db: DB,
    q: str | None = Query(default=None, max_length=60),
    category: str | None = None,
    low_only: bool = False,
    include_inactive: bool = False,
    brand: str | None = None,
    grade: str | None = None,
    supplier_id: uuid.UUID | None = None,
    location: str | None = None,
    out_only: bool = False,
    sale_only: bool = False,
):
    rows = service.list_accessories(
        db,
        ctx.shop_id,
        q=q,
        category=category,
        low_only=low_only,
        include_inactive=include_inactive,
        brand=brand,
        grade=grade,
        supplier_id=supplier_id,
        location=location,
        out_only=out_only,
        sale_only=sale_only,
    )
    return [service.to_out(a, ctx.can(Cap.VIEW_COST), shop=ctx.shop) for a in rows]


@router.get("/options")
def options(ctx: Ctx, db: DB):
    """units, grades and the shop's item settings (for the forms)"""
    p = inv.prefs_for(ctx.shop)
    return plain({**p, "brands": list(db.scalars(select(Accessory.brand).where(Accessory.shop_id == ctx.shop_id, Accessory.brand.is_not(None)).group_by(Accessory.brand).order_by(Accessory.brand)).all()), "locations": list(db.scalars(select(Accessory.location).where(Accessory.shop_id == ctx.shop_id, Accessory.location.is_not(None)).group_by(Accessory.location)).all())})


@router.get("/similar")
def similar(ctx: Ctx, db: DB, name: str = Query(min_length=2, max_length=150), brand: str | None = None, color: str | None = None, exclude: uuid.UUID | None = None):
    """the duplicate warning: items that look like the one being typed"""
    return plain([service.to_out(a, ctx.can(Cap.VIEW_COST)) for a in inv.similar(db, ctx.shop_id, name, brand, color, exclude)])


@router.get("/lookup")
def lookup(ctx: Ctx, db: DB, code: str = Query(min_length=1, max_length=80), supplier_id: uuid.UUID | None = None):
    """our SKU / barcode / maker's code / a supplier's SKU → the item (the purchase screen)"""
    c = code.strip()
    a = db.scalar(select(Accessory).where(Accessory.shop_id == ctx.shop_id, Accessory.sku == c.upper()))
    matched = "sku" if a else None
    if a is None:
        a = db.scalar(select(Accessory).where(Accessory.shop_id == ctx.shop_id, Accessory.barcode.in_([c, c.upper()])))
        matched = "barcode" if a else None
    if a is None:
        a = db.scalar(select(Accessory).where(Accessory.shop_id == ctx.shop_id, Accessory.manufacturer_code == c))
        matched = "manufacturer_code" if a else None
    if a is None:
        a = inv.by_supplier_sku(db, ctx.shop_id, c, supplier_id)
        matched = "supplier_sku" if a else None
    return plain({"found": a is not None, "matched": matched, "item": service.to_out(a, ctx.can(Cap.VIEW_COST), db, ctx.shop) if a else None})


@router.post("/bulk-price")
def bulk_price(data: BulkPriceIn, ctx: Cost, db: DB):
    """raise / lower a price field by a percentage or a fixed amount across a category, brand or list"""
    from app.modules.ledger.service import money

    stmt = select(Accessory).where(Accessory.shop_id == ctx.shop_id, Accessory.is_active.is_(True))
    if data.ids:
        stmt = stmt.where(Accessory.id.in_(data.ids))
    if data.category:
        stmt = stmt.where(Accessory.category == data.category)
    if data.brand:
        stmt = stmt.where(Accessory.brand.ilike(data.brand))
    n = 0
    for a in db.scalars(stmt).all():
        old = getattr(a, data.field)
        base = old if old is not None else (a.price if data.field != "price" else None)
        if base is None:
            continue
        new = money(base * (1 + (data.pct or 0) / 100) + (data.amount or 0))
        if new < 0:
            new = money(0)
        if new != money(base if old is not None else 0):
            inv.log_price_change(db, ctx.shop_id, ctx.id, a, data.field, old, new, source="bulk")
            setattr(a, data.field, new)
            n += 1
    db.commit()
    return {"updated": n}


@router.post("/backfill-batches")
def backfill_batches(ctx: Cost, db: DB):
    """one 'Opening stock' batch for every item that has stock but no batch yet (idempotent)"""
    return {"items": inv.backfill_batches(db, ctx.shop)}


@router.get("/reports/low-stock")
def report_low_stock(ctx: Cost, db: DB):
    return plain(inv.low_stock(db, ctx.shop_id))


@router.get("/reports/valuation")
def report_valuation(ctx: Cost, db: DB):
    return plain(inv.valuation(db, ctx.shop_id))


@router.get("/reports/movers")
def report_movers(ctx: Ctx, db: DB, date_from: dt.date | None = None, date_to: dt.date | None = None):
    d_to = date_to or shop_today()
    d_from = date_from or (d_to - dt.timedelta(days=29))
    return plain(inv.movers(db, ctx.shop_id, d_from, d_to, ctx.can(Cap.VIEW_COST)))


@router.get("/reports/profit")
def report_profit(ctx: Cost, db: DB, date_from: dt.date | None = None, date_to: dt.date | None = None, group: str = Query(default="category", pattern="^(category|brand)$")):
    d_to = date_to or shop_today()
    d_from = date_from or (d_to - dt.timedelta(days=29))
    return plain(inv.profit_by(db, ctx.shop_id, d_from, d_to, group))


@router.get("/reports/dead-stock")
def report_dead(ctx: Cost, db: DB, days: int = Query(default=60, ge=7, le=730)):
    return plain(inv.dead_stock(db, ctx.shop_id, days))


@router.get("/reports/suppliers")
def report_suppliers(ctx: Cost, db: DB, date_from: dt.date | None = None, date_to: dt.date | None = None):
    d_to = date_to or shop_today()
    d_from = date_from or (d_to - dt.timedelta(days=29))
    return plain(inv.supplier_summary(db, ctx.shop_id, d_from, d_to))


@router.post("", response_model=AccessoryOut, status_code=201)
def create(data: AccessoryCreate, ctx: Transact, db: DB):
    return service.to_out(service.create(db, ctx.shop_id, ctx.id, data), ctx.can(Cap.VIEW_COST))


@router.get("/{accessory_id}", response_model=AccessoryOut)
def get(accessory_id: uuid.UUID, ctx: Ctx, db: DB):
    return service.to_out(
        service.get_accessory(db, ctx.shop_id, accessory_id), ctx.can(Cap.VIEW_COST), db, ctx.shop
    )


@router.get("/{accessory_id}/price")
def price_for(accessory_id: uuid.UUID, ctx: Ctx, db: DB, party_id: uuid.UUID | None = None):
    """the price the sale screen pre-fills: promo, wholesale (dealer customer) or retail"""
    from app.modules.parties.models import Party

    a = service.get_accessory(db, ctx.shop_id, accessory_id)
    party = db.get(Party, party_id) if party_id else None
    if party is not None and party.shop_id != ctx.shop_id:
        party = None
    price, tier = inv.sale_price_for(a, party)
    return plain({"price": price, "tier": tier, "min_price": a.min_price, "qty": a.qty, "warranty_days": a.warranty_days})


@router.get("/{accessory_id}/timeline")
def timeline(accessory_id: uuid.UUID, ctx: Ctx, db: DB):
    """every purchase, sale, return, adjustment and price change of the item (cost only for VIEW_COST)"""
    a = service.get_accessory(db, ctx.shop_id, accessory_id)
    rows = inv.timeline(db, ctx.shop_id, a)
    if not ctx.can(Cap.VIEW_COST):
        rows = [r for r in rows if not (r["kind"] == "price" and r["field"] in ("avg_cost", "min_price"))]
        for r in rows:
            if r["kind"] == "move":
                r["unit_cost"] = None
    return plain(rows)


@router.get("/{accessory_id}/batches")
def batches(accessory_id: uuid.UUID, ctx: Cost, db: DB):
    service.get_accessory(db, ctx.shop_id, accessory_id)
    return plain(inv.batches_of(db, ctx.shop_id, accessory_id))


@router.patch("/{accessory_id}", response_model=AccessoryOut)
def update(accessory_id: uuid.UUID, data: AccessoryUpdate, ctx: Transact, db: DB):
    return service.to_out(
        service.update(db, ctx.shop_id, ctx.id, accessory_id, data), ctx.can(Cap.VIEW_COST)
    )


@router.post("/{accessory_id}/adjust", response_model=AccessoryOut)
def adjust(accessory_id: uuid.UUID, data: AdjustIn, ctx: Cost, db: DB):
    return service.to_out(service.adjust(db, ctx.shop_id, ctx.id, accessory_id, data), True)


@router.get("/{accessory_id}/movements", response_model=list[MovementOut])
def movements(accessory_id: uuid.UUID, ctx: Cost, db: DB, limit: int = Query(default=100, le=500)):
    return service.movements(db, ctx.shop_id, accessory_id, limit)


@router.delete("/{accessory_id}")
def delete(accessory_id: uuid.UUID, ctx: Transact, db: DB):
    return {"result": service.delete(db, ctx.shop_id, ctx, accessory_id)}
