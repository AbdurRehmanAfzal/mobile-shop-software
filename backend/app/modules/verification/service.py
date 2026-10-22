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


def declaration_html(
    db: Session, shop_id: uuid.UUID, device_id: uuid.UUID, lang: str | None = None
) -> str:
    device = get_device(db, shop_id, device_id)
    shop = db.get(Shop, shop_id)
    lang = lang if lang in ("en", "ur") else (shop.default_locale or "ur")
    ur = lang == "ur"
    v = latest(db, shop_id, device)
    seller = db.get(Party, v.seller_party_id) if v and v.seller_party_id else None
    brand = db.get(Brand, device.brand_id)
    model = db.get(Model, device.model_id)
    e = html.escape
    cond_en = {
        DeviceCondition.BOX_PACK: "Box pack",
        DeviceCondition.OPEN_BOX: "Open box",
        DeviceCondition.USED: "Used",
        DeviceCondition.PATCHED: "Patched",
    }
    cond_ur = {
        DeviceCondition.BOX_PACK: "باکس پیک",
        DeviceCondition.OPEN_BOX: "کھلا باکس",
        DeviceCondition.USED: "استعمال شدہ",
        DeviceCondition.PATCHED: "پیچ شدہ",
    }
    cond = (cond_ur if ur else cond_en)[DeviceCondition(device.condition)]
    T = {
        "title": "خریداری کا اقرار نامہ" if ur else "Purchase declaration",
        "date": "تاریخ" if ur else "Date",
        "seller": "بیچنے والا" if ur else "Seller",
        "phone": "فون" if ur else "Phone",
        "cnic": "شناختی کارڈ" if ur else "CNIC",
        "device": "موبائل" if ur else "Device",
        "pta": "پی ٹی اے" if ur else "PTA",
        "simtime": "سم ٹائم" if ur else "SIM time",
        "months": "مہینے" if ur else "months",
        "price": "قیمت" if ur else "Price",
        "text": (
            "میں، اوپر درج بیچنے والا، اقرار کرتا/کرتی ہوں کہ یہ موبائل فون میری جائز ملکیت ہے، یہ چوری شدہ، چھینا ہوا، گم شدہ یا رپورٹ شدہ نہیں ہے، اور میں اسے اپنی مرضی سے فروخت کر رہا/رہی ہوں۔ اگر یہ اقرار غلط ثابت ہو تو اس کی پوری ذمہ داری مجھ پر ہوگی۔"
            if ur
            else "I, the seller named above, declare that I am the lawful owner of this mobile phone, that it is not stolen, snatched, lost or reported, and that I am selling it of my own free will. I accept full responsibility if this declaration is found false."
        ),
        "sig": "بیچنے والے کے دستخط / انگوٹھا" if ur else "Seller signature / thumb",
        "for": "دکان کی طرف سے" if ur else "For the shop",
    }
    seller_name = e(seller.name) if seller else "______________________"
    seller_phone = e(seller.phone) if seller else "______________"
    cnic = e(
        (v.cnic_no if v and v.cnic_no else (seller.cnic if seller and seller.cnic else ""))
        or "_____-_______-_"
    )
    date = utcnow().strftime("%d-%m-%Y")
    shop_name = e(shop.name_ur) if ur and shop.name_ur else e(shop.name)
    font_link = (
        '<link href="https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@400;700&display=swap" rel="stylesheet">'
        if ur
        else ""
    )
    body_font = "'Noto Nastaliq Urdu', serif" if ur else "Arial, sans-serif"
    sim = (
        f" · {T['simtime']} {device.sim_time_months} {T['months']}"
        if device.sim_time_months
        else ""
    )
    return f"""<!doctype html>
<html lang="{lang}" dir="{"rtl" if ur else "ltr"}"><head><meta charset="utf-8"><title>{T["title"]}</title>
{font_link}
<style>
@page {{ size: A5; margin: 14mm; }}
body {{ font-family: {body_font}; color: #111; font-size: {"13px" if ur else "12px"}; line-height: {"2" if ur else "1.5"}; }}
h1 {{ font-size: 16px; margin: 0; }} h2 {{ font-size: 12px; margin: 14px 0 4px; color: #555; }}
table {{ width: 100%; border-collapse: collapse; }} td {{ padding: 4px 6px; border-bottom: 1px solid #ddd; vertical-align: top; }}
.ltr {{ direction: ltr; unicode-bidi: isolate; }}
.sig {{ display: flex; justify-content: space-between; margin-top: 36px; }} .sig div {{ width: 45%; border-top: 1px solid #333; padding-top: 4px; text-align: center; }}
.shop {{ border-bottom: 2px solid #111; padding-bottom: 8px; }}
</style></head><body>
<div class="shop"><h1>{shop_name}</h1><div>{e(shop.address or "")} {e(shop.city or "")} · <span class="ltr">{e(shop.phone or "")}</span></div></div>
<h2>{T["title"]} · {T["date"]} <span class="ltr">{date}</span></h2>
<table>
<tr><td>{T["seller"]}</td><td>{seller_name}</td></tr>
<tr><td>{T["phone"]}</td><td class="ltr">{seller_phone}</td></tr>
<tr><td>{T["cnic"]}</td><td class="ltr">{cnic}</td></tr>
<tr><td>{T["device"]}</td><td><span class="ltr">{e(brand.name)} {e(model.name)}</span> · {cond}</td></tr>
<tr><td>IMEI</td><td class="ltr">{e(device.imei1)}{(" / " + e(device.imei2)) if device.imei2 else ""}</td></tr>
<tr><td>{T["pta"]}</td><td><span class="ltr">{e(device.pta_status)}</span>{sim}</td></tr>
<tr><td>{T["price"]}</td><td class="ltr">Rs. {device.cost_price if device.cost_price is not None else "________"}</td></tr>
</table>
<p>{T["text"]}</p>
<div class="sig"><div>{T["sig"]}</div><div>{T["for"]} {shop_name}</div></div>
</body></html>"""
