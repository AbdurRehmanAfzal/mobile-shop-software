"""Move phones and items to another branch of the same owner (docs/35 §5 item 2, ADR-046).

A move is instant and all-or-nothing, in one transaction:
- every phone: the sending shop's row gets `transferred_out` (status "transferred", its history stays
  there); the receiving shop gets a row for the same unit (or its old row, if the unit was once
  there) whose next event is `transferred_in`, with the same cost, asking price, barcode (when free)
  and verification result;
- every item: the oldest batches leave the sending shop (FIFO cost) and open a batch at that cost in
  the receiving shop's item with the same SKU, made from the sender's card when the branch has none;
- money: stock at cost moves, nothing is sold. Sender: Dr branch_transfer / Cr inventory. Receiver:
  Dr inventory / Cr branch_transfer. Profit is untouched; across the owner the two sides cancel.
"""

import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.errors import Conflict, Forbidden, NotFound, ValidationFailed
from app.db.base import ZERO
from app.modules.accessories import service as items
from app.modules.accessories.models import Accessory
from app.modules.audit.service import record_audit
from app.modules.auth.models import Shop, UserShop
from app.modules.barcodes.service import assign_device, assign_item, taken
from app.modules.devices.models import Device, DeviceAccessoryItem
from app.modules.devices.service import apply_event, by_imei, get_device
from app.modules.devices.state import DeviceStatus, EventType
from app.modules.ledger import accounts as acc
from app.modules.ledger.service import Posting, money, post
from app.modules.transfers.models import BranchTransfer, BranchTransferLine
from app.modules.transfers.schemas import TransferIn

DOC = "branch_transfer"
# the projection and identity of a phone row are its own; everything else is copied to the branch
_DEVICE_SKIP = {
    "id",
    "shop_id",
    "status",
    "current_party_id",
    "verification_status",
    "cost_price",
    "cycle_no",
    "first_seen_at",
    "last_event_at",
    "event_count",
    "created_at",
    "updated_at",
    "barcode",
    "barcode_type",
}
_ITEM_SKIP = {
    "id",
    "shop_id",
    "qty",
    "avg_cost",
    "created_at",
    "updated_at",
    "barcode",
    "barcode_type",
}
# a phone the branch already has a row for may come back only when that row is not in its stock
_BACK_OK = {DeviceStatus.SOLD, DeviceStatus.RETURNED_TO_SUPPLIER, DeviceStatus.TRANSFERRED}


def branches(db: Session, user_id: uuid.UUID, shop: Shop) -> list[dict]:
    """the other branches of this owner that this user works in"""
    rows = db.scalars(
        select(Shop)
        .join(UserShop, UserShop.shop_id == Shop.id)
        .where(
            UserShop.user_id == user_id,
            Shop.organisation_id == shop.organisation_id,
            Shop.id != shop.id,
        )
        .order_by(Shop.name)
    ).all()
    return [{"id": s.id, "name": s.name, "city": s.city} for s in rows]


def _target(db: Session, user_id: uuid.UUID, shop: Shop, to_shop_id: uuid.UUID) -> Shop:
    dst = db.get(Shop, to_shop_id)
    if dst is None or dst.id == shop.id or dst.organisation_id != shop.organisation_id:
        raise NotFound(
            code="branch_not_found",
            message_en="That branch is not one of your shops",
            message_ur="یہ برانچ آپ کی دکانوں میں نہیں",
        )
    linked = db.scalar(
        select(UserShop).where(UserShop.user_id == user_id, UserShop.shop_id == dst.id)
    )
    if linked is None:
        raise Forbidden(
            code="branch_forbidden",
            message_en="You do not work in that branch",
            message_ur="آپ اس برانچ میں کام نہیں کرتے",
        )
    return dst


