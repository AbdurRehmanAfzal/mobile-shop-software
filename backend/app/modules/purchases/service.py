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
from app.modules.accessories import stock as inv
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

    # owner addendum 5: a line typed in dozens / boxes becomes pieces here; its unit cost is per
    # piece from this point on (the typed per-unit cost is kept on the line as the audit trail)
    pieces: list[tuple[int, int, Decimal]] = []  # (pieces, per unit, cost per piece)
    for m in data.misc:
        a0 = acc_stock.get_accessory(db, shop_id, m.accessory_id) if m.accessory_id else None
        n, per = inv.to_pieces(shop, a0, m.unit, m.qty)
        pieces.append((n, per, money(m.unit_cost / per)))
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
    extra = money(data.extra_costs)
    total = money(subtotal - discount + extra)
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
        supplier_invoice_no=(data.supplier_invoice_no or None),
        extra_costs=extra,
        extra_costs_note=data.extra_costs_note,
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
    # freight / loading is spread over the lines the same way and lands in the item cost
    extras = _allocate_discount(extra, line_amounts) if extra > ZERO else [ZERO] * len(line_amounts)
    posting = Posting(
        document_type="purchase",
        document_id=purchase.id,
        memo=f"{purchase.no} {party.name}",
        at=at,
    )
    posting.at = posting.at or at_for(purchase.date)
    line_no = 0
    devices: list[tuple[Device, Decimal]] = []

    for dl, share, xshare in zip(
        data.devices, shares[: len(data.devices)], extras[: len(data.devices)], strict=True
    ):
        device = _device_for_purchase(db, shop_id, dl)
        if device.event_count and _aware(device.last_event_at) > at:
            raise Conflict(
                code="purchase_before_history",
                message_en=f"{device.imei1}: this time is before the phone's last record. Choose a later time.",
                message_ur=f"{device.imei1}: یہ وقت اس موبائل کے پچھلے ریکارڈ سے پہلے کا ہے۔ بعد کا وقت چنیں۔",
            )
        net = money(dl.cost - share + xshare)
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

    for ml, share, xshare, (n_pieces, per, _cpp) in zip(
        data.misc, shares[len(data.devices) :], extras[len(data.devices) :], pieces, strict=True
    ):
        net = money(ml.unit_cost * ml.qty - share + xshare)
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
                qty=n_pieces,
                unit_cost=money(net / n_pieces),  # per piece, after discount and freight
                discount_share=share,
                net_cost=net,
                pack_unit=ml.unit if per != 1 else None,
                pack_qty=ml.qty if per != 1 else None,
                extra_cost_share=xshare,
                batch_ref=ml.batch_ref,
            )
        )
        line_no += 1
        if accessory is not None:
            old_cost = accessory.avg_cost
            acc_stock.move(
                db,
                shop_id,
                user_id,
                accessory,
                n_pieces,
                "purchase",
                money(net / n_pieces),
                document_type="purchase",
                document_id=purchase.id,
                note=purchase.no,
                party_id=party.id,
                pack_unit=ml.unit if per != 1 else None,
                pack_qty=ml.qty if per != 1 else None,
                batch_ref=ml.batch_ref,
            )
            inv.log_price_change(
                db,
                shop_id,
                user_id,
                accessory,
                "avg_cost",
                old_cost,
                accessory.avg_cost,
                source="purchase",
            )
            if accessory.pricing_mode == "markup" and accessory.markup_pct is not None:
                new_price = inv.price_from_markup(accessory.avg_cost, accessory.markup_pct)
                inv.log_price_change(
                    db,
                    shop_id,
                    user_id,
                    accessory,
                    "price",
                    accessory.price,
                    new_price,
                    source="markup",
                )
                accessory.price = new_price
            if net > ZERO:
                posting.debit(acc.SysAccount.INVENTORY, net, memo=accessory.name)
        elif net > ZERO:
            posting.debit(acc.OTHER_PURCHASES, net, memo=ml.description)

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
                "barcode": device.barcode,
            },
        )

    labels = []
    for device, _net in devices:
        b, m = db.get(Brand, device.brand_id), db.get(Model, device.model_id)
        labels.append(f"{b.name if b else ''} {m.name if m else ''}".strip())
    labels += [f"{ml.description} x{n} " for ml, (n, _p, _c) in zip(data.misc, pieces, strict=True)]
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
    if existing.status not in (
        DeviceStatus.SOLD,
        DeviceStatus.RETURNED_TO_SUPPLIER,
        DeviceStatus.TRANSFERRED,
    ):
        raise Conflict(
            code="imei_in_stock",
            message_en=f"IMEI {existing.imei1} is already in your shop (status: {existing.status})",
            message_ur=f"IMEI {existing.imei1} پہلے سے دکان میں موجود ہے",
        )
    # buying it back: refresh identity fields, keep history — and keep its barcode (owner addendum 4:
    # the same physical unit keeps the same code; only a maker's code may be added now)
    for k, v in dl.device.model_dump(
        exclude={"imei1", "barcode", "barcode_type", "manufacturer_code"}
    ).items():
        setattr(existing, k, v)
    if dl.device.manufacturer_code or not existing.barcode:
        from app.modules.auth.models import Shop
        from app.modules.barcodes.service import assign_device

        assign_device(
            db,
            db.get(Shop, shop_id),
            existing,
            value=dl.device.barcode if not existing.barcode else None,
            kind=dl.device.barcode_type,
            manufacturer_code=dl.device.manufacturer_code,
        )
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


