import datetime as dt
import html
import uuid
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import today as shop_today
from app.core.errors import Conflict, Forbidden, NotFound, ValidationFailed
from app.core.permissions import Cap
from app.db.base import ZERO, utcnow
from app.db.refs import user_name
from app.modules.accessories import service as acc_stock
from app.modules.audit.service import record_audit
from app.modules.auth import profile
from app.modules.auth.models import Shop
from app.modules.catalogue.models import Brand, Model
from app.modules.devices.models import Device, DeviceAccessoryItem
from app.modules.devices.service import apply_event, get_device
from app.modules.devices.state import DeviceStatus, EventType, VerificationStatus
from app.modules.ledger import accounts as acc
from app.modules.ledger.models import CashAccount
from app.modules.ledger.service import Posting, at_for, money, post, reverse
from app.modules.notifications import service as notify
from app.modules.parties.models import Party
from app.modules.paymode import service as paymode
from app.modules.purchases.service import _allocate_discount, next_number
from app.modules.sales import approval
from app.modules.sales.models import HeldSale, Invoice, InvoiceLine, InvoiceStatus
from app.modules.sales.schemas import HeldSaleIn, SaleCreate
from app.modules.verification.service import NotSellable, assert_sellable
from app.modules.verification.service import override as verification_override


def compute_tax(base: Decimal, rate: Decimal, inclusive: bool) -> tuple[Decimal, Decimal]:
    """Return (tax_amount, total) for a base amount (after discount)."""
    base = money(base)
    rate = Decimal(rate or 0)
    if rate <= 0:
        return ZERO, base
    if inclusive:
        tax = money(base * rate / (Decimal(100) + rate))
        return tax, base
    tax = money(base * rate / Decimal(100))
    return tax, money(base + tax)


def status_for(total: Decimal, paid: Decimal) -> str:
    if paid >= total:
        return InvoiceStatus.PAID
    if paid > ZERO:
        return InvoiceStatus.PARTIALLY_PAID
    return InvoiceStatus.OPEN


