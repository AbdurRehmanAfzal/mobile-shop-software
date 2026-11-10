"""Reserve stock for a customer (owner 2026-11-10, ADR-060).

A phone: held for one customer, optionally until a date, with a note. It stays "in stock" (no
status change, nothing posted), is not counted as available to sell, and only that customer can buy
it; the sale to them ends the hold. Releasing it is an event too.

An item: some pieces held for one customer. They stay in the item's count; others can buy only what
is not held (unless the shop allows selling into minus); a sale to that customer fills their hold
first. Nothing here touches the ledger."""

import datetime as dt
import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import Conflict, NotFound, ValidationFailed
from app.db.base import utcnow
from app.modules.accessories.models import Accessory, AccessoryReservation
from app.modules.audit.service import record_audit
from app.modules.devices.models import Device
from app.modules.devices.service import apply_event, get_device
from app.modules.devices.state import DeviceStatus, EventType
from app.modules.parties.models import Party


def _party(db: Session, shop_id: uuid.UUID, party_id: uuid.UUID) -> Party:
    p = db.get(Party, party_id)
    if p is None or p.shop_id != shop_id:
        raise NotFound(code="party_not_found")
    return p


# ---- phones -------------------------------------------------------------------------------


def reserve_device(
    db: Session,
    shop_id: uuid.UUID,
    user_id: uuid.UUID,
    device_id: uuid.UUID,
    *,
    party_id: uuid.UUID,
    until: dt.date | None,
    note: str | None,
) -> Device:
    d = get_device(db, shop_id, device_id)
    if d.status != DeviceStatus.IN_STOCK:
        raise Conflict(
            code="not_in_stock",
            message_en="Only a phone in stock can be reserved",
            message_ur="صرف اسٹاک میں موجود فون ریزرو ہو سکتا ہے",
        )
    if d.reserved_party_id:
        raise Conflict(
            code="already_reserved",
            message_en="This phone is already reserved; release it first",
            message_ur="یہ فون پہلے سے ریزرو ہے؛ پہلے ریزرو ختم کریں",
        )
    p = _party(db, shop_id, party_id)
    d.reserved_party_id = p.id
    d.reserved_at = utcnow()
    d.reserved_until = until
    d.reserved_note = (note or "").strip() or None
    d.reserved_by = user_id
    apply_event(
        db,
        shop_id,
        user_id,
        d,
        EventType.RESERVED,
        party_id=p.id,
        data={"until": until.isoformat() if until else None, "note": d.reserved_note},
    )
    record_audit(
        db,
        shop_id=shop_id,
        user_id=user_id,
        entity="device",
        entity_id=d.id,
        action="reserve",
        after={"party_id": str(p.id), "until": until.isoformat() if until else None},
    )
    db.commit()
    return d


def _clear(d: Device) -> None:
    d.reserved_party_id = None
    d.reserved_at = None
    d.reserved_until = None
    d.reserved_note = None
    d.reserved_by = None


def release_device(
    db: Session, shop_id: uuid.UUID, user_id: uuid.UUID, device_id: uuid.UUID, reason: str | None
) -> Device:
    d = get_device(db, shop_id, device_id)
    if not d.reserved_party_id:
        raise Conflict(
            code="not_reserved",
            message_en="This phone is not reserved",
            message_ur="یہ فون ریزرو نہیں ہے",
        )
    who = d.reserved_party_id
    _clear(d)
    apply_event(
        db,
        shop_id,
        user_id,
        d,
        EventType.UNRESERVED,
        party_id=who,
        data={"reason": (reason or "").strip() or None},
    )
    record_audit(
        db,
        shop_id=shop_id,
        user_id=user_id,
        entity="device",
        entity_id=d.id,
        action="release",
        before={"party_id": str(who)},
    )
    db.commit()
    return d


def check_device_sale(db: Session, device: Device, party_id: uuid.UUID | None) -> None:
    """called by the sale: a reserved phone goes only to its customer, and that sale ends the hold"""
    if not device.reserved_party_id:
        return
    if party_id != device.reserved_party_id:
        who = db.get(Party, device.reserved_party_id)
        name = who.name if who else ""
        raise Conflict(
            code="reserved_for_other",
            message_en=f"This phone is reserved for {name}. Release the reservation to sell it to someone else.",
            message_ur=f"یہ فون {name} کے لیے ریزرو ہے۔ کسی اور کو بیچنے کے لیے پہلے ریزرو ختم کریں۔",
        )
    _clear(device)


# ---- items --------------------------------------------------------------------------------


def held_qty(db: Session, shop_id: uuid.UUID, accessory_id: uuid.UUID, *, except_party=None) -> int:
    """pieces still held (open reservations), optionally not counting one customer's"""
    q = select(
        func.coalesce(func.sum(AccessoryReservation.qty - AccessoryReservation.fulfilled_qty), 0)
    ).where(
        AccessoryReservation.shop_id == shop_id,
        AccessoryReservation.accessory_id == accessory_id,
        AccessoryReservation.status == "open",
    )
    if except_party is not None:
        q = q.where(AccessoryReservation.party_id != except_party)
    return int(db.scalar(q) or 0)