def change_party(
    db: Session,
    shop_id: uuid.UUID,
    ctx,
    purchase_id: uuid.UUID,
    party_id: uuid.UUID,
    reason: str,
) -> Purchase:
    """Owner 2026-11-09 (ADR-056): the wrong dealer / customer was picked when the stock was added.
    Nothing is erased: one correction group, dated like the purchase, moves the bill and what was
    paid with it from the old person's khata to the new one's; each phone's history says who it was
    and who it is now. Refused once money was paid against this bill later or a phone went back to
    the dealer (those were made with the old person: undo them first)."""
    from app.modules.payments.models import Payment

    if not ctx.can(Cap.VOID):
        raise Forbidden()
    p = get_purchase(db, shop_id, purchase_id)
    if p.status == PurchaseStatus.VOIDED:
        raise Conflict(
            code="already_voided",
            message_en="This purchase is cancelled",
            message_ur="یہ خریداری منسوخ ہو چکی ہے",
        )
    new = db.get(Party, party_id)
    if new is None or new.shop_id != shop_id or not new.is_active:
        raise NotFound(code="party_not_found")
    if new.id == p.party_id:
        raise ValidationFailed(
            code="same_party",
            message_en="This is already the person on the purchase",
            message_ur="خریداری پر پہلے ہی یہی شخص ہے",
        )
    later = [
        x
        for x in db.scalars(
            select(Payment).where(
                Payment.shop_id == shop_id,
                Payment.party_id == p.party_id,
                Payment.status != "voided",
            )
        ).all()
        if any(str(a.get("document_id")) == str(p.id) for a in (x.allocations or []))
    ]
    if later or p.returned_total > ZERO:
        raise Conflict(
            code="purchase_has_later_money",
            message_en="Money was paid against this purchase later, or something went back to the seller. Undo that first, then change the person.",
            message_ur="اس خریداری کے بعد اس کی ادائیگی ہو چکی ہے یا کچھ واپس ہو چکا ہے۔ پہلے وہ ختم کریں، پھر شخص بدلیں۔",
        )
    old_id = p.party_id
    old = db.get(Party, old_id)
    total, paid = money(p.total), money(p.paid)
    posting = Posting(
        document_type="purchase_party_change",
        document_id=p.id,
        memo=f"{p.no}: {old.name if old else ''} -> {new.name} ({reason})",
        at=p.purchased_at or at_for(p.date),
    )
    if total > ZERO:
        posting.debit(acc.party_account(old_id), total).credit(acc.party_account(new.id), total)
    if paid > ZERO:
        posting.debit(acc.party_account(new.id), paid).credit(acc.party_account(old_id), paid)
    if posting.lines:
        post(db, shop_id, ctx.id, posting)
    p.party_id = new.id
    p.updated_at = utcnow()
    for ln in p.lines:
        if ln.device_id:
            d = db.get(Device, ln.device_id)
            apply_event(
                db,
                shop_id,
                ctx.id,
                d,
                EventType.CORRECTED,
                document_type="purchase",
                document_id=p.id,
                data={
                    "field": "seller",
                    "from": old.name if old else None,
                    "to": new.name,
                    "reason": reason,
                    "purchase_no": p.no,
                },
            )
    record_audit(
        db,
        shop_id=shop_id,
        user_id=ctx.id,
        entity="purchase",
        entity_id=p.id,
        action="party_changed",
        before={"party_id": str(old_id)},
        after={"party_id": str(new.id), "reason": reason},
    )
    db.commit()
    return p


