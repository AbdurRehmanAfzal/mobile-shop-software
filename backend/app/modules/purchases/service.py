import uuid
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import Conflict, Forbidden, NotFound, ValidationFailed
from app.core.permissions import Cap
from app.db.base import ZERO, utcnow
from app.db.refs import user_name
from app.modules.accessories import service as acc_stock
from app.modules.audit.service import record_audit
from app.modules.auth.models import Shop
from app.modules.catalogue.models import Brand, Model
from app.modules.devices.models import Device
from app.modules.devices.service import apply_event, by_imei, new_device, replace_accessories
from app.modules.devices.state import DeviceCondition, DeviceStatus, EventType, VerificationStatus
from app.modules.expenses.models import DayClose
from app.modules.ledger import accounts as acc
from app.modules.ledger.models import CashAccount
from app.modules.ledger.service import Posting, at_for, money, post, reverse
from app.modules.notifications import service as notify
from app.modules.parties.models import Party
from app.modules.paymode import service as paymode
from app.modules.purchases.models import Purchase, PurchaseKind, PurchaseLine, PurchaseStatus
from app.modules.purchases.schemas import PurchaseCreate


def next_number(db: Session, shop: Shop, prefix: str, counter: str) -> str:
    n = getattr(shop, counter)
    setattr(shop, counter, n + 1)
    db.flush()
    return f"{prefix}-{n:06d}"


def _allocate_discount(discount: Decimal, amounts: list[Decimal]) -> list[Decimal]:
    """Spread a document discount across lines proportionally; remainder goes to the last line."""
    total = sum(amounts, ZERO)
    if discount <= ZERO or total <= ZERO:
        return [ZERO for _ in amounts]
    shares = [money(discount * a / total) for a in amounts]
    diff = money(discount - sum(shares, ZERO))
    if shares:
        shares[-1] = money(shares[-1] + diff)
    return shares


