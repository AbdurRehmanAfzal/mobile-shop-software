import uuid
from decimal import Decimal

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.clock import today as shop_today
from app.core.errors import Conflict, NotFound, ValidationFailed
from app.db.base import ZERO
from app.modules.accessories import stock as inv
from app.modules.accessories.models import Accessory, AccessoryMovement
from app.modules.accessories.schemas import AccessoryCreate, AccessoryUpdate, AdjustIn
from app.modules.audit.service import record_audit
from app.modules.catalogue.models import Brand, Model
from app.modules.devices.models import Device, DeviceAccessoryItem
from app.modules.devices.state import DeviceStatus
from app.modules.ledger import accounts as acc
from app.modules.ledger.service import Posting, money, post
from app.modules.parties.models import Party


def get_accessory(db: Session, shop_id: uuid.UUID, accessory_id: uuid.UUID) -> Accessory:
    a = db.get(Accessory, accessory_id)
    if a is None or a.shop_id != shop_id:
        raise NotFound(
            code="accessory_not_found",
            message_en="Accessory not found",
            message_ur="یہ چیز نہیں ملی",
        )
    return a


def _sku(db: Session, shop_id: uuid.UUID, name: str) -> str:
    base = "".join(ch for ch in name.upper() if ch.isalnum())[:8] or "ACC"
    n = (db.scalar(select(func.count(Accessory.id)).where(Accessory.shop_id == shop_id)) or 0) + 1
    return f"{base}-{n:03d}"


def create(db: Session, shop_id: uuid.UUID, user_id: uuid.UUID, data: AccessoryCreate) -> Accessory:
    sku = (data.sku or _sku(db, shop_id, data.name)).strip().upper()
    if db.scalar(select(Accessory.id).where(Accessory.shop_id == shop_id, Accessory.sku == sku)):
        raise Conflict(
            code="sku_exists", message_en="SKU already exists", message_ur="یہ SKU پہلے سے موجود ہے"
        )
    a = Accessory(
        shop_id=shop_id,
        sku=sku,
        name=data.name.strip(),
        name_ur=data.name_ur,
        category=data.category,
        price=money(data.price),
        reorder_level=data.reorder_level,
    )
    _apply_details(a, data)
    db.add(a)
    db.flush()
    if data.supplier_skus:
        inv.set_supplier_skus(db, shop_id, a, [s.model_dump() for s in data.supplier_skus])
    # owner addendum 4: one barcode per SKU, made with the item
    from app.modules.auth.models import Shop
    from app.modules.barcodes.service import assign_item

    assign_item(
        db,
        db.get(Shop, shop_id),
        a,
        value=data.barcode,
        kind=data.barcode_type,
        manufacturer_code=data.manufacturer_code,
    )
    db.flush()
    if data.opening_qty > 0:
        move(
            db,
            shop_id,
            user_id,
            a,
            data.opening_qty,
            "adjust",
            money(data.opening_cost),
            document_type="opening_stock",
            document_id=a.id,
            note="Opening stock",
            batch_ref="Opening stock",
        )
        cost = money(data.opening_cost * data.opening_qty)
        if cost > ZERO:
            posting = Posting(
                document_type="opening_stock", document_id=a.id, memo=f"Opening accessories {a.sku}"
            )
            posting.debit(acc.SysAccount.INVENTORY, cost, memo=a.name).credit(
                acc.SysAccount.EQUITY, cost
            )
            post(db, shop_id, user_id, posting)
    record_audit(
        db,
        shop_id=shop_id,
        user_id=user_id,
        entity="accessory",
        entity_id=a.id,
        action="create",
        after={"sku": a.sku, "name": a.name},
    )
    db.commit()
    return a


