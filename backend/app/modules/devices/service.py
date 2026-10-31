import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, aliased

from app.core.errors import Conflict, NotFound, ValidationFailed
from app.core.pk import is_valid_imei
from app.db.base import utcnow
from app.modules.audit.service import record_audit
from app.modules.auth.models import User
from app.modules.catalogue.models import Brand, Colour, Model, Storage
from app.modules.devices.models import Device, DeviceAccessoryItem, DeviceEvent
from app.modules.devices.schemas import (
    AccessoryItemIn,
    DeviceUpdate,
    EventIn,
    OpeningStockIn,
    clean_imei,
)
from app.modules.devices.state import (
    MONEY_EVENTS,
    DeviceCondition,
    DeviceStatus,
    EventType,
    PtaStatus,
    VerificationStatus,
    next_status,
)
from app.modules.ledger import accounts as acc
from app.modules.ledger.service import Posting, money, post
from app.modules.parties.models import Party


class InvalidTransition(Conflict):
    code = "invalid_transition"
    message_en = "This action is not allowed for the device's current status"
    message_ur = "موبائل کی موجودہ حالت میں یہ کام ممکن نہیں"


# ---- event log (the only writer of status) -----------------------------------------------


def apply_event(
    db: Session,
    shop_id: uuid.UUID,
    user_id: uuid.UUID | None,
    device: Device,
    event_type: EventType,
    *,
    party_id: uuid.UUID | None = None,
    amount: Decimal | None = None,
    ledger_group_id: uuid.UUID | None = None,
    document_type: str | None = None,
    document_id: uuid.UUID | None = None,
    data: dict | None = None,
    at: datetime | None = None,
) -> DeviceEvent:
    current = DeviceStatus(device.status) if device.event_count else None
    new_status = next_status(current, event_type)
    if new_status is None:
        raise InvalidTransition(details={"status": device.status, "event": event_type})
    at = at or utcnow()
    if party_id is not None:
        party = db.get(Party, party_id)
        if party is None or party.shop_id != shop_id:
            raise NotFound(code="party_not_found")

    event = DeviceEvent(
        shop_id=shop_id,
        device_id=device.id,
        seq=device.event_count,
        type=event_type,
        status_after=new_status,
        party_id=party_id,
        amount=money(amount) if amount is not None else None,
        ledger_group_id=ledger_group_id,
        document_type=document_type,
        document_id=document_id,
        data=data,
        user_id=user_id,
        at=at,
    )
    db.add(event)

    # projection
    device.status = new_status
    device.event_count += 1
    device.last_event_at = at
    if event_type == EventType.PURCHASED:
        if current is not None:
            device.cycle_no += 1
        if amount is not None:
            device.cost_price = money(amount)
        device.current_party_id = None
        device.verification_status = (
            VerificationStatus.NOT_REQUIRED
            if (data or {}).get("source") == "supplier"
            and device.condition == DeviceCondition.BOX_PACK
            else (data or {}).get("verification_status", VerificationStatus.PENDING)
        )
    elif event_type in (
        EventType.LOANED_OUT,
        EventType.APPROVAL_OUT,
        EventType.SENT_TO_REPAIR,
        EventType.SOLD,
        EventType.RETURNED_TO_SUPPLIER,
    ):
        device.current_party_id = party_id
    elif event_type in (
        EventType.LOAN_RETURNED,
        EventType.APPROVAL_RETURNED,
        EventType.REPAIR_RETURNED,
        EventType.SALE_RETURNED,
        EventType.FAULTY_CLEARED,
    ):
        device.current_party_id = None
    elif event_type == EventType.VERIFIED:
        device.verification_status = (data or {}).get("result", VerificationStatus.CLEAR)
    elif event_type == EventType.PRICE_CHANGED and amount is not None:
        device.asking_price = money(amount)
    db.flush()
    return event


# ---- lookups ------------------------------------------------------------------------------


