import datetime as dt
import uuid
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import Conflict, Forbidden, NotFound, ValidationFailed
from app.core.permissions import Cap
from app.db.base import ZERO, utcnow
from app.modules.audit.service import record_audit
from app.modules.auth.models import Shop
from app.modules.ledger import accounts as acc
from app.modules.ledger.models import CashAccount
from app.modules.ledger.service import Posting, default_cash_account, money, post, reverse
from app.modules.notifications import service as notify
from app.modules.parties.models import Party
from app.modules.payments.models import Payment, PaymentDirection
from app.modules.payments.schemas import PaymentCreate
from app.modules.purchases.models import Purchase, PurchaseStatus
from app.modules.purchases.service import next_number
from app.modules.sales.models import Invoice, InvoiceStatus
from app.modules.sales.service import status_for


def _open_documents(db: Session, shop_id: uuid.UUID, party_id: uuid.UUID, direction: str) -> list:
    if direction == PaymentDirection.IN:
        rows = db.scalars(
            select(Invoice)
            .where(
                Invoice.shop_id == shop_id,
                Invoice.party_id == party_id,
                Invoice.status.in_([InvoiceStatus.OPEN, InvoiceStatus.PARTIALLY_PAID]),
            )
            .order_by(Invoice.date, Invoice.created_at)
        ).all()
    else:
        rows = db.scalars(
            select(Purchase)
            .where(
                Purchase.shop_id == shop_id,
                Purchase.party_id == party_id,
                Purchase.status == PurchaseStatus.POSTED,
                Purchase.paid < Purchase.total,
            )
            .order_by(Purchase.date, Purchase.created_at)
        ).all()
    return list(rows)


def _apply_allocation(
    db: Session,
    shop_id: uuid.UUID,
    party_id: uuid.UUID,
    direction: str,
    doc_type: str,
    doc_id: uuid.UUID,
    amount: Decimal,
    sign: int,
) -> str:
    """sign=+1 allocate, -1 undo. Returns the document number."""
    if doc_type == "invoice":
        if direction != PaymentDirection.IN:
            raise ValidationFailed(code="allocation_direction")
        doc = db.get(Invoice, doc_id)
        if doc is None or doc.shop_id != shop_id or doc.party_id != party_id:
            raise NotFound(code="invoice_not_found")
        if sign > 0 and money(doc.paid + amount) > doc.total:
            raise ValidationFailed(
                code="over_allocation",
                message_en=f"{doc.no} only has {doc.total - doc.paid} due",
                message_ur=f"{doc.no} پر صرف {doc.total - doc.paid} باقی ہے",
            )
        doc.paid = money(doc.paid + sign * amount)
        if doc.status not in (InvoiceStatus.VOID, InvoiceStatus.RETURNED):
            doc.status = status_for(doc.total, doc.paid)
        return doc.no
    doc = db.get(Purchase, doc_id)
    if doc is None or doc.shop_id != shop_id or doc.party_id != party_id:
        raise NotFound(code="purchase_not_found")
    if direction != PaymentDirection.OUT:
        raise ValidationFailed(code="allocation_direction")
    if sign > 0 and money(doc.paid + amount) > doc.total:
        raise ValidationFailed(code="over_allocation")
    doc.paid = money(doc.paid + sign * amount)
    return doc.no