def held_by_item(db: Session, shop_id: uuid.UUID, ids: list) -> dict:
    if not ids:
        return {}
    return dict(
        db.execute(
            select(
                AccessoryReservation.accessory_id,
                func.sum(AccessoryReservation.qty - AccessoryReservation.fulfilled_qty),
            )
            .where(
                AccessoryReservation.shop_id == shop_id,
                AccessoryReservation.accessory_id.in_(ids),
                AccessoryReservation.status == "open",
            )
            .group_by(AccessoryReservation.accessory_id)
        ).all()
    )


def reserve_item(
    db: Session,
    shop_id: uuid.UUID,
    user_id: uuid.UUID,
    accessory_id: uuid.UUID,
    *,
    party_id: uuid.UUID,
    qty: int,
    until: dt.date | None,
    note: str | None,
) -> AccessoryReservation:
    a = db.get(Accessory, accessory_id)
    if a is None or a.shop_id != shop_id:
        raise NotFound(code="item_not_found")
    if qty < 1:
        raise ValidationFailed(code="qty_invalid")
    free = a.qty - held_qty(db, shop_id, a.id)
    if qty > free:
        raise Conflict(
            code="not_enough_free",
            message_en=f"Only {max(free, 0)} can be reserved (the rest is already held)",
            message_ur=f"صرف {max(free, 0)} ریزرو ہو سکتے ہیں (باقی پہلے سے ریزرو ہیں)",
        )
    p = _party(db, shop_id, party_id)
    r = AccessoryReservation(
        shop_id=shop_id,
        accessory_id=a.id,
        party_id=p.id,
        qty=qty,
        until=until,
        note=(note or "").strip() or None,
        created_by=user_id,
    )
    db.add(r)
    db.flush()
    record_audit(
        db,
        shop_id=shop_id,
        user_id=user_id,
        entity="accessory",
        entity_id=a.id,
        action="reserve",
        after={"party_id": str(p.id), "qty": qty},
    )
    db.commit()
    return r


def release_item(
    db: Session,
    shop_id: uuid.UUID,
    user_id: uuid.UUID,
    reservation_id: uuid.UUID,
    reason: str | None,
) -> AccessoryReservation:
    r = db.get(AccessoryReservation, reservation_id)
    if r is None or r.shop_id != shop_id:
        raise NotFound(code="reservation_not_found")
    if r.status != "open":
        raise Conflict(
            code="not_open",
            message_en="This reservation is already closed",
            message_ur="یہ ریزرو پہلے ہی ختم ہو چکا ہے",
        )
    r.status = "released"
    r.closed_at = utcnow()
    r.close_reason = (reason or "").strip() or None
    record_audit(
        db,
        shop_id=shop_id,
        user_id=user_id,
        entity="accessory",
        entity_id=r.accessory_id,
        action="release",
        after={"reservation": str(r.id)},
    )
    db.commit()
    return r


def check_item_sale(
    db: Session, shop_id: uuid.UUID, a: Accessory, qty: int, party_id, allow_negative: bool
) -> None:
    """called by the sale before the stock moves: others may not take pieces held for a customer;
    the customer's own hold is filled"""
    others = held_qty(db, shop_id, a.id, except_party=party_id)
    if others and qty > a.qty - others and not allow_negative:
        raise Conflict(
            code="reserved_stock",
            message_en=f"{others} of {a.name} are reserved for other customers; only {max(a.qty - others, 0)} can be sold",
            message_ur=f"{a.name} میں سے {others} دوسرے گاہکوں کے لیے ریزرو ہیں؛ صرف {max(a.qty - others, 0)} بک سکتے ہیں",
        )
    if party_id is None:
        return
    left = qty
    for r in db.scalars(
        select(AccessoryReservation)
        .where(
            AccessoryReservation.shop_id == shop_id,
            AccessoryReservation.accessory_id == a.id,
            AccessoryReservation.party_id == party_id,
            AccessoryReservation.status == "open",
        )
        .order_by(AccessoryReservation.created_at)
    ).all():
        if left <= 0:
            break
        take = min(left, r.qty - r.fulfilled_qty)
        r.fulfilled_qty += take
        left -= take
        if r.fulfilled_qty >= r.qty:
            r.status = "done"
            r.closed_at = utcnow()


def item_reservations(db: Session, shop_id: uuid.UUID, accessory_id: uuid.UUID) -> list[dict]:
    out = []
    for r in db.scalars(
        select(AccessoryReservation)
        .where(
            AccessoryReservation.shop_id == shop_id,
            AccessoryReservation.accessory_id == accessory_id,
        )
        .order_by(AccessoryReservation.created_at.desc())
        .limit(50)
    ).all():
        p = db.get(Party, r.party_id)
        out.append(
            {
                "id": r.id,
                "party_id": r.party_id,
                "party_name": p.name if p else None,
                "qty": r.qty,
                "fulfilled_qty": r.fulfilled_qty,
                "left": r.qty - r.fulfilled_qty,
                "status": r.status,
                "until": r.until,
                "note": r.note,
                "created_at": r.created_at,
            }
        )
    return out
