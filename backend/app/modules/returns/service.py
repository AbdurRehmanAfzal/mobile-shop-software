import uuid
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import today as shop_today
from app.core.errors import Conflict, NotFound, ValidationFailed
from app.db.base import ZERO, utcnow
from app.modules.accessories import service as acc_stock
from app.modules.audit.service import record_audit
from app.modules.auth.models import Shop
from app.modules.devices.models import Device
from app.modules.devices.service import apply_event
from app.modules.devices.state import DeviceStatus, EventType
from app.modules.ledger import accounts as acc
from app.modules.ledger.models import CashAccount
from app.modules.ledger.service import Posting, at_for, default_cash_account, money, post
from app.modules.parties.models import Party
from app.modules.purchases.models import Purchase, PurchaseLine, PurchaseStatus
from app.modules.purchases.service import next_number
from app.modules.returns.models import ReturnDoc, ReturnKind, Settlement
from app.modules.returns.schemas import PurchaseReturnIn, SaleReturnIn
from app.modules.sales.models import Invoice, InvoiceLine, InvoiceStatus
from app.modules.sales.service import status_for


def _cash(db: Session, shop_id: uuid.UUID, cash_account_id: uuid.UUID | None) -> CashAccount:
    cash = (
        db.get(CashAccount, cash_account_id)
        if cash_account_id
        else default_cash_account(db, shop_id)
    )
    if cash is None or cash.shop_id != shop_id:
        raise NotFound(code="cash_account_not_found")
    return cash