def _copy_device(db: Session, dev: Device, dst: Shop) -> Device:
    """the receiving shop's row for this unit: its old one (a unit that was there before) or a new one"""
    existing = by_imei(db, dst.id, dev.imei1)
    if existing is not None and existing.status not in _BACK_OK:
        raise Conflict(
            code="imei_in_branch",
            message_en=f"IMEI {dev.imei1} is already in stock at {dst.name}",
            message_ur=f"IMEI {dev.imei1} پہلے سے {dst.name} کے اسٹاک میں ہے",
        )
    target = existing or Device(shop_id=dst.id)
    for col in Device.__table__.columns:
        if col.name not in _DEVICE_SKIP:
            setattr(target, col.name, getattr(dev, col.name))
    if existing is None:
        db.add(target)
    db.flush()
    target.accessories = [
        DeviceAccessoryItem(device_id=target.id, kind=a.kind, label=a.label, came_with=a.came_with)
        for a in dev.accessories
    ]
    # the sticker on the phone keeps working when its code is free in the branch
    if not target.barcode:
        if dev.barcode and not taken(db, dst.id, dev.barcode, device_id=target.id):
            target.barcode, target.barcode_type = dev.barcode, dev.barcode_type
        else:
            assign_device(db, dst, target)
    db.flush()
    return target


def _copy_item(db: Session, a: Accessory, dst: Shop) -> Accessory:
    """the branch's card for this item: same SKU, or a copy of the sender's card"""
    found = db.scalar(select(Accessory).where(Accessory.shop_id == dst.id, Accessory.sku == a.sku))
    if found is not None:
        return found
    b = Accessory(shop_id=dst.id, qty=0, avg_cost=ZERO)
    for col in Accessory.__table__.columns:
        if col.name not in _ITEM_SKIP:
            setattr(b, col.name, getattr(a, col.name))
    db.add(b)
    db.flush()
    if a.barcode and not taken(db, dst.id, a.barcode, item_id=b.id):
        b.barcode, b.barcode_type = a.barcode, a.barcode_type
    else:
        assign_item(db, dst, b)
    db.flush()
    return b


def _label(db: Session, dev: Device) -> str:
    from app.modules.catalogue.models import Brand, Model

    brand, model = db.get(Brand, dev.brand_id), db.get(Model, dev.model_id)
    return (
        " ".join(x for x in (brand.name if brand else None, model.name if model else None) if x)
        or dev.imei1
    )