def get_device(db: Session, shop_id: uuid.UUID, device_id: uuid.UUID) -> Device:
    d = db.get(Device, device_id)
    if d is None or d.shop_id != shop_id:
        raise NotFound(
            code="device_not_found", message_en="Device not found", message_ur="موبائل نہیں ملا"
        )
    return d


def by_imei(db: Session, shop_id: uuid.UUID, imei: str) -> Device | None:
    return db.scalar(
        select(Device).where(
            Device.shop_id == shop_id, or_(Device.imei1 == imei, Device.imei2 == imei)
        )
    )


def _base_query(shop_id: uuid.UUID):
    cur = aliased(Party)
    return (
        select(Device, Brand.name, Model.name, Storage.name, Colour.name, cur.name)
        .join(Brand, Brand.id == Device.brand_id)
        .join(Model, Model.id == Device.model_id)
        .outerjoin(Storage, Storage.id == Device.storage_id)
        .outerjoin(Colour, Colour.id == Device.colour_id)
        .outerjoin(cur, cur.id == Device.current_party_id)
        .where(Device.shop_id == shop_id)
    )


def to_out(row) -> dict:
    d, brand, model, storage, colour, party = row
    return {
        **{c.name: getattr(d, c.name) for c in Device.__table__.columns},
        "brand_name": brand,
        "model_name": model,
        "storage_name": storage,
        "colour_name": colour,
        "current_party_name": party,
        "imei_luhn_ok": is_valid_imei(d.imei1),
    }


def list_devices(
    db: Session,
    shop_id: uuid.UUID,
    *,
    status: DeviceStatus | None,
    condition: DeviceCondition | None,
    pta_status: PtaStatus | None,
    brand_id: uuid.UUID | None,
    q: str | None,
    limit: int,
    category: str | None = None,
) -> list[dict]:
    stmt = _base_query(shop_id)
    if category:
        stmt = stmt.where(Device.category == category)
    if status:
        stmt = stmt.where(Device.status == status)
    if condition:
        stmt = stmt.where(Device.condition == condition)
    if pta_status:
        stmt = stmt.where(Device.pta_status == pta_status)
    if brand_id:
        stmt = stmt.where(Device.brand_id == brand_id)
    if q:
        q = q.strip()
        like = f"%{q}%"
        digits = "".join(ch for ch in q if ch.isdigit())
        # owner 2026-10-29: also the person who has it now (the buyer of a sold phone, the seller
        # of one on loan), by name or phone
        who = aliased(Party)
        stmt = stmt.outerjoin(who, who.id == Device.current_party_id)
        conds = [
            Model.name.ilike(like),
            Brand.name.ilike(like),
            Device.serial.ilike(like),
            who.name.ilike(like),
        ]
        if len(digits) >= 4:
            conds += [
                Device.imei1.like(f"%{digits}%"),
                Device.imei2.like(f"%{digits}%"),
                who.phone.like(f"%{digits}%"),
            ]
        stmt = stmt.where(or_(*conds))
    stmt = stmt.order_by(Device.last_event_at.desc()).limit(limit)
    return [to_out(r) for r in db.execute(stmt).all()]


def get_device_out(db: Session, shop_id: uuid.UUID, device_id: uuid.UUID) -> dict:
    row = db.execute(_base_query(shop_id).where(Device.id == device_id)).first()
    if row is None:
        raise NotFound(
            code="device_not_found", message_en="Device not found", message_ur="موبائل نہیں ملا"
        )
    return to_out(row)


def imei_lookup(db: Session, shop_id: uuid.UUID, raw: str) -> dict:
    try:
        imei = clean_imei(raw)
    except ValueError:
        return {
            "found": False,
            "device": None,
            "seen_before": False,
            "times_bought": 0,
            "luhn_ok": False,
        }
    device = by_imei(db, shop_id, imei)
    if device is None:
        return {
            "found": False,
            "device": None,
            "seen_before": False,
            "times_bought": 0,
            "luhn_ok": is_valid_imei(imei),
        }
    times = db.scalar(
        select(func.count(DeviceEvent.id)).where(
            DeviceEvent.device_id == device.id, DeviceEvent.type == EventType.PURCHASED
        )
    )
    return {
        "found": True,
        "device": get_device_out(db, shop_id, device.id),
        "seen_before": True,
        "times_bought": times or 0,
        "luhn_ok": is_valid_imei(imei),
    }