def create_sale(
    db: Session, shop_id: uuid.UUID, ctx, data: SaleCreate, loan=None, commit: bool = True
) -> Invoice:
    user_id = ctx.id
    shop = db.get(Shop, shop_id)
    party: Party | None = None
    if data.party_id is not None:
        party = db.get(Party, data.party_id)
        if party is None or party.shop_id != shop_id:
            raise NotFound(code="party_not_found")
        if "customer" not in party.kinds and "shop" not in party.kinds:
            party.kinds = [*party.kinds, "customer"]

    # ---- devices: sellability -------------------------------------------------
    devices: list[Device] = []
    askings: dict = {}  # device id -> asking price at the time of this sale
    revisions: list = []  # (device, old, new, reason, approver)
    below_asking: dict = {}  # device id -> approver
    for dl in data.devices:
        device = get_device(db, shop_id, dl.device_id)
        # owner addendum 6: a unit with a lock still on it (iCloud / FRP / paired) is not sold
        if any(v == "not_cleared" for v in (device.lock_checks or {}).values()):
            raise Conflict(
                code="lock_not_cleared",
                message_en="This device still has a lock on it. Clear it and update the lock check first.",
                message_ur="اس ڈیوائس پر ابھی لاک ہے۔ پہلے لاک ہٹائیں اور لاک چیک اپ ڈیٹ کریں۔",
            )
        if device.status == DeviceStatus.ON_LOAN and not (
            loan is not None
            and loan.device_id == device.id
            and party is not None
            and device.current_party_id == party.id
        ):
            raise Conflict(
                code="device_on_loan",
                message_en="This device is out on loan; settle the loan instead",
                message_ur="یہ موبائل امانت پر ہے؛ پہلے امانت کا حساب کریں",
            )
        if device.status == DeviceStatus.WITH_CUSTOMER_FOR_APPROVAL and (
            party is None or device.current_party_id != party.id
        ):
            raise Conflict(
                code="device_with_other_customer",
                message_en="Device is with another customer for approval",
                message_ur="موبائل کسی اور گاہک کے پاس پسند کے لیے ہے",
            )
        if device.status not in (
            DeviceStatus.IN_STOCK,
            DeviceStatus.WITH_CUSTOMER_FOR_APPROVAL,
            DeviceStatus.ON_LOAN,
        ):
            raise Conflict(
                code="device_not_in_stock",
                message_en=f"Device is {device.status}",
                message_ur="موبائل اسٹاک میں نہیں",
            )
        try:
            assert_sellable(device)
        except NotSellable:
            # owner: the seller may skip a pending ID check and sell (recorded with their name);
            # a phone flagged as stolen still needs the owner/manager
            flagged = device.verification_status == VerificationStatus.FLAGGED
            if data.override_reason and (ctx.can(Cap.VERIFY_OVERRIDE) or not flagged):
                verification_override(db, shop_id, ctx, device.id, data.override_reason)
                db.refresh(device)
            else:
                raise
        # owner: no selling below the buying price, unless the owner/manager confirms the loss
        below_cost = device.cost_price is not None and money(dl.price) < device.cost_price
        if below_cost and not (data.below_cost_ok and ctx.can(Cap.VIEW_COST)):
            raise Conflict(
                code="below_cost",
                message_en="This price is below the buying price. Only the owner or manager can sell at a loss.",
                message_ur="یہ قیمت خرید قیمت سے کم ہے۔ نقصان پر صرف مالک یا منیجر بیچ سکتا ہے۔",
            )
        # owner 2026-10-30: the asking price may be revised here (rule-gated, recorded), and a sale
        # under the asking price needs the owner/manager or the owner's PIN (shop rule)
        asking = money(device.asking_price) if device.asking_price is not None else None
        if dl.new_asking_price is not None and money(dl.new_asking_price) != (
            asking if asking is not None else Decimal(-1)
        ):
            approver = approval.require(db, shop, ctx, "asking_change", data.approval_pin)
            revisions.append(
                (device, asking, money(dl.new_asking_price), dl.asking_reason, approver)
            )
            asking = money(dl.new_asking_price)
        if asking is not None and money(dl.price) < asking:
            below_asking[device.id] = approval.require(
                db, shop, ctx, "below_asking", data.approval_pin
            )
        askings[device.id] = asking
        devices.append(device)

    # ---- items: price floor (owner addendum 5) -------------------------------------
    # under the minimum sale price: the same gate as a phone under its asking price; under the
    # buying price: only the owner / manager who confirms the loss (Addendum 2 rules)
    for ml in data.misc:
        if ml.accessory_id is None:
            continue
        a0 = acc_stock.get_accessory(db, shop_id, ml.accessory_id)
        if a0.min_price is not None and money(ml.unit_price) < money(a0.min_price):
            approval.require(db, shop, ctx, "below_asking", data.approval_pin)
        if (
            a0.avg_cost is not None
            and a0.qty > 0
            and money(ml.unit_price) < money(a0.avg_cost)
            and not (data.below_cost_ok and ctx.can(Cap.VIEW_COST))
        ):
            raise Conflict(
                code="below_cost",
                message_en="This price is below the buying price. Only the owner or manager can sell at a loss.",
                message_ur="یہ قیمت خرید قیمت سے کم ہے۔ نقصان پر صرف مالک یا منیجر بیچ سکتا ہے۔",
            )

    # ---- money ------------------------------------------------------------------
    item_rates = {
        m.accessory_id: acc_stock.get_accessory(db, shop_id, m.accessory_id).tax_rate
        for m in data.misc
        if m.accessory_id
    }
    line_amounts = [money(d.price) for d in data.devices] + [
        money(m.unit_price * m.qty) for m in data.misc
    ]
    subtotal = sum(line_amounts, ZERO)
    discount = money(data.discount)
    if discount > subtotal:
        raise ValidationFailed(
            code="discount_too_big",
            message_en="Discount exceeds total",
            message_ur="رعایت کل رقم سے زیادہ ہے",
        )
    base = money(subtotal - discount)
    if data.tax_rate is not None:
        rate, inclusive = money(data.tax_rate), False
    else:
        rate, inclusive = (shop.tax_rate if shop.tax_enabled else ZERO), shop.tax_inclusive
    # owner 2026-11-03: an item with its own GST % is taxed at that rate when the bill is taxed;
    # phones and items without one take the bill's rate. No own rate anywhere → as before.
    # docs/36: a phone's sales tax is paid at import (Ninth Schedule) — with the shop's setting on, a
    # taxed bill adds none on phone lines
    phone_rate = ZERO if shop.phones_tax_at_import else rate
    line_rates = [phone_rate if d.category == "phone" else rate for d in devices] + [
        money(item_rates[m.accessory_id])
        if rate > ZERO and m.accessory_id and item_rates.get(m.accessory_id) is not None
        else rate
        for m in data.misc
    ]
    shares = _allocate_discount(discount, line_amounts)
    if any(r != rate for r in line_rates):
        tax_shares = [
            compute_tax(money(a - s), r, inclusive)[0]
            for a, s, r in zip(line_amounts, shares, line_rates, strict=True)
        ]
        tax = money(sum(tax_shares, ZERO))
        total = base if inclusive else money(base + tax)
    else:
        tax, total = compute_tax(base, rate, inclusive)
        tax_shares = (
            _allocate_discount(
                tax, [money(a - s) for a, s in zip(line_amounts, shares, strict=True)]
            )
            if tax > ZERO
            else [ZERO] * len(line_amounts)
        )
    paid = money(data.paid)
    tendered = money(data.cash_tendered) if data.cash_tendered is not None else None
    if tendered is not None and tendered < paid:
        raise ValidationFailed(
            code="tendered_below_paid",
            message_en="The cash given is less than the amount paid",
            message_ur="دی گئی نقد رقم ادا شدہ رقم سے کم ہے",
        )
    if paid > total:
        raise ValidationFailed(
            code="paid_exceeds_total",
            message_en="Paid amount exceeds total",
            message_ur="ادا شدہ رقم کل سے زیادہ ہے",
        )
    # owner 2026-11-06: the customer hands over more than the bill and owes the shop from before —
    # the extra goes against the old udhaar instead of back as change
    adjust = money(data.khata_adjust) if data.khata_adjust else ZERO
    if adjust > ZERO:
        from app.modules.ledger.service import party_balance

        if party is None:
            raise ValidationFailed(
                code="adjust_needs_customer",
                message_en="Choose the customer whose udhaar the extra cash goes to",
                message_ur="وہ گاہک چنیں جس کے ادھار میں زائد رقم جائے",
            )
        if tendered is None or paid != total or money(tendered - paid) < adjust:
            raise ValidationFailed(
                code="adjust_exceeds_extra",
                message_en="Only the cash given above a fully paid bill can go to the old udhaar",
                message_ur="صرف پورے ادا شدہ بل سے زائد دی گئی رقم پرانے ادھار میں جا سکتی ہے",
            )
        if adjust > party_balance(db, shop_id, party.id):
            raise ValidationFailed(
                code="adjust_exceeds_due",
                message_en="That is more than the customer owes from before",
                message_ur="یہ گاہک کے پرانے بقایا سے زیادہ ہے",
            )
    if party is None and paid != total:
        raise ValidationFailed(
            code="credit_needs_customer",
            message_en="Select a customer to sell on credit",
            message_ur="ادھار پر فروخت کے لیے گاہک منتخب کریں",
        )
    cash: CashAccount | None = None
    if paid > ZERO:
        # cash, online, cheque or remittance each land in their own money account
        cash = paymode.account_for(db, shop_id, data.payment, data.cash_account_id)

    invoice = Invoice(
        shop_id=shop_id,
        no=next_number(db, shop, shop.invoice_prefix or "INV", "next_invoice_no"),
        party_id=party.id if party else None,
        date=data.date or shop_today(),
        due_date=data.due_date,
        subtotal=subtotal,
        discount=discount,
        tax_rate=money(rate),
        tax_inclusive=inclusive,
        tax_amount=tax,
        total=total,
        paid=paid,
        cash_account_id=cash.id if cash else None,
        status=status_for(total, paid),
        cash_tendered=tendered,
        khata_adjusted=adjust if adjust > ZERO else None,
        notes=data.notes,
        created_by=user_id,
        loan_id=loan.id if loan is not None else None,
    )
    db.add(invoice)
    db.flush()
    paymode.save(db, shop_id, "sale", invoice.id, data.payment, paid)

    posting = Posting(
        document_type="invoice",
        document_id=invoice.id,
        memo=f"{invoice.no} {party.name if party else 'Cash sale'}",
    )
    posting.at = posting.at or at_for(invoice.date)
    cost_total = ZERO
    line_no = 0

    for dl, device, share, tshare, lrate in zip(
        data.devices,
        devices,
        shares[: len(devices)],
        tax_shares[: len(devices)],
        line_rates[: len(devices)],
        strict=True,
    ):
        net = money(dl.price - share)
        line_total = net if inclusive or tax == ZERO else money(net + tshare)
        cost = money(device.cost_price or ZERO)
        cost_total += cost
        db.add(
            InvoiceLine(
                invoice_id=invoice.id,
                line_no=line_no,
                kind="device",
                device_id=device.id,
                qty=1,
                unit_price=money(dl.price),
                discount_share=share,
                tax_share=tshare,
                tax_rate=lrate if rate > ZERO else None,
                line_total=line_total,
                cost=cost,
                asking_price=askings.get(device.id),
                warranty_days=dl.warranty_days,
                accessories_given=dl.accessories_given,
                accessories_pending=[p.model_dump(mode="json") for p in dl.accessories_pending],
            )
        )
        line_no += 1
        _apply_accessories(
            db, device, dl.accessories_given, [p.model_dump() for p in dl.accessories_pending]
        )
        if cost > ZERO:
            posting.debit(acc.SysAccount.COGS, cost, device_id=device.id, memo=device.imei1).credit(
                acc.SysAccount.INVENTORY, cost, device_id=device.id
            )
        if dl.warranty_days:
            device.warranty_months = 0
            device.warranty_start = invoice.date

    for ml, share, tshare, lrate in zip(
        data.misc,
        shares[len(devices) :],
        tax_shares[len(devices) :],
        line_rates[len(devices) :],
        strict=True,
    ):
        net = money(ml.unit_price * ml.qty - share)
        line_total = net if inclusive or tax == ZERO else money(net + tshare)
        accessory = (
            acc_stock.get_accessory(db, shop_id, ml.accessory_id) if ml.accessory_id else None
        )
        wdays = (
            ml.warranty_days
            if ml.warranty_days is not None
            else (accessory.warranty_days if accessory else 0)
        )
        if accessory is not None:
            mv = acc_stock.move(
                db,
                shop_id,
                user_id,
                accessory,
                -ml.qty,
                "sale",
                document_type="invoice",
                document_id=invoice.id,
                note=invoice.no,
                party_id=party.id if party else None,
            )
            cost = getattr(mv, "cost_total", None) or money(mv.unit_cost * ml.qty)  # avg, or FIFO
        else:
            cost = money(ml.cost)
        cost_total += cost
        db.add(
            InvoiceLine(
                invoice_id=invoice.id,
                line_no=line_no,
                kind="misc",
                accessory_id=accessory.id if accessory else None,
                description=ml.description or (accessory.name if accessory else None),
                qty=ml.qty,
                unit_price=money(ml.unit_price),
                discount_share=share,
                tax_share=tshare,
                tax_rate=lrate if rate > ZERO else None,
                line_total=line_total,
                cost=cost,
                warranty_days=wdays or 0,
                warranty_until=(invoice.date + dt.timedelta(days=wdays)) if wdays else None,
            )
        )
        line_no += 1
        if cost > ZERO:
            # an item from stock leaves the stock; a typed "other item" was never in it, so its
            # cost comes out of the owner's goods (like opening stock) — the stock never goes below 0
            posting.debit(acc.SysAccount.COGS, cost, memo=ml.description).credit(
                acc.SysAccount.INVENTORY if accessory is not None else acc.SysAccount.EQUITY, cost
            )
    invoice.cost_total = cost_total

    receivable_account = acc.party_account(party.id) if party else None
    net_sales = money(total - tax)
    if total > ZERO:
        if party:
            posting.debit(receivable_account, total)
        else:
            posting.debit(acc.cash_account(cash.id), total, memo=f"Cash sale {invoice.no}")
        if net_sales > ZERO:
            posting.credit(acc.SysAccount.SALES, net_sales)
        if tax > ZERO:
            posting.credit(acc.SysAccount.TAX_PAYABLE, tax)
    if party and paid > ZERO:
        posting.debit(acc.cash_account(cash.id), paid, memo=f"Received {invoice.no}").credit(
            receivable_account, paid
        )
    group = post(db, shop_id, user_id, posting) if posting.lines else None
    invoice.ledger_group_id = group.id if group else None

    for device, old, new, reason, approver in revisions:
        apply_event(
            db,
            shop_id,
            user_id,
            device,
            EventType.PRICE_CHANGED,
            at=posting.at,
            amount=new,
            document_type="invoice",
            document_id=invoice.id,
            data={
                "from": str(old) if old is not None else None,
                "to": str(new),
                "reason": reason,
                "source": "checkout",
                "invoice_no": invoice.no,
                "approved_by": str(approver) if approver else None,
            },
        )
    for dl, device in zip(data.devices, devices, strict=True):
        apply_event(
            db,
            shop_id,
            user_id,
            device,
            EventType.SOLD,
            at=posting.at,
            party_id=party.id if party else None,
            amount=money(dl.price),
            ledger_group_id=invoice.ledger_group_id,
            document_type="invoice",
            document_id=invoice.id,
            data={
                "invoice_no": invoice.no,
                "paid_now": str(paid),
                "warranty_days": dl.warranty_days,
                "asking_price": str(askings[device.id])
                if askings.get(device.id) is not None
                else None,
                "below_asking": device.id in below_asking,
                "approved_by": str(below_asking[device.id])
                if below_asking.get(device.id)
                else None,
            },
        )
    labels = []
    for device in devices:
        b, m = db.get(Brand, device.brand_id), db.get(Model, device.model_id)
        labels.append(f"{b.name if b else ''} {m.name if m else ''}".strip())
    labels += [ml.description for ml in data.misc]
    pending = ", ".join(p.kind for dl in data.devices for p in dl.accessories_pending)
    notify.on_sale(db, shop, invoice, party, ", ".join(labels), pending, user_id)
    if data.installments is not None:
        from app.modules.installments.service import create_plan

        create_plan(db, shop_id, user_id, invoice, data.installments)
    record_audit(
        db,
        shop_id=shop_id,
        user_id=user_id,
        entity="invoice",
        entity_id=invoice.id,
        action="create",
        after={
            "no": invoice.no,
            "total": str(total),
            "paid": str(paid),
            "devices": len(devices),
            "below_asking": len(below_asking),
            "asking_revised": len(revisions),
        },
    )
    # docs/36 §4 (ADR-050): a shop with FBR Digital Invoicing on queues the bill with the sale
    from app.modules.fbr.service import enqueue as fbr_enqueue

    fbr_enqueue(db, shop, invoice.id)
    if adjust > ZERO:
        # a payment received from the customer, allocated to their oldest open bills — the same as
        # taking it on the khata screen, in the same transaction as the sale
        from app.modules.payments.models import PaymentDirection
        from app.modules.payments.schemas import PaymentCreate
        from app.modules.payments.service import create_payment

        create_payment(
            db,
            shop_id,
            user_id,
            PaymentCreate(
                party_id=party.id,
                direction=PaymentDirection.IN,
                amount=adjust,
                cash_account_id=data.cash_account_id,
                payment=data.payment,
                date=invoice.date,
                notes=f"From the cash given on {invoice.no}",
            ),
            commit=False,
        )
    if commit:
        db.commit()
    else:
        db.flush()
    return invoice