def paid_split(db: Session, p: Purchase) -> tuple[Decimal, Decimal, Decimal]:
    """(paid later against this bill, paid at the purchase, the most that can be paid at it)"""
    from app.modules.payments.models import Payment

    later = ZERO
    for x in db.scalars(
        select(Payment).where(
            Payment.shop_id == p.shop_id,
            Payment.party_id == p.party_id,
            Payment.status != "voided",
        )
    ).all():
        for a in x.allocations or []:
            if str(a.get("document_id")) == str(p.id):
                later += money(Decimal(str(a.get("amount") or 0)))
    old = max(ZERO, money(p.paid - later))
    return later, old, money(p.total - p.returned_total - later)


def change_paid(
    db: Session,
    shop_id: uuid.UUID,
    ctx,
    purchase_id: uuid.UUID,
    paid_now: Decimal,
    payment,
    due_date,
    reason: str,
) -> Purchase:
    """Owner 2026-11-13 (ADR-067): what was paid AT the purchase was entered wrong — e.g. "paid in
    full in cash" for a bill that came on udhaar. Nothing is erased and the phones are not touched
    (they may be sold already): one correction group moves the difference between the money
    account and the seller's khata — less paid puts the cash back and the seller is owed it; more
    paid takes it out of the chosen account. Dated like the purchase, or today when that day's cash
    is already closed. Payments made against the bill later stay as they are."""
    from app.modules.exchanges.models import Exchange

    if not ctx.can(Cap.VOID):
        raise Forbidden()
    p = get_purchase(db, shop_id, purchase_id)
    if p.status == PurchaseStatus.VOIDED:
        raise Conflict(
            code="already_voided",
            message_en="This purchase is cancelled",
            message_ur="یہ خریداری منسوخ ہو چکی ہے",
        )
    if db.scalar(select(Exchange.id).where(Exchange.purchase_id == p.id)):
        raise Conflict(
            code="purchase_from_exchange",
            message_en="This purchase came from an exchange; its money is set by the exchange",
            message_ur="یہ خریداری تبادلے سے آئی ہے؛ اس کی رقم تبادلہ طے کرتا ہے",
        )
    _later, old, room = paid_split(db, p)
    new = money(paid_now)
    if new < ZERO or new > room:
        raise ValidationFailed(
            code="paid_out_of_range",
            message_en=f"Paid at the purchase can be 0 to {room}",
            message_ur=f"خریداری کے وقت دی گئی رقم 0 سے {room} تک ہو سکتی ہے",
        )
    diff = new - old
    if diff == ZERO:
        raise ValidationFailed(
            code="same_paid",
            message_en="This is already what was paid",
            message_ur="یہی پہلے سے دی گئی رقم ہے",
        )
    if diff < ZERO:
        if p.cash_account_id is None:
            raise Conflict(code="no_cash_account")
        cash = db.get(CashAccount, p.cash_account_id)
    else:
        cash = paymode.account_for(db, shop_id, payment, None)
    closed = db.scalar(
        select(DayClose.id).where(
            DayClose.shop_id == shop_id,
            DayClose.cash_account_id == cash.id,
            DayClose.date == p.date,
        )
    )
    party = db.get(Party, p.party_id)
    posting = Posting(
        document_type="purchase_paid_change",
        document_id=p.id,
        memo=f"{p.no}: paid at purchase {old} -> {new} ({reason})",
        at=utcnow() if closed else (p.purchased_at or at_for(p.date)),
    )
    if diff < ZERO:
        # it never left: back into the money account, and the seller is owed it
        posting.debit(acc.cash_account(cash.id), -diff, memo=f"Not paid {p.no}").credit(
            acc.party_account(p.party_id), -diff
        )
    else:
        posting.debit(acc.party_account(p.party_id), diff).credit(
            acc.cash_account(cash.id), diff, memo=f"Paid {p.no}"
        )
    post(db, shop_id, ctx.id, posting)
    p.paid = money(p.paid + diff)
    if p.cash_account_id is None:
        p.cash_account_id = cash.id
    if due_date is not None:
        p.due_date = due_date
    p.updated_at = utcnow()
    # the bill's "how it was paid" follows
    detail = paymode.detail_for(db, shop_id, "purchase", p.id)
    if new == ZERO and detail is not None:
        db.delete(detail)
    elif diff < ZERO and detail is not None:
        detail.amount = new
    elif diff > ZERO and payment is not None and payment.method != "cash":
        if detail is not None and detail.method == payment.method:
            detail.amount = money(detail.amount + diff)
        elif detail is None:
            paymode.save(db, shop_id, "purchase", p.id, payment, diff)
    for ln in p.lines:
        if ln.device_id:
            d = db.get(Device, ln.device_id)
            apply_event(
                db,
                shop_id,
                ctx.id,
                d,
                EventType.CORRECTED,
                document_type="purchase",
                document_id=p.id,
                data={
                    "field": "paid",
                    "from": str(old),
                    "to": str(new),
                    "reason": reason,
                    "purchase_no": p.no,
                    "party": party.name if party else None,
                },
            )
    record_audit(
        db,
        shop_id=shop_id,
        user_id=ctx.id,
        entity="purchase",
        entity_id=p.id,
        action="paid_changed",
        before={"paid_at_purchase": str(old)},
        after={"paid_at_purchase": str(new), "reason": reason, "dated_today": bool(closed)},
    )
    db.commit()
    return p