def update(
    db: Session,
    shop_id: uuid.UUID,
    user_id: uuid.UUID,
    accessory_id: uuid.UUID,
    data: AccessoryUpdate,
) -> Accessory:
    a = get_accessory(db, shop_id, accessory_id)
    changes = data.model_dump(exclude_unset=True)
    skus = changes.pop("supplier_skus", None)
    for k, v in changes.items():
        if k in inv.PRICE_FIELDS:
            inv.log_price_change(db, shop_id, user_id, a, k, getattr(a, k), v)
        if k == "compatible_model_ids" and v is not None:
            v = [str(x) for x in v]
        setattr(a, k, money(v) if isinstance(v, Decimal) else v)
    if a.pricing_mode == "markup" and a.markup_pct is not None and ("markup_pct" in changes or "pricing_mode" in changes):
        new_price = inv.price_from_markup(a.avg_cost or ZERO, a.markup_pct)
        inv.log_price_change(db, shop_id, user_id, a, "price", a.price, new_price, source="markup")
        a.price = new_price
    if skus is not None:
        inv.set_supplier_skus(db, shop_id, a, skus)
    record_audit(
        db,
        shop_id=shop_id,
        user_id=user_id,
        entity="accessory",
        entity_id=a.id,
        action="update",
        after={k: str(v) for k, v in changes.items()},
    )
    db.commit()
    return a


def move(
    db: Session,
    shop_id: uuid.UUID,
    user_id: uuid.UUID | None,
    a: Accessory,
    qty_delta: int,
    reason: str,
    unit_cost: Decimal | None = None,
    *,
    document_type: str | None = None,
    document_id: uuid.UUID | None = None,
    note: str | None = None,
    party_id: uuid.UUID | None = None,
    pack_unit: str | None = None,
    pack_qty: int | None = None,
    batch_ref: str | None = None,
) -> AccessoryMovement:
    """Apply a stock movement; incoming stock updates the weighted average cost and opens a
    batch; outgoing stock empties the oldest batches first (the FIFO cost is on the movement when
    the shop values stock that way)."""
    from app.modules.auth.models import Shop

    shop = db.get(Shop, shop_id)
    prefs = inv.prefs_for(shop) if shop else inv.DEFAULT_PREFS
    if qty_delta < 0 and a.qty + qty_delta < 0 and not prefs["allow_negative_stock"]:
        raise ValidationFailed(
            code="insufficient_stock",
            message_en=f"Only {a.qty} × {a.name} in stock",
            message_ur=f"{a.name} کی صرف {a.qty} تعداد اسٹاک میں ہے",
        )
    fifo_cost = None
    if qty_delta > 0 and unit_cost is not None:
        if a.qty > 0:
            total_before = money(a.avg_cost * a.qty)
            a.avg_cost = money((total_before + unit_cost * qty_delta) / (a.qty + qty_delta))
        else:  # nothing (or a negative count) on hand: the new lot sets the cost
            a.avg_cost = money(unit_cost)
        if reason in ("purchase", "return", "adjust", "void"):
            inv.add_batch(
                db,
                shop_id,
                a,
                qty=qty_delta,
                unit_cost=unit_cost,
                source="opening" if document_type == "opening_stock" else reason,
                document_type=document_type,
                document_id=document_id,
                party_id=party_id,
                pack_unit=pack_unit,
                pack_qty=pack_qty,
                batch_ref=batch_ref,
            )
    elif qty_delta < 0:
        fifo_cost = inv.consume_batches(db, a, -qty_delta)
    a.qty += qty_delta
    cost_total = None  # what the pieces that left actually cost (FIFO: the exact batch total)
    if qty_delta < 0 and unit_cost is None:
        if prefs["valuation"] == "fifo" and fifo_cost is not None:
            cost_total = fifo_cost
            unit_cost = money(fifo_cost / -qty_delta)
        else:
            unit_cost = a.avg_cost
            cost_total = money(a.avg_cost * -qty_delta)
    m = AccessoryMovement(
        shop_id=shop_id,
        accessory_id=a.id,
        qty_delta=qty_delta,
        qty_after=a.qty,
        reason=reason,
        unit_cost=money(unit_cost if unit_cost is not None else a.avg_cost),
        document_type=document_type,
        document_id=document_id,
        note=note,
        user_id=user_id,
    )
    m.cost_total = cost_total  # transient, not a column
    db.add(m)
    db.flush()
    return m