def _apply_accessories(db: Session, device: Device, given: list[str], pending: list[dict]) -> None:
    existing = {a.kind: a for a in device.accessories if a.kind != "other"}
    for kind in given:
        item = existing.get(kind)
        if item is None:
            item = DeviceAccessoryItem(device_id=device.id, kind=kind, came_with=False)
            db.add(item)
        item.given_at_sale = True
    for p in pending:
        item = existing.get(p["kind"]) if p["kind"] != "other" else None
        if item is None:
            item = DeviceAccessoryItem(
                device_id=device.id, kind=p["kind"], label=p.get("label"), came_with=False
            )
            db.add(item)
        item.given_at_sale = False
        item.pending_from = "shop"
        item.promised_to_customer_at = p.get("promised_at")
    db.flush()


def get_invoice(db: Session, shop_id: uuid.UUID, invoice_id: uuid.UUID) -> Invoice:
    inv = db.get(Invoice, invoice_id)
    if inv is None or inv.shop_id != shop_id:
        raise NotFound(code="invoice_not_found")
    return inv


def list_invoices(
    db: Session, shop_id: uuid.UUID, *, party_id, date_from, date_to, status, limit
) -> list[Invoice]:
    stmt = select(Invoice).where(Invoice.shop_id == shop_id)
    if party_id:
        stmt = stmt.where(Invoice.party_id == party_id)
    if date_from:
        stmt = stmt.where(Invoice.date >= date_from)
    if date_to:
        stmt = stmt.where(Invoice.date <= date_to)
    if status:
        stmt = stmt.where(Invoice.status == status)
    return list(db.scalars(stmt.order_by(Invoice.created_at.desc()).limit(limit)).all())


