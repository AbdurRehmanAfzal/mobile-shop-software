"""Tablets and smart watches as serialized devices (owner addendum 6, docs/26 + docs/27): grades,
lock checks of used units, the shop's model library (spec sheets learned from every saved unit),
reclassification (preview, then apply), one counted item → one serialized unit, stock by type."""

import csv
import datetime as dt
import io
import uuid
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import NotFound, ValidationFailed
from app.db.base import ZERO, utcnow
from app.modules.auth.models import Shop
from app.modules.catalogue.models import Brand, Model, ModelSpec
from app.modules.devices.models import Device
from app.modules.devices.state import DeviceCondition, DeviceStatus, EventType
from app.modules.ledger.service import money

CATEGORIES = ("phone", "tablet", "watch")
GRADES = ("a", "b", "refurbished", "copy")
LOCK_KEYS = ("activation", "frp", "account", "paired", "carrier")
LOCK_VALUES = ("cleared", "not_cleared", "na")
DEFAULT_PREFS = {"grades": list(GRADES), "require_lock_check": False}
# the spec keys a unit or a model may carry (anything else is dropped so the JSON stays tidy)
SPEC_KEYS = (
    "os", "os_version", "chipset", "expandable", "bluetooth", "wifi", "nfc", "gps", "weight_g",
    "year", "display_in", "display_type", "resolution", "refresh_hz", "battery_mah",
    # tablet
    "sim_type", "camera_front_mp", "camera_rear_mp", "stylus_support", "unlock", "port", "fast_charge_w",
    # watch
    "case_material", "band_material", "band_color", "band_size", "compatible_with", "sensors", "water",
    "aod", "calling", "battery_days",
)


# ---- preferences ----------------------------------------------------------------------------------


def prefs_for(shop: Shop | None) -> dict:
    p = {"grades": list(GRADES), "require_lock_check": False}
    raw = (shop.device_prefs if shop is not None else None) or {}
    if isinstance(raw.get("grades"), list) and raw["grades"]:
        p["grades"] = [str(g).strip().lower() for g in raw["grades"] if str(g).strip()][:12]
    if "require_lock_check" in raw:
        p["require_lock_check"] = bool(raw["require_lock_check"])
    return p


def clean_prefs(raw: dict | None) -> dict | None:
    if raw is None:
        return None
    if not isinstance(raw, dict):
        raise TypeError("device_prefs must be an object")
    out: dict = {}
    if "grades" in raw and isinstance(raw["grades"], list):
        out["grades"] = [str(g).strip().lower() for g in raw["grades"] if str(g).strip()][:12]
    if "require_lock_check" in raw:
        out["require_lock_check"] = bool(raw["require_lock_check"])
    return out


# ---- specs and the model library ---------------------------------------------------------------------


def clean_specs(raw: dict | None) -> dict | None:
    if not raw:
        return None
    out = {}
    for k, v in raw.items():
        if k not in SPEC_KEYS or v in (None, "", []):
            continue
        if isinstance(v, list):
            out[k] = [str(x)[:40] for x in v][:20]
        elif isinstance(v, bool | int | float):
            out[k] = v
        else:
            out[k] = str(v)[:80]
    return out or None


def clean_locks(raw: dict | None) -> dict | None:
    if not raw:
        return None
    out = {}
    for k, v in raw.items():
        if k in LOCK_KEYS and v in LOCK_VALUES:
            out[k] = v
    return out or None


def lock_ok(device: Device) -> bool:
    """False when any lock is recorded as not cleared (such a unit cannot be sold)."""
    return not any(v == "not_cleared" for v in (device.lock_checks or {}).values())


def lock_required(shop: Shop | None, category: str, condition: str) -> bool:
    """A used tablet / watch must have its locks checked at purchase; a used phone when the shop says so."""
    if condition == DeviceCondition.BOX_PACK:
        return False
    if category in ("tablet", "watch"):
        return True
    return prefs_for(shop)["require_lock_check"]


def model_specs(db: Session, shop_id: uuid.UUID, model_id: uuid.UUID) -> dict:
    """the global sheet overlaid with what this shop has learned / typed for the model"""
    m = db.get(Model, model_id)
    if m is None:
        raise NotFound(code="model_not_found")
    own = db.scalar(select(ModelSpec).where(ModelSpec.shop_id == shop_id, ModelSpec.model_id == model_id))
    specs = dict(m.specs or {})
    specs.update(own.specs or {} if own else {})
    return {
        "model_id": str(model_id),
        "model_number": (own.model_number if own and own.model_number else m.model_number),
        "ram_gb": (own.specs or {}).get("ram_gb") if own else (m.specs or {}).get("ram_gb"),
        "specs": {k: v for k, v in specs.items() if k != "ram_gb"},
        "learned": own is not None,
    }