def adjust(
    db: Session, shop_id: uuid.UUID, user_id: uuid.UUID, accessory_id: uuid.UUID, data: AdjustIn
) -> Accessory:
    a = get_accessory(db, shop_id, accessory_id)
    unit_cost = money(data.unit_cost) if data.unit_cost is not None else a.avg_cost
    move(
        db,
        shop_id,
        user_id,
        a,
        data.qty_delta,
        "adjust",
        unit_cost if data.qty_delta > 0 else None,
        note=data.note,
    )
    value = money(unit_cost * abs(data.qty_delta))
    if value > ZERO:
        posting = Posting(
            document_type="stock_adjust",
            document_id=a.id,
            memo=f"Adjust {a.sku} {data.qty_delta:+d}: {data.note or ''}",
        )
        if data.qty_delta > 0:
            posting.debit(acc.SysAccount.INVENTORY, value, memo=a.name).credit(
                acc.SysAccount.OTHER_INCOME, value
            )
        else:
            posting.debit(acc.expense_account("stock_loss"), value, memo=a.name).credit(
                acc.SysAccount.INVENTORY, value
            )
        post(db, shop_id, user_id, posting)
    record_audit(
        db,
        shop_id=shop_id,
        user_id=user_id,
        entity="accessory",
        entity_id=a.id,
        action="adjust",
        after={"qty_delta": data.qty_delta, "note": data.note},
    )
    db.commit()
    return a


def list_accessories(
    db: Session,
    shop_id: uuid.UUID,
    *,
    q: str | None,
    category: str | None,
    low_only: bool,
    include_inactive: bool,
    brand: str | None = None,
    grade: str | None = None,
    supplier_id: uuid.UUID | None = None,
    location: str | None = None,
    out_only: bool = False,
    sale_only: bool = False,
) -> list[Accessory]:
    from app.modules.accessories.models import AccessoryBatch, AccessorySupplierSku

    stmt = select(Accessory).where(Accessory.shop_id == shop_id)
    if not include_inactive:
        stmt = stmt.where(Accessory.is_active.is_(True))
    if q:
        like = f"%{q.strip()}%"
        sup = select(AccessorySupplierSku.accessory_id).where(AccessorySupplierSku.sku.ilike(like))
        stmt = stmt.where(
            or_(
                Accessory.name.ilike(like),
                Accessory.name_ur.ilike(like),
                Accessory.sku.ilike(like),
                Accessory.barcode.ilike(like),
                Accessory.manufacturer_code.ilike(like),
                Accessory.brand.ilike(like),
                Accessory.compatible.ilike(like),
                Accessory.id.in_(sup),
            )
        )
    if category:
        stmt = stmt.where(Accessory.category == category)
    if brand:
        stmt = stmt.where(Accessory.brand.ilike(brand))
    if grade:
        stmt = stmt.where(Accessory.grade == grade)
    if location:
        stmt = stmt.where(Accessory.location.ilike(f"%{location}%"))
    if supplier_id is not None:
        bought = select(AccessoryBatch.accessory_id).where(AccessoryBatch.party_id == supplier_id)
        skus = select(AccessorySupplierSku.accessory_id).where(AccessorySupplierSku.party_id == supplier_id)
        stmt = stmt.where(or_(Accessory.id.in_(bought), Accessory.id.in_(skus)))
    if low_only:
        stmt = stmt.where(Accessory.qty <= Accessory.reorder_level)
    if out_only:
        stmt = stmt.where(Accessory.qty <= 0)
    if sale_only:
        stmt = stmt.where(Accessory.show_in_sale.is_(True))
    return list(db.scalars(stmt.order_by(Accessory.name)).all())


def to_out(a: Accessory, show_cost: bool, db: Session | None = None, shop=None) -> dict:
    m = inv.margin(a)
    return {
        **{c.name: getattr(a, c.name) for c in Accessory.__table__.columns},
        "avg_cost": a.avg_cost if show_cost else None,
        "low_stock": a.qty <= a.reorder_level,
        "profit": m["profit"] if show_cost else None,
        "margin_pct": m["margin_pct"] if show_cost else None,
        "stock_value": money((a.avg_cost or ZERO) * a.qty) if show_cost else None,
        "supplier_skus": inv.supplier_skus_of(db, a.id) if db is not None else [],
        "units": inv.units_for(shop, a) if shop is not None else {},
    }


def _apply_details(a: Accessory, data) -> None:
    """the optional product-card fields, only those that were sent"""
    from app.modules.accessories.schemas import AccessoryDetails

    for k in AccessoryDetails.model_fields:
        if k == "supplier_skus":
            continue
        v = getattr(data, k, None)
        if v is None:
            continue
        if k == "compatible_model_ids":
            v = [str(x) for x in v]
        setattr(a, k, money(v) if isinstance(v, Decimal) else v)