def _unit_bits(ln: dict, ur: bool) -> str:
    """owner addendum 6: the bill names the unit's type, storage / RAM, colour, condition and PTA"""
    if not ln.get("device_id"):
        return ""
    kind = {
        "phone": ("Mobile", "موبائل"),
        "tablet": ("Tablet", "ٹیبلٹ"),
        "watch": ("Smart watch", "سمارٹ واچ"),
    }.get(ln.get("category") or "phone", ("", ""))[1 if ur else 0]
    cond = {
        "box_pack": ("Box pack", "باکس پیک"),
        "open_box": ("Open box", "کھلا باکس"),
        "used": ("Used", "استعمال شدہ"),
        "patched": ("Patched", "پیچ شدہ"),
    }.get(ln.get("condition") or "", ("", ""))[1 if ur else 0]
    if ln.get("grade"):
        cond = f"{cond} {str(ln['grade']).upper() if len(str(ln['grade'])) == 1 else ln['grade']}".strip()
    pta = {
        "pta_approved": ("PTA approved", "PTA منظور"),
        "non_pta": ("Non-PTA", "نان PTA"),
        "jv": ("JV", "JV"),
    }.get(ln.get("pta_status") or "", ("", ""))[1 if ur else 0]
    mem = " + ".join(
        x
        for x in (ln.get("storage_name"), f"{ln['ram_gb']}GB RAM" if ln.get("ram_gb") else None)
        if x
    )
    bits = [b for b in (kind, mem, ln.get("colour_name"), cond, pta) if b]
    return f"<br><small>{html.escape(' · '.join(bits))}</small>" if bits else ""