def create_purchase(
    db: Session, shop_id: uuid.UUID, user_id: uuid.UUID, data: PurchaseCreate, commit: bool = True
) -> Purchase:
    shop = db.get(Shop, shop_id)
    party = db.get(Party, data.party_id)
    if party is None or party.shop_id != shop_id:
        raise NotFound(code="party_not_found")
    if data.kind == PurchaseKind.SUPPLIER and "supplier" not in party.kinds:
        party.kinds = [*party.kinds, "supplier"]
    if data.kind == PurchaseKind.SHOP and "shop" not in party.kinds:
        raise ValidationFailed(
            code="party_not_shop",
            message_en="Select a shop party",
            message_ur="دکان کا کھاتہ منتخب کریں",
        )

    line_amounts = [money(d.cost) for d in data.devices] + [
        money(m.unit_cost * m.qty) for m in data.misc
    ]
    subtotal = sum(line_amounts, ZERO)
    discount = money(data.discount)
    if discount > subtotal:
        raise ValidationFailed(
            code="discount_too_big",
            message_en="Discount exceeds total",
            message_ur="رعایت کل رقم سے زیادہ ہے",
        )
    total = money(subtotal - discount)
    paid = money(data.paid)
    if paid > total:
        raise ValidationFailed(
            code="paid_exceeds_total",
            message_en="Paid amount exceeds total",
            message_ur="ادا شدہ رقم کل سے زیادہ ہے",
        )
    cash: CashAccount | None = None
    if paid > ZERO:
        # cash, online or cheque each go out of their own money account
        cash = paymode.account_for(db, shop_id, data.payment, data.cash_account_id)

    at = _purchase_time(data.purchased_at)
    if data.purchased_at is None and data.date and (back := at_for(data.date)):
        at = back  # a backdated bill without a time of day: that day, noon
    day = data.date or at.astimezone(ZoneInfo(shop.timezone or "Asia/Karachi")).date()
    if paid > ZERO and db.scalar(
        select(DayClose.id).where(
            DayClose.shop_id == shop_id, DayClose.cash_account_id == cash.id, DayClose.date == day
        )
    ):
        raise Conflict(
            code="day_closed",
            message_en="Cash for that day is already closed. Choose a later time or pay nothing now.",
            message_ur="اس دن کا کیش بند ہو چکا ہے۔ بعد کا وقت چنیں یا ابھی ادائیگی نہ کریں۔",
        )

    purchase = Purchase(
        shop_id=shop_id,
        no=next_number(db, shop, "PUR", "next_purchase_no"),
        kind=data.kind,
        party_id=party.id,
        date=day,
        due_date=data.due_date,
        purchased_at=at,
        subtotal=subtotal,
        discount=discount,
        total=total,
        paid=paid,
        cash_account_id=cash.id if cash else None,
        reference=data.reference,
        notes=data.notes,
        created_by=user_id,
    )
    db.add(purchase)
    db.flush()
    paymode.save(db, shop_id, "purchase", purchase.id, data.payment, paid)

    shares = _allocate_discount(discount, line_amounts)
    posting = Posting(
        document_type="purchase",
        document_id=purchase.id,
        memo=f"{purchase.no} {party.name}",
        at=at,
    )
    posting.at = posting.at or at_for(purchase.date)
    line_no = 0
    devices: list[tuple[Device, Decimal]] = []

    for dl, share in zip(data.devices, shares[: len(data.devices)], strict=True):
        device = _device_for_purchase(db, shop_id, dl)
        if device.event_count and _aware(device.last_event_at) > at:
            raise Conflict(
                code="purchase_before_history",
                message_en=f"{device.imei1}: this time is before the phone's last record. Choose a later time.",
                message_ur=f"{device.imei1}: یہ وقت اس موبائل کے پچھلے ریکارڈ سے پہلے کا ہے۔ بعد کا وقت چنیں۔",
            )
        net = money(dl.cost - share)
        db.add(
            PurchaseLine(
                purchase_id=purchase.id,
                line_no=line_no,
                kind="device",
                device_id=device.id,
                qty=1,
                unit_cost=money(dl.cost),
                discount_share=share,
                net_cost=net,
            )
        )
        line_no += 1
        if dl.asking_price is not None:
            device.asking_price = money(dl.asking_price)
        replace_accessories(db, device, dl.accessories)
        if net > ZERO:
            posting.debit(acc.SysAccount.INVENTORY, net, device_id=device.id, memo=device.imei1)
        devices.append((device, net))

    for ml, share in zip(data.misc, shares[len(data.devices) :], strict=True):
        net = money(ml.unit_cost * ml.qty - share)
        accessory = (
            acc_stock.get_accessory(db, shop_id, ml.accessory_id) if ml.accessory_id else None
        )
        db.add(
            PurchaseLine(
                purchase_id=purchase.id,
                line_no=line_no,
                kind="misc",
                accessory_id=accessory.id if accessory else None,
                description=ml.description or (accessory.name if accessory else None),
                qty=ml.qty,
                unit_cost=money(ml.unit_cost),
                discount_share=share,
                net_cost=net,
            )
        )
        line_no += 1
        if accessory is not None:
            acc_stock.move(
                db,
                shop_id,
                user_id,
                accessory,
                ml.qty,
                "purchase",
                money(net / ml.qty),
                document_type="purchase",
                document_id=purchase.id,
                note=purchase.no,
            )
            if net > ZERO:
                posting.debit(acc.SysAccount.INVENTORY, net, memo=accessory.name)
        elif net > ZERO:
            posting.debit(acc.SysAccount.PURCHASES, net, memo=ml.description)

    if total > ZERO:
        posting.credit(acc.party_account(party.id), total)
    if paid > ZERO:
        posting.debit(acc.party_account(party.id), paid).credit(
            acc.cash_account(cash.id), paid, memo=f"Paid {purchase.no}"
        )
    group = post(db, shop_id, user_id, posting) if posting.lines else None
    purchase.ledger_group_id = group.id if group else None

    for device, net in devices:
        used = device.condition != DeviceCondition.BOX_PACK
        vstatus = (
            VerificationStatus.PENDING
            if (used or data.kind != PurchaseKind.SUPPLIER)
            else VerificationStatus.NOT_REQUIRED
        )
        apply_event(
            db,
            shop_id,
            user_id,
            device,
            EventType.PURCHASED,
            at=at,
            party_id=party.id,
            amount=net,
            ledger_group_id=purchase.ledger_group_id,
            document_type="purchase",
            document_id=purchase.id,
            data={
                "source": data.kind,
                "verification_status": vstatus,
                "purchase_no": purchase.no,
                "asking": str(device.asking_price) if device.asking_price is not None else None,
            },
        )

    labels = []
    for device, _net in devices:
        b, m = db.get(Brand, device.brand_id), db.get(Model, device.model_id)
        labels.append(f"{b.name if b else ''} {m.name if m else ''}".strip())
    labels += [f"{ml.description} x{ml.qty}" for ml in data.misc]
    notify.on_purchase(db, shop, purchase, party, ", ".join(labels), len(labels), user_id)
    record_audit(
        db,
        shop_id=shop_id,
        user_id=user_id,
        entity="purchase",
        entity_id=purchase.id,
        action="create",
        after={"no": purchase.no, "total": str(total), "paid": str(paid), "devices": len(devices)},
    )
    if commit:
        db.commit()
    else:
        db.flush()
    return purchase


def _device_for_purchase(db: Session, shop_id: uuid.UUID, dl) -> Device:
    existing = by_imei(db, shop_id, dl.device.imei1)
    if existing is None:
        return new_device(db, shop_id, dl.device)
    if existing.status not in (DeviceStatus.SOLD, DeviceStatus.RETURNED_TO_SUPPLIER):
        raise Conflict(
            code="imei_in_stock",
            message_en=f"IMEI {existing.imei1} is already in your shop (status: {existing.status})",
            message_ur=f"IMEI {existing.imei1} پہلے سے دکان میں موجود ہے",
        )
    # buying it back: refresh identity fields, keep history
    for k, v in dl.device.model_dump(exclude={"imei1"}).items():
        setattr(existing, k, v)
    db.flush()
    return existing