def history(db: Session, shop_id: uuid.UUID, device_id: uuid.UUID) -> list[dict]:
    get_device(db, shop_id, device_id)
    rows = db.execute(
        select(DeviceEvent, Party.name, User.name)
        .outerjoin(Party, Party.id == DeviceEvent.party_id)
        .outerjoin(User, User.id == DeviceEvent.user_id)
        .where(DeviceEvent.device_id == device_id)
        .order_by(DeviceEvent.seq)
    ).all()
    return [
        {
            **{c.name: getattr(e, c.name) for c in DeviceEvent.__table__.columns},
            "party_name": pn,
            "user_name": un,
        }
        for e, pn, un in rows
    ]


# ---- creation / mutation ------------------------------------------------------------------


def _validate_catalogue(db: Session, shop_id: uuid.UUID, data) -> None:
    brand = db.get(Brand, data.brand_id)
    model = db.get(Model, data.model_id)
    if (
        brand is None
        or (brand.shop_id not in (None, shop_id))
        or model is None
        or model.brand_id != brand.id
    ):
        raise ValidationFailed(
            code="catalogue_mismatch",
            message_en="Brand/model do not match",
            message_ur="برانڈ اور ماڈل مطابقت نہیں رکھتے",
        )
    if (
        data.storage_id
        and (s := db.get(Storage, data.storage_id)) is not None
        and s.shop_id not in (None, shop_id)
    ):
        raise ValidationFailed(code="catalogue_mismatch")
    if (
        data.colour_id
        and (c := db.get(Colour, data.colour_id)) is not None
        and c.shop_id not in (None, shop_id)
    ):
        raise ValidationFailed(code="catalogue_mismatch")


def new_device(db: Session, shop_id: uuid.UUID, data) -> Device:
    """Create the device row (no event yet). Caller must apply a PURCHASED event in the same transaction."""
    _validate_catalogue(db, shop_id, data)
    if by_imei(db, shop_id, data.imei1) is not None:
        raise Conflict(
            code="imei_exists",
            message_en="This IMEI is already in your shop. Use IMEI search to see its history and buy it back.",
            message_ur="یہ IMEI پہلے سے آپ کی دکان میں ہے۔ IMEI تلاش سے اس کی تاریخ دیکھیں",
        )
    fields = data.model_dump(
        exclude={
            "cost_price",
            "asking_price",
            "accessories",
            "barcode",
            "barcode_type",
            "manufacturer_code",
        }
    )
    device = Device(shop_id=shop_id, **fields)
    db.add(device)
    db.flush()
    # owner addendum 4: the barcode is born with the unit, in this same transaction
    from app.modules.auth.models import Shop
    from app.modules.barcodes.service import assign_device

    assign_device(
        db,
        db.get(Shop, shop_id),
        device,
        value=getattr(data, "barcode", None),
        kind=getattr(data, "barcode_type", None),
        manufacturer_code=getattr(data, "manufacturer_code", None),
    )
    db.flush()
    return device


def replace_accessories(db: Session, device: Device, items: list[AccessoryItemIn]) -> None:
    device.accessories = [DeviceAccessoryItem(device_id=device.id, **i.model_dump()) for i in items]
    db.flush()


