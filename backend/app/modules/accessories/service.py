import datetime as dt
import uuid
from decimal import Decimal

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.errors import Conflict, NotFound, ValidationFailed
from app.db.base import ZERO
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
    db.add(a)
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
            note="Opening stock",
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
    for k, v in changes.items():
        setattr(a, k, money(v) if isinstance(v, Decimal) else v)
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
) -> AccessoryMovement:
    """Apply a stock movement; incoming stock updates the weighted average cost."""
    if qty_delta < 0 and a.qty + qty_delta < 0:
        raise ValidationFailed(
            code="insufficient_stock",
            message_en=f"Only {a.qty} × {a.name} in stock",
            message_ur=f"{a.name} کی صرف {a.qty} تعداد اسٹاک میں ہے",
        )
    if qty_delta > 0 and unit_cost is not None:
        total_before = money(a.avg_cost * a.qty)
        a.avg_cost = money((total_before + unit_cost * qty_delta) / (a.qty + qty_delta))
    a.qty += qty_delta
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
) -> list[Accessory]:
    stmt = select(Accessory).where(Accessory.shop_id == shop_id)
    if not include_inactive:
        stmt = stmt.where(Accessory.is_active.is_(True))
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                Accessory.name.ilike(like), Accessory.name_ur.ilike(like), Accessory.sku.ilike(like)
            )
        )
    if category:
        stmt = stmt.where(Accessory.category == category)
    if low_only:
        stmt = stmt.where(Accessory.qty <= Accessory.reorder_level)
    return list(db.scalars(stmt.order_by(Accessory.name)).all())


def to_out(a: Accessory, show_cost: bool) -> dict:
    return {
        **{c.name: getattr(a, c.name) for c in Accessory.__table__.columns},
        "avg_cost": a.avg_cost if show_cost else None,
        "low_stock": a.qty <= a.reorder_level,
    }


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
    today = dt.date.today()
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
    item.delivered_at = dt.date.today()
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