def get_purchase(db: Session, shop_id: uuid.UUID, purchase_id: uuid.UUID) -> Purchase:
    p = db.get(Purchase, purchase_id)
    if p is None or p.shop_id != shop_id:
        raise NotFound(code="purchase_not_found")
    return p


def list_purchases(
    db: Session,
    shop_id: uuid.UUID,
    *,
    party_id: uuid.UUID | None,
    date_from: date | None,
    date_to: date | None,
    limit: int,
) -> list[Purchase]:
    stmt = select(Purchase).where(Purchase.shop_id == shop_id)
    if party_id:
        stmt = stmt.where(Purchase.party_id == party_id)
    if date_from:
        stmt = stmt.where(Purchase.date >= date_from)
    if date_to:
        stmt = stmt.where(Purchase.date <= date_to)
    return list(db.scalars(stmt.order_by(Purchase.created_at.desc()).limit(limit)).all())


def to_out(db: Session, p: Purchase) -> dict:
    party = db.get(Party, p.party_id)
    lines = []
    for ln in p.lines:
        label = None
        imei = None
        if ln.device_id:
            d = db.get(Device, ln.device_id)
            if d:
                imei = d.imei1
                b, m = db.get(Brand, d.brand_id), db.get(Model, d.model_id)
                label = f"{b.name if b else ''} {m.name if m else ''}".strip()
        lines.append(
            {
                **{c.name: getattr(ln, c.name) for c in PurchaseLine.__table__.columns},
                "imei1": imei,
                "device_label": label,
            }
        )
    return {
        "created_by_name": user_name(db, p.created_by),
        **{c.name: getattr(p, c.name) for c in Purchase.__table__.columns},
        "party_name": party.name if party else None,
        "balance_due": money(max(ZERO, p.total - p.returned_total - p.paid))
        if p.status == PurchaseStatus.POSTED
        else ZERO,
        "lines": lines,
        "payment": paymode.detail_for(db, p.shop_id, "purchase", p.id),
    }


def void_purchase(
    db: Session, shop_id: uuid.UUID, ctx, purchase_id: uuid.UUID, reason: str
) -> Purchase:
    if not ctx.can(Cap.VOID):
        raise Forbidden()
    p = get_purchase(db, shop_id, purchase_id)
    if p.status == PurchaseStatus.VOIDED:
        raise Conflict(code="already_voided")
    # every device must still be exactly as purchased (only verification events allowed since)
    for ln in p.lines:
        if ln.device_id:
            d = db.get(Device, ln.device_id)
            later = [e for e in d.events if e.document_id == p.id]
            if not later:
                raise Conflict(code="device_changed")
            purchase_seq = later[0].seq
            after = [e for e in d.events if e.seq > purchase_seq and e.type != EventType.VERIFIED]
            if after or d.status not in (DeviceStatus.IN_STOCK,):
                raise Conflict(
                    code="device_changed",
                    message_en=f"Device {d.imei1} has moved since this purchase; use a return instead",
                    message_ur=f"موبائل {d.imei1} اس خریداری کے بعد تبدیل ہو چکا ہے؛ واپسی استعمال کریں",
                )
    if p.ledger_group_id:
        reverse(db, shop_id, ctx.id, p.ledger_group_id, f"Void {p.no}: {reason}")
    for ln in p.lines:
        if ln.device_id:
            d = db.get(Device, ln.device_id)
            apply_event(
                db,
                shop_id,
                ctx.id,
                d,
                EventType.RETURNED_TO_SUPPLIER,
                party_id=p.party_id,
                amount=ln.net_cost,
                document_type="purchase_void",
                document_id=p.id,
                data={"void": True, "reason": reason},
            )
    for ln in p.lines:
        if ln.accessory_id:
            a = acc_stock.get_accessory(db, shop_id, ln.accessory_id)
            acc_stock.move(
                db,
                shop_id,
                ctx.id,
                a,
                -ln.qty,
                "void",
                document_type="purchase_void",
                document_id=p.id,
                note=p.no,
            )
    p.status = PurchaseStatus.VOIDED
    p.voided_by = ctx.id
    p.void_reason = reason
    p.updated_at = utcnow()
    record_audit(
        db,
        shop_id=shop_id,
        user_id=ctx.id,
        entity="purchase",
        entity_id=p.id,
        action="void",
        after={"reason": reason},
    )
    db.commit()
    return p


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def _purchase_time(value: datetime | None) -> datetime:
    """Default now; a naive time is Pakistan time; never in the future (5 min clock slack)."""
    now = utcnow()
    if value is None:
        return now
    if value.tzinfo is None:
        value = value.replace(tzinfo=ZoneInfo("Asia/Karachi"))
    value = value.astimezone(UTC)
    if value > now + timedelta(minutes=5):
        raise ValidationFailed(
            code="purchase_in_future",
            message_en="Purchase time cannot be in the future",
            message_ur="خریداری کا وقت آنے والا نہیں ہو سکتا",
        )
    return value