def learn_specs(db: Session, shop_id: uuid.UUID, model_id: uuid.UUID, *, model_number: str | None, ram_gb: int | None, specs: dict | None) -> None:
    """Remember what the shop typed for this model, so the next unit fills itself. Only non-empty
    values are written; nothing the shop knew is erased."""
    incoming = dict(clean_specs(specs) or {})
    if ram_gb:
        incoming["ram_gb"] = ram_gb
    if not incoming and not model_number:
        return
    own = db.scalar(select(ModelSpec).where(ModelSpec.shop_id == shop_id, ModelSpec.model_id == model_id))
    if own is None:
        own = ModelSpec(shop_id=shop_id, model_id=model_id, specs={})
        db.add(own)
    merged = dict(own.specs or {})
    merged.update(incoming)
    own.specs = merged
    if model_number:
        own.model_number = model_number.strip()[:40]
    own.updated_at = utcnow()
    db.flush()


def set_model_specs(db: Session, shop_id: uuid.UUID, model_id: uuid.UUID, *, model_number: str | None, ram_gb: int | None, specs: dict | None) -> dict:
    """the shop edits its library entry (replaces its own sheet; the global one stays underneath)"""
    if db.get(Model, model_id) is None:
        raise NotFound(code="model_not_found")
    own = db.scalar(select(ModelSpec).where(ModelSpec.shop_id == shop_id, ModelSpec.model_id == model_id))
    if own is None:
        own = ModelSpec(shop_id=shop_id, model_id=model_id, specs={})
        db.add(own)
    sheet = dict(clean_specs(specs) or {})
    if ram_gb:
        sheet["ram_gb"] = ram_gb
    own.specs = sheet
    own.model_number = (model_number or "").strip()[:40] or None
    own.updated_at = utcnow()
    db.commit()
    return model_specs(db, shop_id, model_id)


def import_library(db: Session, shop_id: uuid.UUID, user_id: uuid.UUID, text: str) -> dict:
    """CSV with columns brand, model, category, model_number and any spec columns (os, chipset,
    display_in, …). Unknown brands / models are made for the shop. Returns counts."""
    from app.modules.catalogue.schemas import BrandCreate, ModelCreate
    from app.modules.catalogue.service import create_brand, create_model, list_brands, list_models

    rows = list(csv.DictReader(io.StringIO(text.lstrip("﻿"))))
    if not rows:
        raise ValidationFailed(code="empty_csv", message_en="The file has no rows", message_ur="فائل میں کوئی قطار نہیں")
    made_brands = made_models = updated = 0
    brands = {b["name"].lower(): b for b in list_brands(db, shop_id)}
    for r in rows:
        r = {(k or "").strip().lower(): (v or "").strip() for k, v in r.items()}
        bname, mname = r.get("brand", ""), r.get("model", "")
        if not bname or not mname:
            continue
        category = r.get("category", "phone").lower()
        if category not in CATEGORIES:
            category = "phone"
        b = brands.get(bname.lower())
        if b is None:
            b = create_brand(db, shop_id, user_id, BrandCreate(name=bname))
            brands[bname.lower()] = b
            made_brands += 1
        models = {m["name"].lower(): m for m in list_models(db, shop_id, uuid.UUID(str(b["id"])), None, 1000)}
        m = models.get(mname.lower())
        if m is None:
            m = create_model(db, shop_id, user_id, ModelCreate(brand_id=b["id"], name=mname, category=category))
            made_models += 1
        ram = r.get("ram_gb") or r.get("ram")
        try:
            ram_gb = int(float(ram)) if ram else None
        except ValueError:
            ram_gb = None
        specs = {k: v for k, v in r.items() if k in SPEC_KEYS and v}
        learn_specs(db, shop_id, uuid.UUID(str(m["id"])), model_number=r.get("model_number") or None, ram_gb=ram_gb, specs=specs)
        updated += 1
    db.commit()
    return {"rows": len(rows), "brands_made": made_brands, "models_made": made_models, "models_updated": updated}