def to_out(db: Session, inv: Invoice, show_cost: bool) -> dict:
    party = db.get(Party, inv.party_id) if inv.party_id else None
    lines = []
    for ln in inv.lines:
        label = imei = None
        dev_info: dict = {}
        if ln.device_id:
            d = db.get(Device, ln.device_id)
            if d:
                imei = d.imei1
                b, m = db.get(Brand, d.brand_id), db.get(Model, d.model_id)
                label = f"{b.name if b else ''} {m.name if m else ''}".strip()
                # owner addendum 6: the bill names the type, storage / RAM, colour, PTA, condition
                from app.modules.catalogue.models import Colour, Storage

                st = db.get(Storage, d.storage_id) if d.storage_id else None
                co = db.get(Colour, d.colour_id) if d.colour_id else None
                dev_info = {
                    "category": d.category,
                    "storage_name": st.name if st else None,
                    "ram_gb": d.ram_gb,
                    "colour_name": co.name if co else None,
                    "pta_status": d.pta_status if (d.category == "phone" or d.cellular) else None,
                    "condition": d.condition,
                    "grade": d.grade,
                    "serial": d.serial,
                }
        row = {
            **{c.name: getattr(ln, c.name) for c in InvoiceLine.__table__.columns},
            "imei1": imei,
            "device_label": label,
            **dev_info,
        }
        row["profit"] = money(ln.line_total - ln.tax_share - ln.cost) if show_cost else None
        if not show_cost:
            row["cost"] = None
        lines.append(row)
    active = inv.status not in (InvoiceStatus.VOID, InvoiceStatus.RETURNED)
    return {
        **{c.name: getattr(inv, c.name) for c in Invoice.__table__.columns},
        "party_name": party.name if party else None,
        "party_balance_after": party.balance if party else None,
        "created_by_name": user_name(db, inv.created_by),
        "balance_due": money(max(ZERO, inv.total - inv.returned_total - inv.paid))
        if active
        else ZERO,
        "cost_total": inv.cost_total if show_cost else None,
        "profit": money(inv.total - inv.tax_amount - inv.cost_total) if show_cost else None,
        "lines": lines,
        "payment": paymode.detail_for(db, inv.shop_id, "sale", inv.id),
    }


def void_invoice(
    db: Session, shop_id: uuid.UUID, ctx, invoice_id: uuid.UUID, reason: str
) -> Invoice:
    if not ctx.can(Cap.VOID):
        raise Forbidden()
    inv = get_invoice(db, shop_id, invoice_id)
    if inv.status in (InvoiceStatus.VOID, InvoiceStatus.RETURNED):
        raise Conflict(code="already_voided")
    for ln in inv.lines:
        if ln.device_id:
            d = db.get(Device, ln.device_id)
            sold = [e for e in d.events if e.document_id == inv.id and e.type == EventType.SOLD]
            if (
                not sold
                or d.status != DeviceStatus.SOLD
                or any(e.seq > sold[0].seq for e in d.events)
            ):
                raise Conflict(
                    code="device_changed",
                    message_en=f"Device {d.imei1} has moved since this sale; use a return instead",
                    message_ur=f"موبائل {d.imei1} اس فروخت کے بعد تبدیل ہو چکا ہے؛ واپسی استعمال کریں",
                )
    if inv.ledger_group_id:
        reverse(db, shop_id, ctx.id, inv.ledger_group_id, f"Void {inv.no}: {reason}")
    for ln in inv.lines:
        if ln.device_id:
            d = db.get(Device, ln.device_id)
            apply_event(
                db,
                shop_id,
                ctx.id,
                d,
                EventType.SALE_RETURNED,
                party_id=inv.party_id,
                amount=ln.line_total,
                document_type="invoice_void",
                document_id=inv.id,
                data={"void": True, "reason": reason},
            )
            for a in d.accessories:
                if a.given_at_sale:
                    a.given_at_sale = None
                if a.pending_from == "shop":
                    a.pending_from = "none"
                    a.promised_to_customer_at = None
    for ln in inv.lines:
        if ln.accessory_id:
            a = acc_stock.get_accessory(db, shop_id, ln.accessory_id)
            acc_stock.move(
                db,
                shop_id,
                ctx.id,
                a,
                ln.qty,
                "void",
                money(ln.cost / ln.qty) if ln.qty else None,
                document_type="invoice_void",
                document_id=inv.id,
                note=inv.no,
            )
    inv.status = InvoiceStatus.VOID
    inv.voided_by = ctx.id
    inv.void_reason = reason
    inv.updated_at = utcnow()
    record_audit(
        db,
        shop_id=shop_id,
        user_id=ctx.id,
        entity="invoice",
        entity_id=inv.id,
        action="void",
        after={"reason": reason},
    )
    db.commit()
    return inv


