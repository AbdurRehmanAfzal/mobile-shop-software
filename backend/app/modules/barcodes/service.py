"""Assigning, finding and counting barcodes. The value is made from the shop's settings
(prefix + zero-padded sequence, or the IMEI) unless the shopkeeper typed / scanned one; it is
unique across phones and accessories of the shop and never changes afterwards."""

import re
import uuid
from dataclasses import dataclass

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.errors import Conflict, ValidationFailed
from app.core.pk import latin_digits
from app.modules.accessories.models import Accessory
from app.modules.audit.service import record_audit
from app.modules.auth.models import Shop
from app.modules.barcodes import codes
from app.modules.devices.models import Device
from app.modules.devices.state import DeviceStatus, EventType

DEFAULT_PREFS = {
    "type": codes.DEFAULT_TYPE,  # for NEW barcodes; each barcode keeps its own type
    "prefix": "MS",  # A–Z / 0–9, up to 6
    "value_mode": "sequence",  # sequence | imei (phones get their IMEI as the value)
    "pad": 6,  # MS000123
    "start_number": 1,
}
_PREFIX = re.compile(r"^[A-Z0-9]{0,6}$")
# what a keyboard-wedge scanner may add around the code: AIM symbology ids and control characters
_AIM = re.compile(r"^\](?:[A-Za-z]\d)")


def prefs_for(shop: Shop) -> dict:
    p = dict(DEFAULT_PREFS)
    p.update({k: v for k, v in (shop.barcode_prefs or {}).items() if k in p})
    return p


def set_prefs(db: Session, shop: Shop, user_id: uuid.UUID, data: dict) -> dict:
    p = prefs_for(shop)
    if "type" in data:
        if data["type"] not in codes.TYPES:
            raise ValidationFailed(
                code="barcode_type",
                message_en="Unknown barcode type",
                message_ur="نامعلوم بارکوڈ قسم",
            )
        p["type"] = data["type"]
    if "prefix" in data:
        pre = str(data["prefix"] or "").strip().upper()
        if not _PREFIX.match(pre):
            raise ValidationFailed(
                code="barcode_prefix",
                message_en="Prefix: letters and digits only, up to 6",
                message_ur="سابقہ: صرف حروف اور ہندسے، زیادہ سے زیادہ 6",
            )
        p["prefix"] = pre
    if "value_mode" in data:
        if data["value_mode"] not in ("sequence", "imei"):
            raise ValidationFailed(code="barcode_mode")
        p["value_mode"] = data["value_mode"]
    if "pad" in data:
        p["pad"] = max(4, min(int(data["pad"]), 10))
    if "start_number" in data:
        n = int(data["start_number"])
        if n < 1:
            raise ValidationFailed(code="barcode_start")
        # the sequence only moves forward: numbers already printed are never reused
        if n > (shop.barcode_seq or 0):
            shop.barcode_seq = n - 1
        p["start_number"] = n
    before = dict(shop.barcode_prefs or {})
    shop.barcode_prefs = p
    record_audit(
        db,
        shop_id=shop.id,
        user_id=user_id,
        entity="shop",
        entity_id=shop.id,
        action="barcode_prefs",
        before=before,
        after=p,
    )
    db.commit()
    return p


def preview_value(shop: Shop) -> tuple[str, str]:
    """(value, type) the next generated barcode would get — without taking a number."""
    p = prefs_for(shop)
    n = max(shop.barcode_seq or 0, p["start_number"] - 1) + 1
    return _compose(p, n)


def _compose(p: dict, n: int) -> tuple[str, str]:
    kind = p["type"]
    if kind == "ean13":
        digits = "".join(ch for ch in p["prefix"] if ch.isdigit()) or "20"
        body = f"{digits}{n:0{max(1, 12 - len(digits))}d}"
        if len(body) <= 12:
            return codes.normalise("ean13", body.rjust(12, "0")), "ean13"
        kind = "code128"  # too long for EAN-13: this one is Code 128
    value = f"{p['prefix']}{n:0{p['pad']}d}"
    if kind == "code39":
        return value.upper(), "code39"
    return value, kind


def _next(db: Session, shop: Shop) -> tuple[str, str]:
    p = prefs_for(shop)
    for _ in range(50):  # skip values a custom code already took
        n = max(shop.barcode_seq or 0, p["start_number"] - 1) + 1
        shop.barcode_seq = n
        db.flush()
        value, kind = _compose(p, n)
        if not taken(db, shop.id, value):
            return value, kind
    raise Conflict(code="barcode_exhausted")


def clean(raw: str) -> str:
    """What a scanner typed → the code: Urdu digits to Latin, AIM prefixes (]C1), control
    characters and surrounding whitespace removed."""
    v = latin_digits(str(raw or ""))
    v = "".join(ch for ch in v if ch >= " " and ch != "\x7f").strip()
    v = _AIM.sub("", v)
    return v.strip()