def create(db: Session, user_id: uuid.UUID, shop: Shop, data: TransferIn) -> dict:
    if not data.devices and not data.items:
        raise ValidationFailed(
            code="transfer_empty",
            message_en="Add a phone or an item to send",
            message_ur="بھیجنے کے لیے موبائل یا آئٹم شامل کریں",
        )
    if len(set(data.devices)) != len(data.devices) or len({i.id for i in data.items}) != len(
        data.items
    ):
        raise ValidationFailed(
            code="transfer_duplicate",
            message_en="The same phone or item is on the list twice",
            message_ur="ایک ہی موبائل یا آئٹم دو بار لکھا ہے",
        )
    dst = _target(db, user_id, shop, data.to_shop_id)
    n = (
        db.scalar(
            select(func.count())
            .select_from(BranchTransfer)
            .where(BranchTransfer.shop_id == shop.id)
        )
        or 0
    ) + 1
    t = BranchTransfer(
        shop_id=shop.id, no=f"TRF-{n:06d}", to_shop_id=dst.id, note=data.note, user_id=user_id
    )
    db.add(t)
    db.flush()
    out = Posting(document_type=DOC, document_id=t.id, memo=f"{t.no} to {dst.name}")
    into = Posting(document_type=DOC, document_id=t.id, memo=f"{t.no} from {shop.name}")
    events = []
    total = ZERO
    seq = 0
    for device_id in data.devices:
        dev = get_device(db, shop.id, device_id)
        if dev.status != DeviceStatus.IN_STOCK:
            raise Conflict(
                code="device_not_in_stock",
                message_en=f"IMEI {dev.imei1} is not in stock here",
                message_ur=f"IMEI {dev.imei1} یہاں اسٹاک میں نہیں",
            )
        cost = money(dev.cost_price or ZERO)
        target = _copy_device(db, dev, dst)
        info = {"no": t.no, "note": data.note}
        events.append(
            apply_event(
                db,
                shop.id,
                user_id,
                dev,
                EventType.TRANSFERRED_OUT,
                amount=cost,
                document_type=DOC,
                document_id=t.id,
                data={
                    **info,
                    "to_shop_id": str(dst.id),
                    "to_shop": dst.name,
                    "to_device_id": str(target.id),
                },
            )
        )
        events.append(
            apply_event(
                db,
                dst.id,
                user_id,
                target,
                EventType.TRANSFERRED_IN,
                amount=cost,
                document_type=DOC,
                document_id=t.id,
                data={
                    **info,
                    "from_shop_id": str(shop.id),
                    "from_shop": shop.name,
                    "from_device_id": str(dev.id),
                    "verification_status": dev.verification_status,
                },
            )
        )
        target.asking_price = dev.asking_price
        if cost > 0:
            out.credit(acc.SysAccount.INVENTORY, cost, device_id=dev.id, memo=dev.imei1)
            into.debit(acc.SysAccount.INVENTORY, cost, device_id=target.id, memo=dev.imei1)
        total += cost
        db.add(
            BranchTransferLine(
                transfer_id=t.id,
                seq=seq,
                kind="device",
                label=f"{_label(db, dev)} · {dev.imei1}",
                from_device_id=dev.id,
                to_device_id=target.id,
                qty=1,
                cost=cost,
            )
        )
        seq += 1
    for line in data.items:
        a = items.get_accessory(db, shop.id, line.id)
        m = items.move(
            db,
            shop.id,
            user_id,
            a,
            -line.qty,
            "transfer",
            document_type=DOC,
            document_id=t.id,
            note=f"{t.no} → {dst.name}",
        )
        cost = money(getattr(m, "cost_total", None) or money(m.unit_cost * line.qty))
        b = _copy_item(db, a, dst)
        items.move(
            db,
            dst.id,
            user_id,
            b,
            line.qty,
            "transfer",
            unit_cost=money(cost / line.qty),
            document_type=DOC,
            document_id=t.id,
            note=f"{t.no} ← {shop.name}",
        )
        if cost > 0:
            out.credit(acc.SysAccount.INVENTORY, cost, memo=a.name)
            into.debit(acc.SysAccount.INVENTORY, cost, memo=a.name)
        total += cost
        db.add(
            BranchTransferLine(
                transfer_id=t.id,
                seq=seq,
                kind="item",
                label=a.name,
                from_item_id=a.id,
                to_item_id=b.id,
                qty=line.qty,
                cost=cost,
            )
        )
        seq += 1
    t.total_cost = money(total)
    if total > 0:
        out.debit(acc.SysAccount.BRANCH, total)
        into.credit(acc.SysAccount.BRANCH, total)
        g_out, g_in = post(db, shop.id, user_id, out), post(db, dst.id, user_id, into)
        t.out_group_id, t.in_group_id = g_out.id, g_in.id
        for ev in events:
            ev.ledger_group_id = g_out.id if ev.shop_id == shop.id else g_in.id
    for sid, other in ((shop.id, dst.name), (dst.id, shop.name)):
        record_audit(
            db,
            shop_id=sid,
            user_id=user_id,
            entity="branch_transfer",
            entity_id=t.id,
            action="create",
            after={
                "no": t.no,
                "with": other,
                "devices": len(data.devices),
                "items": len(data.items),
                "cost": str(t.total_cost),
            },
        )
    db.commit()
    return transfer_out(db, shop.id, t)


def transfer_out(db: Session, shop_id: uuid.UUID, t: BranchTransfer) -> dict:
    sent = t.shop_id == shop_id
    other = db.get(Shop, t.to_shop_id if sent else t.shop_id)
    return {
        "id": t.id,
        "no": t.no,
        "direction": "out" if sent else "in",
        "other_shop": other.name if other else None,
        "at": t.at,
        "note": t.note,
        "total_cost": t.total_cost,
        "lines": [
            {
                "kind": ln.kind,
                "label": ln.label,
                "qty": ln.qty,
                "cost": ln.cost,
                # the row in the shop that is looking
                "device_id": (ln.from_device_id if sent else ln.to_device_id),
                "item_id": (ln.from_item_id if sent else ln.to_item_id),
            }
            for ln in t.lines
        ],
    }


def list_transfers(db: Session, shop_id: uuid.UUID, limit: int = 100) -> list[dict]:
    rows = db.scalars(
        select(BranchTransfer)
        .where(or_(BranchTransfer.shop_id == shop_id, BranchTransfer.to_shop_id == shop_id))
        .order_by(BranchTransfer.at.desc())
        .limit(limit)
    ).all()
    return [transfer_out(db, shop_id, t) for t in rows]


def get(db: Session, shop_id: uuid.UUID, transfer_id: uuid.UUID) -> dict:
    t = db.get(BranchTransfer, transfer_id)
    if t is None or shop_id not in (t.shop_id, t.to_shop_id):
        raise NotFound(code="transfer_not_found")
    return transfer_out(db, shop_id, t)
