import html
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError, Forbidden, NotFound, ValidationFailed
from app.core.permissions import Cap
from app.db.base import utcnow
from app.modules.audit.service import record_audit
from app.modules.auth.models import Shop
from app.modules.catalogue.models import Brand, Model
from app.modules.devices.models import Device
from app.modules.devices.service import apply_event, get_device
from app.modules.devices.state import DeviceCondition, EventType, VerificationStatus
from app.modules.files.service import belongs
from app.modules.parties.models import Party
from app.modules.verification.models import Verification
from app.modules.verification.schemas import VerificationIn

REQUIRED_FOR_CLEAR = (
    "cnic_no",
    "cnic_front_path",
    "cnic_back_path",
    "seller_photo_path",
    "egadget",
    "declaration",
)


class NotSellable(AppError):
    status_code = 409
    code = "not_sellable"
    message_en = "This device cannot be sold until verification is complete"
    message_ur = "تصدیق مکمل ہونے تک یہ موبائل فروخت نہیں ہو سکتا"


def latest(db: Session, shop_id: uuid.UUID, device: Device) -> Verification | None:
    return db.scalar(
        select(Verification)
        .where(
            Verification.shop_id == shop_id,
            Verification.device_id == device.id,
            Verification.cycle_no == device.cycle_no,
        )
        .order_by(Verification.created_at.desc())
    )


def compute(v: Verification) -> tuple[str, list[str]]:
    if v.egadget_result == "flagged":
        return "flagged", []
    missing = []
    if not v.cnic_no:
        missing.append("cnic_no")
    if not v.cnic_front_path:
        missing.append("cnic_front_path")
    if not v.cnic_back_path:
        missing.append("cnic_back_path")
    if not v.seller_photo_path:
        missing.append("seller_photo_path")
    if v.egadget_result != "clear":
        missing.append("egadget")
    if not v.declaration_signed:
        missing.append("declaration")
    return ("clear" if not missing else "pending"), missing


def upsert(
    db: Session, shop_id: uuid.UUID, user_id: uuid.UUID, device_id: uuid.UUID, data: VerificationIn
) -> Verification:
    device = get_device(db, shop_id, device_id)
    for key in (
        "cnic_front_path",
        "cnic_back_path",
        "seller_photo_path",
        "egadget_screenshot_path",
        "declaration_path",
    ):
        if not belongs(shop_id, getattr(data, key)):
            raise ValidationFailed(code="file_not_found", details={"field": key})
    for p in data.device_photos:
        if not belongs(shop_id, p):
            raise ValidationFailed(code="file_not_found", details={"field": "device_photos"})
    if data.seller_party_id is not None:
        seller = db.get(Party, data.seller_party_id)
        if seller is None or seller.shop_id != shop_id:
            raise NotFound(code="party_not_found")
        if data.cnic_no and not seller.cnic:
            seller.cnic = data.cnic_no
        elif not data.cnic_no and seller.cnic:
            data.cnic_no = seller.cnic

    v = latest(db, shop_id, device)
    if v is None:
        v = Verification(shop_id=shop_id, device_id=device.id, cycle_no=device.cycle_no)
        db.add(v)
    for k, val in data.model_dump().items():
        setattr(v, k, val)
    v.result, v.missing = compute(v)
    v.checked_by = user_id
    v.checked_at = utcnow()
    if v.pta_checked and v.pta_result:
        device.pta_status = v.pta_result
    db.flush()

    status = {
        "clear": VerificationStatus.CLEAR,
        "flagged": VerificationStatus.FLAGGED,
        "pending": VerificationStatus.PENDING,
    }[v.result]
    apply_event(
        db,
        shop_id,
        user_id,
        device,
        EventType.VERIFIED,
        party_id=data.seller_party_id,
        data={
            "result": status,
            "egadget": v.egadget_result,
            "missing": v.missing,
            "verification_id": str(v.id),
        },
    )
    record_audit(
        db,
        shop_id=shop_id,
        user_id=user_id,
        entity="verification",
        entity_id=v.id,
        action="upsert",
        after={"result": v.result, "missing": v.missing},
    )
    db.commit()
    return v


def override(
    db: Session, shop_id: uuid.UUID, ctx, device_id: uuid.UUID, reason: str
) -> Verification:
    """Owner/manager accepts the risk and marks the device sellable despite flagged/pending checks."""
    if not ctx.can(Cap.VERIFY_OVERRIDE):
        raise Forbidden()
    device = get_device(db, shop_id, device_id)
    v = latest(db, shop_id, device)
    if v is None:
        v = Verification(shop_id=shop_id, device_id=device.id, cycle_no=device.cycle_no)
        db.add(v)
        v.result, v.missing = compute(v)
    v.override_by = ctx.id
    v.override_reason = reason
    v.override_at = utcnow()
    db.flush()
    apply_event(
        db,
        shop_id,
        ctx.id,
        device,
        EventType.VERIFIED,
        data={
            "result": VerificationStatus.CLEAR,
            "override": True,
            "reason": reason,
            "previous": v.result,
        },
    )
    record_audit(
        db,
        shop_id=shop_id,
        user_id=ctx.id,
        entity="verification",
        entity_id=v.id,
        action="override",
        after={"reason": reason, "previous": v.result},
    )
    db.commit()
    return v