def taken(
    db: Session, shop_id: uuid.UUID, value: str, *, device_id=None, item_id=None
) -> str | None:
    """Which record already answers to this value (barcode or IMEI or SKU), if any."""
    q = select(Device.id).where(
        Device.shop_id == shop_id,
        or_(Device.barcode == value, Device.imei1 == value, Device.imei2 == value),
    )
    if device_id is not None:
        q = q.where(Device.id != device_id)
    if db.scalar(q) is not None:
        return "device"
    q = select(Accessory.id).where(
        Accessory.shop_id == shop_id, or_(Accessory.barcode == value, Accessory.sku == value)
    )
    if item_id is not None:
        q = q.where(Accessory.id != item_id)
    if db.scalar(q) is not None:
        return "item"
    return None


def _custom(
    db: Session, shop: Shop, value: str, kind: str | None, *, device_id=None, item_id=None
) -> tuple[str, str]:
    kind = kind or prefs_for(shop)["type"]
    try:
        value = codes.normalise(kind, clean(value))
    except ValueError as exc:
        en, ur = codes.REASONS.get(str(exc), codes.REASONS["type"])
        raise ValidationFailed(code="barcode_value", message_en=en, message_ur=ur) from exc
    if taken(db, shop.id, value, device_id=device_id, item_id=item_id):
        raise Conflict(
            code="barcode_taken",
            message_en=f"Barcode {value} is already used by another phone or item",
            message_ur=f"بارکوڈ {value} پہلے سے کسی اور موبائل یا چیز پر ہے",
        )
    return value, kind


def assign_device(
    db: Session,
    shop: Shop,
    device: Device,
    *,
    value: str | None = None,
    kind: str | None = None,
    manufacturer_code: str | None = None,
) -> None:
    """Called when a phone row is made (same transaction as the purchase). A phone that is bought
    back keeps its barcode: nothing happens when one is already there."""
    if manufacturer_code:
        device.manufacturer_code = clean(manufacturer_code)[:64] or None
    if device.barcode:
        return
    if value:
        device.barcode, device.barcode_type = _custom(db, shop, value, kind, device_id=device.id)
        return
    p = prefs_for(shop)
    if (
        p["value_mode"] == "imei"
        and device.imei1
        and device.imei1.isdigit()
        and len(device.imei1) == 15
    ):
        k = p["type"] if codes.can_encode(p["type"], device.imei1) else "code128"
        if not taken(db, shop.id, device.imei1, device_id=device.id):
            device.barcode, device.barcode_type = device.imei1, k
            return
    device.barcode, device.barcode_type = _next(db, shop)


def assign_item(
    db: Session,
    shop: Shop,
    item: Accessory,
    *,
    value: str | None = None,
    kind: str | None = None,
    manufacturer_code: str | None = None,
) -> None:
    if manufacturer_code:
        item.manufacturer_code = clean(manufacturer_code)[:64] or None
    if item.barcode:
        return
    if value:
        item.barcode, item.barcode_type = _custom(db, shop, value, kind, item_id=item.id)
        return
    item.barcode, item.barcode_type = _next(db, shop)


# ---- lookup -----------------------------------------------------------------------------------


@dataclass
class Hit:
    kind: str  # device | item | none
    device: Device | None = None
    item: Accessory | None = None
    matched: str | None = None  # barcode | imei1 | imei2 | sku | manufacturer_code


def lookup(db: Session, shop_id: uuid.UUID, raw: str) -> Hit:
    code = clean(raw)
    if not code:
        return Hit("none")
    up = code.upper()
    d = db.scalar(
        select(Device).where(Device.shop_id == shop_id, Device.barcode.in_([code, up]))
    )
    if d:
        return Hit("device", device=d, matched="barcode")
    d = db.scalar(select(Device).where(Device.shop_id == shop_id, Device.imei1 == code))
    if d:
        return Hit("device", device=d, matched="imei1")
    d = db.scalar(select(Device).where(Device.shop_id == shop_id, Device.imei2 == code))
    if d:
        return Hit("device", device=d, matched="imei2")
    a = db.scalar(
        select(Accessory).where(Accessory.shop_id == shop_id, Accessory.barcode.in_([code, up]))
    )
    if a:
        return Hit("item", item=a, matched="barcode")
    a = db.scalar(
        select(Accessory).where(Accessory.shop_id == shop_id, Accessory.sku == code.upper())
    )
    if a:
        return Hit("item", item=a, matched="sku")
    d = db.scalar(
        select(Device)
        .where(Device.shop_id == shop_id, Device.manufacturer_code == code)
        .order_by(Device.created_at.desc())
    )
    if d:
        return Hit("device", device=d, matched="manufacturer_code")
    a = db.scalar(
        select(Accessory).where(Accessory.shop_id == shop_id, Accessory.manufacturer_code == code)
    )
    if a:
        return Hit("item", item=a, matched="manufacturer_code")
    return Hit("none")