# ---- receipt ----------------------------------------------------------------------------


def receipt_html(
    db: Session, shop_id: uuid.UUID, invoice_id: uuid.UUID, fmt: str, lang: str | None = None
) -> str:
    inv = get_invoice(db, shop_id, invoice_id)
    shop = db.get(Shop, shop_id)
    lang = lang if lang in ("en", "ur") else (shop.default_locale or "ur")
    ur = lang == "ur"
    T = {
        "item": "چیز" if ur else "Item",
        "qty": "تعداد" if ur else "Qty",
        "price": "قیمت" if ur else "Price",
        "total": "کل" if ur else "Total",
        "subtotal": "میزان" if ur else "Subtotal",
        "discount": "رعایت" if ur else "Discount",
        "tax": "ٹیکس" if ur else "Tax",
        "incl": "(شامل)" if ur else "(incl.)",
        "grand": "کل رقم" if ur else "Total",
        "paid": "وصول" if ur else "Paid",
        "due": "اس بل کا بقایا" if ur else "Due on this bill",
        "balance": "کھاتے کا بقایا" if ur else "Account balance",
        "pending": "باقی اشیاء" if ur else "Pending items",
        "cash": "واک اِن گاہک" if ur else "Walk-in customer",
        "thanks": shop.receipt_footer_ur or "خریداری کا شکریہ"
        if ur
        else shop.receipt_footer or "Thank you for your business",
        "warranty": "وارنٹی" if ur else "Warranty",
        "days": "دن" if ur else "days",
        "tbd": "تاریخ بعد میں" if ur else "date TBD",
        "inst": "قسطیں" if ur else "Installments",
        "advance": "ایڈوانس" if ur else "Advance",
        "monthly": "ماہانہ" if ur else "monthly",
        "firstDue": "پہلی قسط" if ur else "First installment",
        "guarantor": "ضامن" if ur else "Guarantor",
        "cashier": "کیشیئر" if ur else "Cashier",
        "excl": "کل (ٹیکس کے بغیر)" if ur else "Total excl. tax",
        "taxTotal": "کل ٹیکس" if ur else "Total tax",
        "onAmount": "پر" if ur else "on",
        "phones": "موبائل فون — سیلز ٹیکس درآمد پر ادا (نواں شیڈول)"
        if ur
        else "Mobile phones — sales tax paid at import (Ninth Schedule)",
        "noTax": "بغیر ٹیکس" if ur else "No tax",
        "given": "گاہک نے دیے" if ur else "Cash given",
        "change": "واپس" if ur else "Change",
        "toKhata": "پرانے ادھار میں جمع" if ur else "Taken against old udhaar",
    }
    out = to_out(db, inv, show_cost=False)
    e = html.escape
    thermal = fmt == "thermal"
    width = "72mm" if thermal else "190mm"
    rows = "".join(
        f"<tr><td>{e(ln['device_label'] or ln['description'] or '')}{_unit_bits(ln, ur)}<br><small>{e(ln['imei1'] or '')}"
        f"{' · ' + e(', '.join(ln['accessories_given'])) if ln['accessories_given'] else ''}"
        f"{(' · ' + T['warranty'] + ' ' + str(ln['warranty_days']) + ' ' + T['days']) if ln['warranty_days'] else ''}</small></td>"
        f"<td class='n'>{ln['qty']}</td><td class='n'>{ln['unit_price']:,.0f}</td><td class='n'>{ln['line_total']:,.0f}</td></tr>"
        for ln in out["lines"]
    )
    pending = [p for ln in out["lines"] for p in ln["accessories_pending"]]
    pending_html = (
        f"<p><b>{T['pending']}:</b> "
        + e(", ".join(f"{p['kind']} ({p.get('promised_at') or T['tbd']})" for p in pending))
        + "</p>"
        if pending
        else ""
    )
    party_html = (
        f"<div>{e(out['party_name'])}</div>" if out["party_name"] else f"<div>{T['cash']}</div>"
    )
    from app.modules.installments.service import plan_for_invoice

    plan = plan_for_invoice(db, inv.id)
    plan_html = ""
    if plan is not None:
        g = (
            f" · {T['guarantor']}: {e(plan.guarantor_name)}{' ' + e(plan.guarantor_phone) if plan.guarantor_phone else ''}"
            if plan.guarantor_name
            else ""
        )
        plan_html = (
            f"<tr><td colspan='4'><b>{T['inst']}:</b> {T['advance']} {plan.advance:,.0f} · "
            f"{plan.months} × {plan.monthly:,.0f} {T['monthly']} · {T['firstDue']} "
            f"{plan.first_due.strftime('%d-%m-%Y')}{g}</td></tr>"
        )
    balance = out["party_balance_after"]
    balance_html = (
        f"<tr class='tot'><td colspan='3'>{T['balance']}</td><td class='n'>{balance:,.0f}</td></tr>"
        if balance is not None and balance != 0
        else ""
    )
    # one rate for the bill → "Tax 18%"; items with their own GST % → "Tax (by item)"
    one_rate = (
        compute_tax(money(inv.subtotal - inv.discount), inv.tax_rate, inv.tax_inclusive)[0]
        == inv.tax_amount
    )
    rate_txt = f"{inv.tax_rate:.0f}%" if one_rate else ("(آئٹم وار)" if ur else "(by item)")
    tax_html = (
        f"<tr><td colspan='3'>{T['tax']} {rate_txt} {T['incl'] if inv.tax_inclusive else ''}</td><td class='n'>{inv.tax_amount:,.0f}</td></tr>"
        if inv.tax_amount
        else ""
    )
    # docs/36: a taxed bill shows the tax by rate (as an FBR invoice does), the total without tax,
    # and why phone lines carry none
    rated = [ln for ln in inv.lines if ln.tax_rate is not None]
    if rated and inv.tax_rate > ZERO:
        by_rate: dict = {}
        for ln in rated:
            net = money(ln.line_total - ln.tax_share)  # the line without its tax, inclusive or not
            b = by_rate.setdefault(money(ln.tax_rate), [ZERO, ZERO, False])
            b[0] += net
            b[1] += ln.tax_share
            b[2] = b[2] or ln.kind == "device"
        excl = money(sum((v[0] for v in by_rate.values()), ZERO))
        parts = [f"<tr><td colspan='3'>{T['excl']}</td><td class='n'>{excl:,.0f}</td></tr>"]
        for r, (base_amt, t_amt, has_phone) in sorted(by_rate.items(), reverse=True):
            if r > ZERO:
                parts.append(
                    f"<tr><td colspan='3'>{T['tax']} {r:.0f}% {T['onAmount']} {base_amt:,.0f}</td><td class='n'>{t_amt:,.0f}</td></tr>"
                )
            else:
                label = T["phones"] if has_phone and shop.phones_tax_at_import else T["noTax"]
                parts.append(
                    f"<tr><td colspan='3'><small>{label} · {base_amt:,.0f}</small></td><td class='n'>0</td></tr>"
                )
        parts.append(
            f"<tr><td colspan='3'>{T['taxTotal']} {T['incl'] if inv.tax_inclusive else ''}</td><td class='n'>{inv.tax_amount:,.0f}</td></tr>"
        )
        tax_html = "".join(parts)
    # how it was paid: "Online · Meezan Bank · TID 123", "Remittance · 500 SAR × 74.20 · Ahmed"
    pay = out.get("payment")
    paid_by_html = ""
    if pay is not None:
        how = {
            "online": ("آن لائن", "Online"),
            "cheque": ("چیک", "Cheque"),
            "remittance": ("بیرونِ ملک سے رقم", "Remittance"),
        }.get(pay.method, (pay.method, pay.method))[0 if ur else 1]
        bits = [how, pay.bank]
        if pay.method == "remittance":
            bits = [
                how,
                f"{pay.foreign_amount:,.2f} {pay.currency} × {pay.rate:,.2f}",
                pay.service,
                pay.sender_name,
            ]
        if pay.reference:
            bits.append(("نمبر " if ur else "Ref ") + pay.reference)
        if pay.cheque_date:
            bits.append(str(pay.cheque_date))
        text = " · ".join(e(str(x)) for x in bits if x)
        paid_by_html = f'<tr><td colspan="4">{text}</td></tr>'
    disc_html = (
        f"<tr><td colspan='3'>{T['discount']}</td><td class='n'>-{inv.discount:,.0f}</td></tr>"
        if inv.discount
        else ""
    )
    from app.core.clock import shop_tz
    from app.core.words import amount_in_words
    from app.modules.auth.models import User

    made = inv.created_at if inv.created_at.tzinfo else inv.created_at.replace(tzinfo=dt.UTC)
    when = f"{inv.date.strftime('%d-%m-%Y')} {made.astimezone(shop_tz()).strftime('%I:%M %p')}"
    cashier = db.get(User, inv.created_by) if inv.created_by else None
    cashier_html = (
        f"<tr><td colspan='2'><small>{T['cashier']}: {e(cashier.name)}</small></td></tr>"
        if cashier
        else ""
    )
    kept = inv.khata_adjusted or ZERO
    change_html = (
        f"<tr><td colspan='3'>{T['given']}</td><td class='n'>{inv.cash_tendered:,.0f}</td></tr>"
        + (
            f"<tr><td colspan='3'>{T['toKhata']}</td><td class='n'>{kept:,.0f}</td></tr>"
            if kept
            else ""
        )
        + f"<tr><td colspan='3'>{T['change']}</td><td class='n'>{money(inv.cash_tendered - inv.paid - kept):,.0f}</td></tr>"
        if inv.cash_tendered is not None
        else ""
    )
    words_html = (
        f"<div class='c'><small>{e(amount_in_words(inv.total, 'ur' if ur else 'en'))}</small></div>"
    )
    # docs/36 §4 (ADR-050): the FBR Digital Invoicing number and its QR code (1 × 1 inch), or a note
    # that the bill is still waiting to reach FBR
    from app.modules.barcodes.codes import svg as code_svg
    from app.modules.fbr.service import for_invoice as fbr_for

    fbr_sub = fbr_for(db, inv.id)
    fbr_html = ""
    if inv.fbr_invoice_no:
        fbr_html = (
            f"<div class='c fbr'><b>FBR Digital Invoicing System</b><br>"
            f"<div class='qr'>{code_svg('qr', inv.fbr_invoice_no)}</div>"
            f"<small>{'ایف بی آر انوائس نمبر' if ur else 'FBR invoice no.'}</small><br><b dir='ltr'>{e(inv.fbr_invoice_no)}</b></div>"
        )
    elif fbr_sub is not None:
        fbr_html = f"<div class='c'><small>{'ایف بی آر: بھیجنا باقی ہے' if ur else 'FBR: waiting to be sent'}</small></div>"
    # owner 2026-11-07: the bill's own QR — scanned, it opens the bill online (bill_link.py); an
    # install without a public address prints the bill number, which the shop's scanner finds
    bill_qr_html = ""
    if profile.print_prefs(shop)["qr"]:
        from app.modules.sales import bill_link

        link = bill_link.url(inv.id)
        hint = (
            ("بل آن لائن دیکھنے کے لیے اسکین کریں" if ur else "Scan to see this bill online")
            if link
            else ("بل نمبر" if ur else "Bill no.")
        )
        bill_qr_html = (
            f"<div class='c bq'><div class='qr'>{code_svg('qr', link or inv.no)}</div>"
            f"<small>{hint}</small></div>"
        )
    font_link = (
        '<link href="https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@400;700&display=swap" rel="stylesheet">'
        if ur
        else ""
    )
    body_font = "'Noto Nastaliq Urdu', serif" if ur else "Arial, sans-serif"
    return f"""<!doctype html><html lang="{lang}" dir="{"rtl" if ur else "ltr"}"><head><meta charset="utf-8"><title>{e(inv.no)}</title>
{font_link}
<style>
@page {{ size: {"80mm auto" if thermal else "A4"}; margin: {"4mm" if thermal else "14mm"}; }}
body {{ width: {width}; margin: 0 auto; font-family: {body_font}; font-size: {"11px" if thermal else "13px"}; color: #111; {"line-height: 1.9;" if ur else ""} }}
h1 {{ font-size: {"15px" if thermal else "20px"}; margin: 0; text-align: center; }}
.c {{ text-align: center; }} .n {{ text-align: {"left" if ur else "right"}; white-space: nowrap; direction: ltr; }}
table {{ width: 100%; border-collapse: collapse; margin-top: 6px; }} td, th {{ padding: 3px 2px; vertical-align: top; }}
th {{ border-bottom: 1px solid #111; text-align: {"right" if ur else "left"}; font-size: 10px; }}
tr.tot td {{ border-top: 1px solid #111; font-weight: bold; }}
small {{ color: #555; direction: ltr; unicode-bidi: isolate; }} .fbr {{ margin-top: 8px; }} .qr {{ width: 1in; height: 1in; margin: 4px auto; }} .bq {{ margin-top: 8px; }} .bq .qr {{ width: 0.9in; height: 0.9in; }} .foot {{ margin-top: 10px; border-top: 1px dashed #999; padding-top: 6px; }}
</style></head><body>
{profile.header_html(shop, ur, thermal)}
<table><tr><td><b>{e(inv.no)}</b></td><td class="n">{when}</td></tr><tr><td colspan="2">{party_html}</td></tr>{cashier_html}</table>
<table><thead><tr><th>{T["item"]}</th><th class="n">{T["qty"]}</th><th class="n">{T["price"]}</th><th class="n">{T["total"]}</th></tr></thead>
<tbody>{rows}
<tr><td colspan="3">{T["subtotal"]}</td><td class="n">{inv.subtotal:,.0f}</td></tr>{disc_html}{tax_html}
<tr class="tot"><td colspan="3">{T["grand"]}</td><td class="n">{e(profile.money(shop, inv.total))}</td></tr>
<tr><td colspan="3">{T["paid"]}</td><td class="n">{inv.paid:,.0f}</td></tr>{paid_by_html}{change_html}
<tr><td colspan="3">{T["due"]}</td><td class="n">{out["balance_due"]:,.0f}</td></tr>{plan_html}{balance_html}
</tbody></table>
{words_html}
{fbr_html}
{pending_html}
{profile.footer_html(shop, ur)}
{bill_qr_html}
<div class="foot c">{e(T["thanks"])}</div>
</body></html>"""