# the shop still holds the unit (nothing was sold at the old cost)
_HELD = (
    DeviceStatus.IN_STOCK,
    DeviceStatus.FAULTY,
    DeviceStatus.IN_REPAIR,
    DeviceStatus.WITH_CUSTOMER_FOR_APPROVAL,
    DeviceStatus.ON_LOAN,
)


def change_cost(
    db: Session,
    shop_id: uuid.UUID,
    ctx,
    device_id: uuid.UUID,
    cost: Decimal,
    reason: str,
) -> Purchase:
    """Owner 2026-11-10 (ADR-063): the wrong purchase price was typed when the phone was added.
    Nothing is erased: one correction group, dated like the purchase, moves the difference
    between stock value and the seller's khata; the bill's total, the line and the phone's cost
    follow, and the phone's history says from what to what. Only while the shop still holds the
    phone from this purchase (a sale at the old cost has already taken it into profit)."""
    if not ctx.can(Cap.VOID):
        raise Forbidden()
    d = db.get(Device, device_id)
    if d is None or d.shop_id != shop_id:
        raise NotFound(code="device_not_found")
    came = [e for e in d.events if e.type in (EventType.PURCHASED, EventType.TRANSFERRED_IN)]
    last = max(came, key=lambda e: e.seq) if came else None
    if last is None or last.type != EventType.PURCHASED or last.document_type != "purchase":
        raise Conflict(
            code="no_purchase",
            message_en="This phone did not come from a purchase bill",
            message_ur="یہ موبائل خریداری کے بل سے نہیں آیا",
        )
    if d.status not in _HELD or any(
        e.seq > last.seq and e.type == EventType.SOLD for e in d.events
    ):
        raise Conflict(
            code="cost_after_sale",
            message_en="This phone was sold or has left the shop; its purchase price can no longer be changed",
            message_ur="یہ موبائل بک چکا ہے یا دکان سے جا چکا ہے؛ اب اس کی قیمتِ خرید نہیں بدل سکتی",
        )
    p = get_purchase(db, shop_id, last.document_id)
    if p.status == PurchaseStatus.VOIDED:
        raise Conflict(code="already_voided")
    ln = next((x for x in p.lines if x.device_id == d.id and x.returned_at is None), None)
    if ln is None:
        raise Conflict(code="no_purchase")
    old, new = money(ln.net_cost), money(cost)
    diff = new - old
    if diff == ZERO:
        raise ValidationFailed(
            code="same_cost",
            message_en="This is already the purchase price",
            message_ur="یہی پہلے سے قیمتِ خرید ہے",
        )
    party = db.get(Party, p.party_id)
    posting = Posting(
        document_type="purchase_cost_change",
        document_id=p.id,
        memo=f"{p.no} {d.imei1}: {old} -> {new} ({reason})",
        at=p.purchased_at or at_for(p.date),
    )
    if diff > ZERO:
        posting.debit(acc.SysAccount.INVENTORY, diff, device_id=d.id, memo=d.imei1).credit(
            acc.party_account(p.party_id), diff
        )
    else:
        posting.debit(acc.party_account(p.party_id), -diff).credit(
            acc.SysAccount.INVENTORY, -diff, device_id=d.id, memo=d.imei1
        )
    post(db, shop_id, ctx.id, posting)
    ln.unit_cost = money(ln.unit_cost + diff)
    ln.net_cost = new
    p.subtotal = money(p.subtotal + diff)
    p.total = money(p.total + diff)
    p.updated_at = utcnow()
    apply_event(
        db,
        shop_id,
        ctx.id,
        d,
        EventType.CORRECTED,
        amount=new,
        party_id=p.party_id,
        document_type="purchase",
        document_id=p.id,
        data={
            "field": "cost",
            "from": str(old),
            "to": str(new),
            "reason": reason,
            "purchase_no": p.no,
            "party": party.name if party else None,
        },
    )
    d.cost_price = money((d.cost_price or ZERO) + diff)
    record_audit(
        db,
        shop_id=shop_id,
        user_id=ctx.id,
        entity="purchase",
        entity_id=p.id,
        action="cost_changed",
        before={"device_id": str(d.id), "cost": str(old)},
        after={"cost": str(new), "reason": reason},
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