def sale_return(
    db: Session, shop_id: uuid.UUID, user_id: uuid.UUID, data: SaleReturnIn
) -> ReturnDoc:
    shop = db.get(Shop, shop_id)
    inv = db.get(Invoice, data.invoice_id)
    if inv is None or inv.shop_id != shop_id:
        raise NotFound(code="invoice_not_found")
    if inv.status in (InvoiceStatus.VOID, InvoiceStatus.RETURNED):
        raise Conflict(
            code="invoice_closed",
            message_en="Invoice is void or fully returned",
            message_ur="یہ بل منسوخ یا مکمل واپس ہو چکا ہے",
        )
    walk_in = inv.party_id is None
    if walk_in and data.party_id is None:
        raise ValidationFailed(
            code="return_needs_customer",
            message_en="Write the name and phone of the person returning it",
            message_ur="واپس کرنے والے کا نام اور نمبر لکھیں",
        )
    party = db.get(Party, inv.party_id or data.party_id)
    if party is None or party.shop_id != shop_id:
        raise NotFound(code="party_not_found")
    lines = [ln for ln in inv.lines if ln.id in set(data.line_ids)]
    if len(lines) != len(set(data.line_ids)):
        raise NotFound(code="invoice_line_not_found")
    for ln in lines:
        if ln.returned_at is not None:
            raise Conflict(code="line_already_returned")

    # value coming back and the state before return
    amount = sum((ln.line_total for ln in lines), ZERO)
    already_returned = inv.returned_total
    outstanding_before = money(
        inv.total - already_returned - inv.paid
    )  # >0 customer still owes on this bill
    excess_paid = money(
        max(ZERO, amount - max(ZERO, outstanding_before))
    )  # money the customer had paid for what is now returned

    settlement = data.settlement
    refund = (
        money(data.refund_amount)
        if data.refund_amount is not None
        else (excess_paid if settlement == Settlement.REFUND else ZERO)
    )
    kept = (
        money(data.kept_amount)
        if data.kept_amount is not None
        else (excess_paid if settlement == Settlement.INCOME else ZERO)
    )
    # refund may go together with a cut the shop keeps (e.g. 100,000 back: 90,000 handed, 10,000 kept)
    if settlement == Settlement.CREDIT and (refund > ZERO or kept > ZERO):
        raise ValidationFailed(code="settlement_mismatch")
    if refund + kept > excess_paid:
        raise ValidationFailed(
            code="exceeds_excess",
            message_en=f"Customer only has {excess_paid} to refund or keep",
            message_ur=f"گاہک کی صرف {excess_paid} رقم واپسی/رکھنے کے لیے ہے",
        )
    if walk_in and refund + kept != excess_paid:
        # a walk-in has no khata to hold the rest, so the whole amount is settled now
        raise ValidationFailed(
            code="walk_in_settle_all",
            message_en=f"Hand back and cut must add up to {excess_paid}",
            message_ur=f"واپس دی گئی اور کاٹی گئی رقم مل کر {excess_paid} ہونی چاہیے",
        )
    cash = _cash(db, shop_id, data.cash_account_id) if refund > ZERO else None

    doc = ReturnDoc(
        shop_id=shop_id,
        no=next_number(db, shop, "RET", "next_return_no"),
        kind=ReturnKind.SALE,
        document_id=inv.id,
        document_no=inv.no,
        party_id=party.id,
        date=data.date or shop_today(),
        amount=amount,
        settlement=settlement,
        refund_amount=refund,
        kept_amount=kept,
        cash_account_id=cash.id if cash else None,
        reason=data.reason,
        lines=[
            {
                "invoice_line_id": str(ln.id),
                "device_id": str(ln.device_id) if ln.device_id else None,
                "description": ln.description,
                "line_total": str(ln.line_total),
            }
            for ln in lines
        ],
        created_by=user_id,
    )
    db.add(doc)
    db.flush()

    posting = Posting(
        document_type="sale_return", document_id=doc.id, memo=f"{doc.no} return of {inv.no}"
    )
    posting.at = at_for(doc.date)
    P = acc.party_account(party.id)
    for ln in lines:
        net_sales = money(ln.line_total - ln.tax_share)
        if net_sales > ZERO:
            posting.debit(
                acc.SysAccount.SALES, net_sales, memo=ln.description or (ln.device_id and "device")
            )
        if ln.tax_share > ZERO:
            posting.debit(acc.SysAccount.TAX_PAYABLE, ln.tax_share)
        if ln.cost > ZERO:
            posting.debit(acc.SysAccount.INVENTORY, ln.cost, device_id=ln.device_id).credit(
                acc.SysAccount.COGS, ln.cost, device_id=ln.device_id
            )
        ln.returned_at = utcnow()
    if amount > ZERO:
        posting.credit(P, amount)
    if refund > ZERO:
        posting.debit(P, refund).credit(acc.cash_account(cash.id), refund, memo=f"Refund {doc.no}")
    if kept > ZERO:
        posting.debit(P, kept).credit(
            acc.SysAccount.OTHER_INCOME, kept, memo=f"Kept on return {doc.no}"
        )
    group = post(db, shop_id, user_id, posting)
    doc.ledger_group_id = group.id

    for ln in lines:
        if ln.accessory_id:
            a = acc_stock.get_accessory(db, shop_id, ln.accessory_id)
            acc_stock.move(
                db,
                shop_id,
                user_id,
                a,
                ln.qty,
                "return",
                money(ln.cost / ln.qty) if ln.qty else None,
                document_type="sale_return",
                document_id=doc.id,
                note=doc.no,
            )
        if ln.device_id:
            device = db.get(Device, ln.device_id)
            if device.status != DeviceStatus.SOLD or device.current_party_id != inv.party_id:
                raise Conflict(
                    code="device_changed",
                    message_en=f"Device {device.imei1} is no longer with this customer",
                    message_ur=f"موبائل {device.imei1} اب اس گاہک کے پاس نہیں",
                )
            apply_event(
                db,
                shop_id,
                user_id,
                device,
                EventType.SALE_RETURNED,
                party_id=party.id,
                amount=ln.line_total,
                ledger_group_id=group.id,
                document_type="sale_return",
                document_id=doc.id,
                data={
                    "return_no": doc.no,
                    "settlement": settlement,
                    "refund": str(refund),
                    "kept": str(kept),
                    "reason": data.reason,
                },
            )
            for a in device.accessories:
                if a.given_at_sale:
                    a.given_at_sale = None
                if a.pending_from == "shop":
                    a.pending_from = "none"
                    a.promised_to_customer_at = None

    inv.returned_total = money(already_returned + amount)
    if all(ln.returned_at is not None for ln in inv.lines):
        inv.status = InvoiceStatus.RETURNED
    else:
        inv.status = status_for(money(inv.total - inv.returned_total), inv.paid)
    record_audit(
        db,
        shop_id=shop_id,
        user_id=user_id,
        entity="invoice",
        entity_id=inv.id,
        action="return",
        after={
            "return_no": doc.no,
            "amount": str(amount),
            "settlement": settlement,
            "refund": str(refund),
            "kept": str(kept),
        },
    )
    db.commit()
    return doc