def add_opening_stock(
    db: Session, shop_id: uuid.UUID, user_id: uuid.UUID, data: OpeningStockIn
) -> dict:
    device = new_device(db, shop_id, data)
    device.asking_price = money(data.asking_price) if data.asking_price is not None else None
    replace_accessories(db, device, data.accessories)
    cost = money(data.cost_price)
    group = None
    if cost > 0:
        posting = Posting(
            document_type="opening_stock",
            document_id=device.id,
            memo=f"Opening stock {device.imei1}",
        )
        posting.debit(acc.SysAccount.INVENTORY, cost, device_id=device.id).credit(
            acc.SysAccount.EQUITY, cost
        )
        group = post(db, shop_id, user_id, posting)
    apply_event(
        db,
        shop_id,
        user_id,
        device,
        EventType.PURCHASED,
        amount=cost,
        ledger_group_id=group.id if group else None,
        document_type="opening_stock",
        document_id=device.id,
        data={
            "source": "opening_stock",
            "asking": str(device.asking_price) if device.asking_price is not None else None,
            "barcode": device.barcode,
            "verification_status": VerificationStatus.NOT_REQUIRED
            if device.condition == DeviceCondition.BOX_PACK
            else VerificationStatus.PENDING,
        },
    )
    record_audit(
        db,
        shop_id=shop_id,
        user_id=user_id,
        entity="device",
        entity_id=device.id,
        action="create",
        after={"imei1": device.imei1, "via": "opening_stock"},
    )
    db.commit()
    return get_device_out(db, shop_id, device.id)


def update_device(
    db: Session, shop_id: uuid.UUID, ctx, device_id: uuid.UUID, data: DeviceUpdate
) -> dict:
    user_id = ctx.id
    device = get_device(db, shop_id, device_id)
    changes = data.model_dump(exclude_unset=True)
    asking = changes.pop("asking_price", None)
    asking_reason = changes.pop("asking_reason", None)
    approval_pin = changes.pop("approval_pin", None)
    if changes.get("imei2"):
        other = by_imei(db, shop_id, changes["imei2"])
        if other and other.id != device.id:
            raise Conflict(code="imei_exists")
    if "brand_id" in changes or "model_id" in changes:
        from types import SimpleNamespace

        _validate_catalogue(
            db,
            shop_id,
            SimpleNamespace(
                brand_id=changes.get("brand_id") or device.brand_id,
                model_id=changes.get("model_id") or device.model_id,
                storage_id=changes.get("storage_id", device.storage_id),
                colour_id=changes.get("colour_id", device.colour_id),
            ),
        )
    before = {k: _plain(getattr(device, k)) for k in changes}
    for k, v in changes.items():
        setattr(device, k, v)
    if device.pta_status in (PtaStatus.NON_PTA, PtaStatus.JV) and device.sim_time_months is None:
        raise ValidationFailed(code="sim_time_required")
    if asking is not None and device.cost_price is not None and money(asking) < device.cost_price:
        raise ValidationFailed(
            code="asking_below_cost",
            message_en="Selling price cannot be less than the buying price",
            message_ur="بیچنے کی قیمت خرید قیمت سے کم نہیں ہو سکتی",
        )
    if asking is not None and money(asking) != (device.asking_price or Decimal(-1)):
        from app.modules.auth.models import Shop
        from app.modules.sales import approval

        approver = approval.require(db, db.get(Shop, shop_id), ctx, "asking_change", approval_pin)
        apply_event(
            db,
            shop_id,
            user_id,
            device,
            EventType.PRICE_CHANGED,
            amount=asking,
            data={
                "from": _plain(device.asking_price),
                "to": str(money(asking)),
                "reason": asking_reason,
                "source": "manual",
                "approved_by": str(approver) if approver else None,
            },
        )
    if changes:
        record_audit(
            db,
            shop_id=shop_id,
            user_id=user_id,
            entity="device",
            entity_id=device.id,
            action="update",
            before=before,
            after={k: _plain(v) for k, v in changes.items()},
        )
    db.commit()
    return get_device_out(db, shop_id, device.id)


def set_accessories(
    db: Session,
    shop_id: uuid.UUID,
    user_id: uuid.UUID,
    device_id: uuid.UUID,
    items: list[AccessoryItemIn],
) -> list[DeviceAccessoryItem]:
    device = get_device(db, shop_id, device_id)
    replace_accessories(db, device, items)
    record_audit(
        db,
        shop_id=shop_id,
        user_id=user_id,
        entity="device",
        entity_id=device.id,
        action="accessories",
        after={"items": [i.kind for i in items]},
    )
    db.commit()
    return list(device.accessories)