def assert_sellable(device: Device) -> None:
    """Called by the sale module. Box-pack from suppliers is `not_required`; everything else must be clear."""
    if device.verification_status == VerificationStatus.FLAGGED:
        raise NotSellable(
            code="device_flagged",
            message_en="This device is flagged as stolen/blocked",
            message_ur="یہ موبائل چوری شدہ / بلاک رپورٹ ہوا ہے",
        )
    if device.verification_status == VerificationStatus.PENDING:
        raise NotSellable()


def declaration_html(db: Session, shop_id: uuid.UUID, device_id: uuid.UUID) -> str:
    device = get_device(db, shop_id, device_id)
    shop = db.get(Shop, shop_id)
    v = latest(db, shop_id, device)
    seller = db.get(Party, v.seller_party_id) if v and v.seller_party_id else None
    brand = db.get(Brand, device.brand_id)
    model = db.get(Model, device.model_id)
    e = html.escape
    cond = {
        DeviceCondition.BOX_PACK: "Box pack",
        DeviceCondition.OPEN_BOX: "Open box",
        DeviceCondition.USED: "Used",
        DeviceCondition.PATCHED: "Patched",
    }[DeviceCondition(device.condition)]
    seller_name = e(seller.name) if seller else "______________________"
    seller_phone = e(seller.phone) if seller else "______________"
    cnic = e(
        (v.cnic_no if v and v.cnic_no else (seller.cnic if seller and seller.cnic else ""))
        or "_____-_______-_"
    )
    date = utcnow().strftime("%d-%m-%Y")
    return f"""<!doctype html>
<html lang="ur"><head><meta charset="utf-8"><title>Purchase Declaration</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@400;700&display=swap" rel="stylesheet">
<style>
@page {{ size: A5; margin: 14mm; }}
body {{ font-family: Arial, sans-serif; color: #111; font-size: 12px; line-height: 1.5; }}
.ur {{ font-family: 'Noto Nastaliq Urdu', serif; direction: rtl; font-size: 14px; line-height: 2; }}
h1 {{ font-size: 16px; margin: 0; }} h2 {{ font-size: 12px; margin: 14px 0 4px; letter-spacing: .08em; text-transform: uppercase; color: #555; }}
table {{ width: 100%; border-collapse: collapse; }} td {{ padding: 4px 6px; border-bottom: 1px solid #ddd; vertical-align: top; }}
.sig {{ display: flex; justify-content: space-between; margin-top: 36px; }} .sig div {{ width: 45%; border-top: 1px solid #333; padding-top: 4px; text-align: center; }}
.shop {{ display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 8px; }}
</style></head><body>
<div class="shop"><div><h1>{e(shop.name)}</h1><div>{e(shop.address or "")} {e(shop.city or "")} · {e(shop.phone or "")}</div></div>
<div class="ur" style="text-align:right"><b>{e(shop.name_ur or shop.name)}</b><br>خریداری کا اقرار نامہ</div></div>
<h2>Purchase declaration · Date {date}</h2>
<table>
<tr><td>Seller / بیچنے والا</td><td>{seller_name}</td></tr>
<tr><td>Phone / فون</td><td>{seller_phone}</td></tr>
<tr><td>CNIC / شناختی کارڈ</td><td>{cnic}</td></tr>
<tr><td>Device / موبائل</td><td>{e(brand.name)} {e(model.name)} · {cond}</td></tr>
<tr><td>IMEI</td><td>{e(device.imei1)}{(" / " + e(device.imei2)) if device.imei2 else ""}</td></tr>
<tr><td>PTA</td><td>{e(device.pta_status)}{(" · SIM time " + str(device.sim_time_months) + " months") if device.sim_time_months else ""}</td></tr>
<tr><td>Price / قیمت</td><td>Rs. {device.cost_price if device.cost_price is not None else "________"}</td></tr>
</table>
<p>I, the seller named above, declare that I am the lawful owner of this mobile phone, that it is not stolen, snatched, lost or reported, and that I am selling it of my own free will. I accept full responsibility if this declaration is found false.</p>
<p class="ur">میں، اوپر درج بیچنے والا، اقرار کرتا/کرتی ہوں کہ یہ موبائل فون میری جائز ملکیت ہے، یہ چوری شدہ، چھینا ہوا، گم شدہ یا رپورٹ شدہ نہیں ہے، اور میں اسے اپنی مرضی سے فروخت کر رہا/رہی ہوں۔ اگر یہ اقرار غلط ثابت ہو تو اس کی پوری ذمہ داری مجھ پر ہوگی۔</p>
<div class="sig"><div>Seller signature / thumb<br><span class="ur">بیچنے والے کے دستخط / انگوٹھا</span></div><div>For {e(shop.name)}<br><span class="ur">دکان کی طرف سے</span></div></div>
</body></html>"""