def purchase_return(
    db: Session, shop_id: uuid.UUID, user_id: uuid.UUID, data: PurchaseReturnIn
) -> ReturnDoc:
    shop = db.get(Shop, shop_id)
    pur = db.get(Purchase, data.purchase_id)
    if pur is None or pur.shop_id != shop_id:
        raise NotFound(code="purchase_not_found")
    if pur.status != PurchaseStatus.POSTED:
        raise Conflict(code="purchase_closed")
    party = db.get(Party, pur.party_id)
    lines = [ln for ln in pur.lines if ln.id in set(data.line_ids)]
    if len(lines) != len(set(data.line_ids)):
        raise NotFound(code="purchase_line_not_found")
    for ln in lines:
        if ln.returned_at is not None:
            raise Conflict(code="line_already_returned")
        if ln.device_id:
            device = db.get(Device, ln.device_id)
            if device.status not in (DeviceStatus.IN_STOCK, DeviceStatus.FAULTY):
                raise Conflict(
                    code="device_changed",
                    message_en=f"Device {device.imei1} is {device.status}",
                    message_ur=f"موبائل {device.imei1} اسٹاک میں نہیں",
                )
    amount = sum((ln.net_cost for ln in lines), ZERO)
    refund = money(data.refund_amount)
    if refund > amount:
        raise ValidationFailed(code="refund_exceeds_return")
    cash = _cash(db, shop_id, data.cash_account_id) if refund > ZERO else None

    doc = ReturnDoc(
        shop_id=shop_id,
        no=next_number(db, shop, "RET", "next_return_no"),
        kind=ReturnKind.PURCHASE,
        document_id=pur.id,
        document_no=pur.no,
        party_id=party.id,
        date=data.date or shop_today(),
        amount=amount,
        settlement=Settlement.REFUND if refund > ZERO else Settlement.CREDIT,
        refund_amount=refund,
        cash_account_id=cash.id if cash else None,
        reason=data.reason,
        lines=[
            {
                "purchase_line_id": str(ln.id),
                "device_id": str(ln.device_id) if ln.device_id else None,
                "description": ln.description,
                "net_cost": str(ln.net_cost),
            }
            for ln in lines
        ],
        created_by=user_id,
    )
    db.add(doc)
    db.flush()

    posting = Posting(
        document_type="purchase_return", document_id=doc.id, memo=f"{doc.no} return of {pur.no}"
    )
    posting.at = at_for(doc.date)
    P = acc.party_account(party.id)
    if amount > ZERO:
        posting.debit(P, amount)
    for ln in lines:
        if ln.net_cost > ZERO:
            posting.credit(
                acc.SysAccount.INVENTORY if ln.device_id else acc.SysAccount.PURCHASES,
                ln.net_cost,
                device_id=ln.device_id,
                memo=ln.description,
            )
        ln.returned_at = utcnow()
    if refund > ZERO:
        posting.debit(acc.cash_account(cash.id), refund, memo=f"Refund {doc.no}").credit(P, refund)
    group = post(db, shop_id, user_id, posting)
    doc.ledger_group_id = group.id

    for ln in lines:
        if ln.accessory_id:
            a = acc_stock.get_accessory(db, shop_id, ln.accessory_id)
            acc_stock.move(
                db,
                shop_id,
                user_id,
                a,
                -ln.qty,
                "return",
                document_type="purchase_return",
                document_id=doc.id,
                note=doc.no,
            )
        if ln.device_id:
            device = db.get(Device, ln.device_id)
            apply_event(
                db,
                shop_id,
                user_id,
                device,
                EventType.RETURNED_TO_SUPPLIER,
                party_id=party.id,
                amount=ln.net_cost,
                ledger_group_id=group.id,
                document_type="purchase_return",
                document_id=doc.id,
                data={"return_no": doc.no, "reason": data.reason},
            )
    pur.returned_total = money(pur.returned_total + amount)
    record_audit(
        db,
        shop_id=shop_id,
        user_id=user_id,
        entity="purchase",
        entity_id=pur.id,
        action="return",
        after={"return_no": doc.no, "amount": str(amount), "refund": str(refund)},
    )
    db.commit()
    return doc


def get_return(db: Session, shop_id: uuid.UUID, return_id: uuid.UUID) -> ReturnDoc:
    r = db.get(ReturnDoc, return_id)
    if r is None or r.shop_id != shop_id:
        raise NotFound(code="return_not_found")
    return r


def list_returns(db: Session, shop_id: uuid.UUID, *, kind, party_id, limit) -> list[ReturnDoc]:
    stmt = select(ReturnDoc).where(ReturnDoc.shop_id == shop_id)
    if kind:
        stmt = stmt.where(ReturnDoc.kind == kind)
    if party_id:
        stmt = stmt.where(ReturnDoc.party_id == party_id)
    return list(db.scalars(stmt.order_by(ReturnDoc.created_at.desc()).limit(limit)).all())


def to_out(db: Session, r: ReturnDoc) -> dict:
    party = db.get(Party, r.party_id)
    return {
        **{c.name: getattr(r, c.name) for c in ReturnDoc.__table__.columns},
        "party_name": party.name if party else None,
        "party_balance_after": party.balance if party else None,
    }


__all__ = [
    "Decimal",
    "InvoiceLine",
    "PurchaseLine",
    "get_return",
    "list_returns",
    "purchase_return",
    "sale_return",
    "to_out",
]