def create_payment(
    db: Session, shop_id: uuid.UUID, user_id: uuid.UUID, data: PaymentCreate
) -> Payment:
    shop = db.get(Shop, shop_id)
    party = db.get(Party, data.party_id)
    if party is None or party.shop_id != shop_id:
        raise NotFound(code="party_not_found")
    amount = money(data.amount)
    cash = (
        db.get(CashAccount, data.cash_account_id)
        if data.cash_account_id
        else default_cash_account(db, shop_id)
    )
    if cash is None or cash.shop_id != shop_id:
        raise NotFound(code="cash_account_not_found")

    # allocations
    allocations: list[dict] = []
    if data.allocations is not None:
        total_alloc = sum((money(a.amount) for a in data.allocations), ZERO)
        if total_alloc > amount:
            raise ValidationFailed(
                code="allocation_exceeds_amount",
                message_en="Allocated more than paid",
                message_ur="تقسیم شدہ رقم ادائیگی سے زیادہ ہے",
            )
        for a in data.allocations:
            no = _apply_allocation(
                db,
                shop_id,
                party.id,
                data.direction,
                a.document_type,
                a.document_id,
                money(a.amount),
                +1,
            )
            allocations.append(
                {
                    "document_type": a.document_type,
                    "document_id": str(a.document_id),
                    "document_no": no,
                    "amount": str(money(a.amount)),
                }
            )
    else:
        remaining = amount
        for doc in _open_documents(db, shop_id, party.id, data.direction):
            if remaining <= ZERO:
                break
            due = money(doc.total - doc.paid)
            take = min(due, remaining)
            if take <= ZERO:
                continue
            kind = "invoice" if isinstance(doc, Invoice) else "purchase"
            _apply_allocation(db, shop_id, party.id, data.direction, kind, doc.id, take, +1)
            allocations.append(
                {
                    "document_type": kind,
                    "document_id": str(doc.id),
                    "document_no": doc.no,
                    "amount": str(take),
                }
            )
            remaining = money(remaining - take)

    payment = Payment(
        shop_id=shop_id,
        no=next_number(db, shop, "PAY", "next_payment_no"),
        party_id=party.id,
        direction=data.direction,
        amount=amount,
        cash_account_id=cash.id,
        method=data.method,
        reference=data.reference,
        date=data.date or dt.date.today(),
        notes=data.notes,
        allocations=allocations,
        created_by=user_id,
    )
    db.add(payment)
    db.flush()
    posting = Posting(
        document_type="payment", document_id=payment.id, memo=f"{payment.no} {party.name}"
    )
    if data.direction == PaymentDirection.IN:
        posting.debit(acc.cash_account(cash.id), amount, memo=f"Received from {party.name}").credit(
            acc.party_account(party.id), amount
        )
    else:
        posting.debit(acc.party_account(party.id), amount).credit(
            acc.cash_account(cash.id), amount, memo=f"Paid to {party.name}"
        )
    group = post(db, shop_id, user_id, posting)
    payment.ledger_group_id = group.id
    if data.direction == PaymentDirection.IN:
        notify.on_payment_in(db, shop, payment, party)
    record_audit(
        db,
        shop_id=shop_id,
        user_id=user_id,
        entity="payment",
        entity_id=payment.id,
        action="create",
        after={"no": payment.no, "direction": data.direction, "amount": str(amount)},
    )
    db.commit()
    return payment


def get_payment(db: Session, shop_id: uuid.UUID, payment_id: uuid.UUID) -> Payment:
    p = db.get(Payment, payment_id)
    if p is None or p.shop_id != shop_id:
        raise NotFound(code="payment_not_found")
    return p


def list_payments(
    db: Session, shop_id: uuid.UUID, *, party_id, direction, date_from, date_to, limit
) -> list[Payment]:
    stmt = select(Payment).where(Payment.shop_id == shop_id)
    if party_id:
        stmt = stmt.where(Payment.party_id == party_id)
    if direction:
        stmt = stmt.where(Payment.direction == direction)
    if date_from:
        stmt = stmt.where(Payment.date >= date_from)
    if date_to:
        stmt = stmt.where(Payment.date <= date_to)
    return list(db.scalars(stmt.order_by(Payment.created_at.desc()).limit(limit)).all())


def to_out(db: Session, p: Payment) -> dict:
    party = db.get(Party, p.party_id)
    allocated = sum((money(a["amount"]) for a in p.allocations), ZERO)
    return {
        **{c.name: getattr(p, c.name) for c in Payment.__table__.columns},
        "party_name": party.name if party else None,
        "party_balance_after": party.balance if party else None,
        "unallocated": money(p.amount - allocated) if p.status == "posted" else ZERO,
    }


def void_payment(
    db: Session, shop_id: uuid.UUID, ctx, payment_id: uuid.UUID, reason: str
) -> Payment:
    if not ctx.can(Cap.VOID):
        raise Forbidden()
    p = get_payment(db, shop_id, payment_id)
    if p.status == "voided":
        raise Conflict(code="already_voided")
    for a in p.allocations:
        _apply_allocation(
            db,
            shop_id,
            p.party_id,
            p.direction,
            a["document_type"],
            uuid.UUID(a["document_id"]),
            money(a["amount"]),
            -1,
        )
    if p.ledger_group_id:
        reverse(db, shop_id, ctx.id, p.ledger_group_id, f"Void {p.no}: {reason}")
    p.status = "voided"
    p.void_reason = reason
    p.updated_at = utcnow()
    record_audit(
        db,
        shop_id=shop_id,
        user_id=ctx.id,
        entity="payment",
        entity_id=p.id,
        action="void",
        after={"reason": reason},
    )
    db.commit()
    return p