def lookup_out(db: Session, shop_id: uuid.UUID, raw: str, can_cost: bool) -> dict:
    from app.modules.devices.service import get_device_out

    hit = lookup(db, shop_id, raw)
    out: dict = {
        "code": clean(raw),
        "kind": hit.kind,
        "matched": hit.matched,
        "device": None,
        "item": None,
    }
    if hit.device is not None:
        d = get_device_out(db, shop_id, hit.device.id)
        if not can_cost:
            d["cost_price"] = None
        out["device"] = d
        out["status"] = hit.device.status
        out["sellable"] = hit.device.status == DeviceStatus.IN_STOCK
    if hit.item is not None:
        a = hit.item
        out["item"] = {
            "id": str(a.id),
            "sku": a.sku,
            "name": a.name,
            "name_ur": a.name_ur,
            "category": a.category,
            "qty": a.qty,
            "price": str(a.price),
            "barcode": a.barcode,
            "barcode_type": a.barcode_type,
            "avg_cost": str(a.avg_cost) if can_cost else None,
        }
        out["sellable"] = a.qty > 0 and a.is_active
    return out


# ---- backfill + count + reprint -----------------------------------------------------------------


def backfill(db: Session, shop: Shop, user_id: uuid.UUID | None) -> dict:
    """Every phone (any status) and item without a barcode gets one; existing ones are untouched.
    Safe to run again."""
    from app.modules.devices.service import apply_event

    n_dev = n_item = 0
    for d in db.scalars(
        select(Device)
        .where(Device.shop_id == shop.id, Device.barcode.is_(None))
        .order_by(Device.created_at)
    ).all():
        assign_device(db, shop, d)
        if d.event_count:
            apply_event(
                db,
                shop.id,
                user_id,
                d,
                EventType.BARCODE_ASSIGNED,
                data={"barcode": d.barcode, "type": d.barcode_type, "source": "backfill"},
            )
        n_dev += 1
    for a in db.scalars(
        select(Accessory)
        .where(Accessory.shop_id == shop.id, Accessory.barcode.is_(None))
        .order_by(Accessory.created_at)
    ).all():
        assign_item(db, shop, a)
        n_item += 1
    if n_dev or n_item:
        record_audit(
            db,
            shop_id=shop.id,
            user_id=user_id,
            entity="shop",
            entity_id=shop.id,
            action="barcode_backfill",
            after={"devices": n_dev, "items": n_item},
        )
    db.commit()
    return {"devices": n_dev, "items": n_item}


def stock_count(db: Session, shop_id: uuid.UUID, scanned: list[str]) -> dict:
    """Scanned codes vs what should be in stock: found, missing, unexpected (sold / unknown)."""
    found_devices: dict[uuid.UUID, dict] = {}
    found_items: dict[uuid.UUID, dict] = {}
    unexpected: list[dict] = []
    for raw in scanned:
        hit = lookup(db, shop_id, raw)
        if hit.kind == "device" and hit.device is not None:
            d = hit.device
            if d.status == DeviceStatus.IN_STOCK:
                found_devices[d.id] = {"id": str(d.id), "imei1": d.imei1, "barcode": d.barcode}
            else:
                unexpected.append(
                    {
                        "code": clean(raw),
                        "reason": d.status,
                        "device_id": str(d.id),
                        "imei1": d.imei1,
                    }
                )
        elif hit.kind == "item" and hit.item is not None:
            a = hit.item
            row = found_items.setdefault(
                a.id, {"id": str(a.id), "sku": a.sku, "name": a.name, "qty": a.qty, "scanned": 0}
            )
            row["scanned"] += 1
        else:
            unexpected.append({"code": clean(raw), "reason": "not_found"})
    in_stock = db.scalars(
        select(Device).where(Device.shop_id == shop_id, Device.status == DeviceStatus.IN_STOCK)
    ).all()
    missing = [
        {"id": str(d.id), "imei1": d.imei1, "barcode": d.barcode}
        for d in in_stock
        if d.id not in found_devices
    ]
    return {
        "found_devices": list(found_devices.values()),
        "found_items": list(found_items.values()),
        "missing": missing,
        "unexpected": unexpected,
        "in_stock": len(in_stock),
    }


def log_print(
    db: Session,
    shop_id: uuid.UUID,
    user_id: uuid.UUID | None,
    *,
    kind: str,
    ids: list[uuid.UUID],
    copies: int,
    size: str,
) -> None:
    """Every print / reprint: one audit row, and a timeline event on each phone."""
    from app.modules.devices.service import apply_event

    record_audit(
        db,
        shop_id=shop_id,
        user_id=user_id,
        entity="label",
        entity_id=None,
        action="print",
        after={"kind": kind, "count": len(ids), "copies": copies, "size": size},
    )
    if kind == "devices":
        for d in db.scalars(
            select(Device).where(Device.shop_id == shop_id, Device.id.in_(ids))
        ).all():
            if d.event_count:
                apply_event(
                    db,
                    shop_id,
                    user_id,
                    d,
                    EventType.LABEL_PRINTED,
                    data={"copies": copies, "size": size, "barcode": d.barcode},
                )
    db.commit()