def raise_event(
    db: Session, shop_id: uuid.UUID, user_id: uuid.UUID, device_id: uuid.UUID, data: EventIn
) -> dict:
    """Generic, non-money events from the UI."""
    if data.type in MONEY_EVENTS:
        raise ValidationFailed(
            code="money_event",
            message_en="Use a purchase, sale or return to record this",
            message_ur="یہ کام خریداری، فروخت یا واپسی کے ذریعے کریں",
        )
    if data.type in (EventType.LOANED_OUT, EventType.LOAN_RETURNED):
        raise ValidationFailed(
            code="use_loans_endpoint",
            message_en="Use the loans screen for amanat",
            message_ur="امانت کے لیے امانت والی اسکرین استعمال کریں",
        )
    device = get_device(db, shop_id, device_id)
    if data.type in (EventType.LOANED_OUT, EventType.APPROVAL_OUT):
        if data.party_id is None:
            raise ValidationFailed(
                code="party_required",
                message_en="Select who is taking the device",
                message_ur="کون لے کر جا رہا ہے، منتخب کریں",
            )
        party = db.get(Party, data.party_id)
        if party is None or party.shop_id != shop_id:
            raise NotFound(code="party_not_found")
        if data.type == EventType.LOANED_OUT and "shop" not in party.kinds:
            raise ValidationFailed(
                code="loan_party_must_be_shop",
                message_en="Loans (amanat) are only to other shops",
                message_ur="امانت صرف دوسری دکان کو دی جا سکتی ہے",
            )
    payload = dict(data.data or {})
    if data.note:
        payload["note"] = data.note
    if data.expected_back_at:
        payload["expected_back_at"] = data.expected_back_at.isoformat()
    if data.type == EventType.VERIFIED:
        raise ValidationFailed(code="use_verification_endpoint")
    apply_event(
        db, shop_id, user_id, device, data.type, party_id=data.party_id, data=payload or None
    )
    db.commit()
    return get_device_out(db, shop_id, device.id)


def _plain(v):
    if isinstance(v, Decimal | uuid.UUID):
        return str(v)
    if hasattr(v, "isoformat"):
        return v.isoformat()
    return v


def cancel_opening_stock(
    db: Session, shop_id: uuid.UUID, ctx, device_id: uuid.UUID, reason: str
) -> dict:
    """Undo a wrong old-stock entry: reverse its posting and take the phone out of stock.
    Only while nothing else happened to the phone (verification is fine)."""
    from app.core.errors import Forbidden
    from app.core.permissions import Cap
    from app.modules.ledger.service import reverse

    if not ctx.can(Cap.VOID):
        raise Forbidden()
    device = get_device(db, shop_id, device_id)
    events = sorted(device.events, key=lambda e: e.seq)
    entry = next((e for e in events if e.document_type == "opening_stock"), None)
    later = [e for e in events if entry and e.seq > entry.seq and e.type != EventType.VERIFIED]
    if entry is None or later or device.status != DeviceStatus.IN_STOCK:
        raise Conflict(
            code="device_changed",
            message_en="Only an old-stock phone that is still in stock and unchanged can be removed",
            message_ur="صرف وہ پرانا اسٹاک موبائل ہٹایا جا سکتا ہے جو ابھی اسٹاک میں ہو اور تبدیل نہ ہوا ہو",
        )
    if entry.ledger_group_id:
        reverse(
            db,
            shop_id,
            ctx.id,
            entry.ledger_group_id,
            f"Remove opening stock {device.imei1}: {reason}",
        )
    apply_event(
        db,
        shop_id,
        ctx.id,
        device,
        EventType.RETURNED_TO_SUPPLIER,
        amount=entry.amount,
        document_type="opening_stock_void",
        document_id=device.id,
        data={"void": True, "reason": reason},
    )
    record_audit(
        db,
        shop_id=shop_id,
        user_id=ctx.id,
        entity="device",
        entity_id=device.id,
        action="void",
        after={"reason": reason, "via": "opening_stock"},
    )
    db.commit()
    return get_device_out(db, shop_id, device.id)