# ---- lock checks ---------------------------------------------------------------------------------------


def record_lock_check(db: Session, shop_id: uuid.UUID, user_id: uuid.UUID | None, device: Device, checks: dict, note: str | None = None) -> Device:
    """Writes the lock status on the unit and a `lock_checked` event (who, when, what)."""
    from app.modules.devices.service import apply_event

    clean = clean_locks(checks)
    if not clean:
        raise ValidationFailed(code="lock_checks_empty", message_en="Say which locks were checked", message_ur="بتائیں کون سے لاک چیک ہوئے")
    device.lock_checks = {**(device.lock_checks or {}), **clean}
    device.lock_checked_at = utcnow()
    device.lock_checked_by = user_id
    apply_event(db, shop_id, user_id, device, EventType.LOCK_CHECKED, data={"locks": clean, "note": note, "ok": lock_ok(device)})
    return device


# ---- reclassification ----------------------------------------------------------------------------------


def _row(db: Session, d: Device, to_category: str, model_id: uuid.UUID | None) -> dict:
    model = db.get(Model, model_id) if model_id else db.get(Model, d.model_id)
    brand = db.get(Brand, model.brand_id) if model else None
    problems = []
    if model is None:
        problems.append("model_not_found")
    elif model.category != to_category:
        problems.append("model_is_" + model.category)
    is_imei = d.imei1.isdigit() and len(d.imei1) == 15
    cellular = None if to_category == "phone" else bool(is_imei)
    if to_category == "phone" and not is_imei:
        problems.append("phone_needs_imei")
    if to_category != "phone" and d.condition == DeviceCondition.PATCHED:
        problems.append("patched_is_phone_only")
    return {
        "id": str(d.id), "imei1": d.imei1, "barcode": d.barcode, "status": d.status,
        "from_category": d.category, "to_category": to_category,
        "from_model": f"{brand.name if brand else ''} {model.name if model else ''}".strip() if model and model_id else None,
        "model_id": str(model.id) if model else None,
        "cellular_after": cellular, "events": d.event_count, "problems": problems,
    }


def reclassify_preview(db: Session, shop_id: uuid.UUID, device_ids: list[uuid.UUID], to_category: str, model_id: uuid.UUID | None) -> list[dict]:
    if to_category not in CATEGORIES:
        raise ValidationFailed(code="bad_category", message_en="Unknown device type", message_ur="نامعلوم قسم")
    rows = []
    for did in device_ids:
        d = db.get(Device, did)
        if d is None or d.shop_id != shop_id:
            raise NotFound(code="device_not_found")
        rows.append(_row(db, d, to_category, model_id))
    return rows


def reclassify_apply(db: Session, shop_id: uuid.UUID, user_id: uuid.UUID, device_ids: list[uuid.UUID], to_category: str, model_id: uuid.UUID | None, reason: str | None) -> list[dict]:
    """Changes the type (and optionally the model) of existing units. IMEI / serial, barcode,
    events, invoices and balances are untouched; one `reclassified` event per unit."""
    from app.modules.devices.service import apply_event

    rows = reclassify_preview(db, shop_id, device_ids, to_category, model_id)
    bad = [r for r in rows if r["problems"]]
    if bad:
        raise ValidationFailed(
            code="reclassify_blocked",
            message_en=f"{len(bad)} unit(s) cannot be changed: " + ", ".join(sorted({p for r in bad for p in r["problems"]})),
            message_ur="کچھ یونٹ تبدیل نہیں ہو سکتے",
        )
    for r in rows:
        d = db.get(Device, uuid.UUID(r["id"]))
        before = {"category": d.category, "model_id": str(d.model_id)}
        d.category = to_category
        d.cellular = r["cellular_after"]
        if to_category == "watch":
            d.storage_id = None
            d.imei2 = None
        if to_category != "watch":
            d.size_mm = None
        if to_category == "phone":
            d.battery_health = None
        if not d.cellular and to_category != "phone":
            d.pta_status = "unknown"
            d.sim_time_months = None
        if model_id:
            m = db.get(Model, model_id)
            d.model_id = m.id
            d.brand_id = m.brand_id
        apply_event(db, shop_id, user_id, d, EventType.RECLASSIFIED, data={"before": before, "after": {"category": d.category, "model_id": str(d.model_id)}, "reason": reason})
    db.commit()
    return rows