# --- held sales (POS hold): a cart parked to finish later; nothing is sold until it is completed


def hold_sale(db: Session, shop_id: uuid.UUID, user_id: uuid.UUID, data: HeldSaleIn) -> HeldSale:
    if not data.cart:
        raise ValidationFailed("empty_cart", "Nothing to hold", "رکھنے کے لیے کچھ نہیں")
    row = HeldSale(
        shop_id=shop_id,
        label=(data.label or "").strip() or None,
        total=money(data.total),
        items=data.items,
        cart=data.cart,
        created_by=user_id,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def list_held(db: Session, shop_id: uuid.UUID) -> list[HeldSale]:
    return list(
        db.scalars(
            select(HeldSale).where(HeldSale.shop_id == shop_id).order_by(HeldSale.created_at.desc())
        )
    )


def drop_held(db: Session, shop_id: uuid.UUID, held_id: uuid.UUID) -> None:
    row = db.scalar(select(HeldSale).where(HeldSale.id == held_id, HeldSale.shop_id == shop_id))
    if row is None:
        raise NotFound()
    db.delete(row)
    db.commit()


def held_out(db: Session, row: HeldSale) -> dict:
    return {
        "id": row.id,
        "label": row.label,
        "total": row.total,
        "items": row.items,
        "cart": row.cart,
        "created_at": row.created_at,
        "created_by_name": user_name(db, row.created_by),
    }