def movements(
    db: Session, shop_id: uuid.UUID, accessory_id: uuid.UUID, limit: int
) -> list[AccessoryMovement]:
    get_accessory(db, shop_id, accessory_id)
    return list(
        db.scalars(
            select(AccessoryMovement)
            .where(AccessoryMovement.accessory_id == accessory_id)
            .order_by(AccessoryMovement.at.desc())
            .limit(limit)
        ).all()
    )


# ---- pending device accessories (FR-ACC-02/03) ---------------------------------------------


def pending_items(db: Session, shop_id: uuid.UUID) -> list[dict]:
    rows = db.execute(
        select(DeviceAccessoryItem, Device)
        .join(Device, Device.id == DeviceAccessoryItem.device_id)
        .where(
            Device.shop_id == shop_id,
            DeviceAccessoryItem.pending_from != "none",
            DeviceAccessoryItem.delivered_at.is_(None),
        )
        .order_by(DeviceAccessoryItem.expected_at, DeviceAccessoryItem.promised_to_customer_at)
    ).all()
    out = []
    today = shop_today()
    for item, device in rows:
        b, m = db.get(Brand, device.brand_id), db.get(Model, device.model_id)
        party = (
            db.get(Party, device.current_party_id)
            if device.current_party_id and device.status == DeviceStatus.SOLD
            else None
        )
        if item.pending_from == "vendor" and device.events:
            first = next((e for e in device.events if e.type == "purchased"), None)
            if first and first.party_id:
                party = db.get(Party, first.party_id)
        due = item.promised_to_customer_at if item.pending_from == "shop" else item.expected_at
        out.append(
            {
                "item_id": item.id,
                "device_id": device.id,
                "imei1": device.imei1,
                "device_label": f"{b.name if b else ''} {m.name if m else ''}".strip(),
                "kind": item.kind,
                "label": item.label,
                "pending_from": item.pending_from,
                "expected_at": item.expected_at,
                "promised_to_customer_at": item.promised_to_customer_at,
                "party_id": party.id if party else None,
                "party_name": party.name if party else None,
                "party_phone": party.phone if party else None,
                "overdue": due is not None and due < today,
            }
        )
    return out


def deliver_pending(
    db: Session, shop_id: uuid.UUID, user_id: uuid.UUID, item_id: uuid.UUID
) -> dict:
    item = db.get(DeviceAccessoryItem, item_id)
    if item is None:
        raise NotFound(code="item_not_found")
    device = db.get(Device, item.device_id)
    if device is None or device.shop_id != shop_id:
        raise NotFound(code="item_not_found")
    if item.pending_from == "vendor":
        item.came_with = True
    elif item.pending_from == "shop":
        item.given_at_sale = True
    item.pending_from = "none"
    item.delivered_at = shop_today()
    record_audit(
        db,
        shop_id=shop_id,
        user_id=user_id,
        entity="device",
        entity_id=device.id,
        action="accessory_delivered",
        after={"kind": item.kind},
    )
    db.commit()
    return {"ok": True}


def delete(db: Session, shop_id: uuid.UUID, ctx, accessory_id: uuid.UUID) -> str:
    from app.core.errors import Conflict, Forbidden
    from app.core.permissions import Cap
    from app.db.refs import count_references

    if not ctx.can(Cap.VOID):
        raise Forbidden()
    a = get_accessory(db, shop_id, accessory_id)
    if a.qty != 0:
        raise Conflict(
            code="accessory_has_stock",
            message_en="Stock is not zero. Adjust the stock to 0 first.",
            message_ur="اسٹاک صفر نہیں ہے۔ پہلے اسٹاک 0 کریں۔",
        )
    used = count_references(db, "accessories", a.id)
    action = "archive" if used else "delete"
    record_audit(
        db,
        shop_id=shop_id,
        user_id=ctx.id,
        entity="accessory",
        entity_id=a.id,
        action=action,
        before={"name": a.name},
    )
    if used:
        a.is_active = False
    else:
        db.delete(a)
    db.commit()
    return action