def convert_item(db: Session, shop_id: uuid.UUID, user_id: uuid.UUID, accessory_id: uuid.UUID, identity, cost: Decimal | None) -> dict:
    """One counted watch / tablet becomes one serialized unit: the item's count goes down by one
    (adjustment with a reason) and the unit enters as opening stock at the item's cost."""
    from app.modules.accessories import service as acc
    from app.modules.devices.service import add_opening_stock

    item = acc.get_accessory(db, shop_id, accessory_id)
    if item.qty < 1:
        raise ValidationFailed(code="insufficient_stock", message_en="The item has no stock to convert", message_ur="اس آئٹم کا اسٹاک نہیں")
    unit_cost = money(cost) if cost is not None else money(item.avg_cost or ZERO)
    identity.cost_price = unit_cost
    out = add_opening_stock(db, shop_id, user_id, identity)
    acc.move(db, shop_id, user_id, item, -1, "adjust", document_type="device_conversion", document_id=uuid.UUID(str(out["id"])), note=f"Converted to device {out['imei1']}")
    dev = db.get(Device, uuid.UUID(str(out["id"])))
    from app.modules.devices.service import apply_event

    apply_event(db, shop_id, user_id, dev, EventType.NOTE, data={"text": f"Converted from item {item.sku} {item.name}", "accessory_id": str(item.id)})
    db.commit()
    return out


# ---- reports ---------------------------------------------------------------------------------------------


def stock_by_type(db: Session, shop_id: uuid.UUID, show_cost: bool) -> dict:
    """in-stock units per type: count, cost value, asking (retail) value, used units with an
    unchecked or failed lock check"""
    rows = db.scalars(select(Device).where(Device.shop_id == shop_id, Device.status == DeviceStatus.IN_STOCK, Device.is_active.is_(True))).all()
    out = {c: {"category": c, "count": 0, "cost": ZERO, "retail": ZERO, "used": 0, "lock_unchecked": 0, "lock_failed": 0, "non_pta": 0} for c in CATEGORIES}
    cutoff = dt.datetime.now(dt.UTC) - dt.timedelta(days=60)
    slow = {c: 0 for c in CATEGORIES}
    for d in rows:
        g = out[d.category if d.category in out else "phone"]
        g["count"] += 1
        g["cost"] = money(g["cost"] + (d.cost_price or ZERO))
        g["retail"] = money(g["retail"] + (d.asking_price or d.cost_price or ZERO))
        if d.condition != DeviceCondition.BOX_PACK:
            g["used"] += 1
            if not d.lock_checks:
                g["lock_unchecked"] += 1
            elif not lock_ok(d):
                g["lock_failed"] += 1
        if d.pta_status in ("non_pta", "jv"):
            g["non_pta"] += 1
        if d.first_seen_at and d.first_seen_at.replace(tzinfo=dt.UTC) < cutoff:
            slow[g["category"]] += 1
    for c in CATEGORIES:
        out[c]["slow_60d"] = slow[c]
        if not show_cost:
            out[c]["cost"] = None
    total = {"count": sum(g["count"] for g in out.values()), "cost": money(sum((g["cost"] or ZERO) for g in out.values())) if show_cost else None, "retail": money(sum(g["retail"] for g in out.values()))}
    return {"types": list(out.values()), "total": total}


def lock_unchecked(db: Session, shop_id: uuid.UUID) -> list[dict]:
    """used units in stock whose locks were never checked or failed"""
    rows = db.execute(
        select(Device, Brand.name, Model.name)
        .join(Brand, Brand.id == Device.brand_id)
        .join(Model, Model.id == Device.model_id)
        .where(Device.shop_id == shop_id, Device.status == DeviceStatus.IN_STOCK, Device.condition != DeviceCondition.BOX_PACK)
        .order_by(Device.first_seen_at)
    ).all()
    return [
        {"id": str(d.id), "imei1": d.imei1, "category": d.category, "name": f"{b} {m}", "condition": d.condition, "lock_checks": d.lock_checks, "ok": lock_ok(d) if d.lock_checks else None, "first_seen_at": d.first_seen_at}
        for d, b, m in rows
        if not d.lock_checks or not lock_ok(d)
    ]


def count_models(db: Session, shop_id: uuid.UUID) -> int:
    return db.scalar(select(func.count()).select_from(ModelSpec).where(ModelSpec.shop_id == shop_id)) or 0
