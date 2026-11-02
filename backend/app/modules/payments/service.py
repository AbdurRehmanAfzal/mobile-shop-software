import uuid
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import today as shop_today
from app.core.errors import Conflict, Forbidden, NotFound, ValidationFailed
from app.core.permissions import Cap
from app.db.base import ZERO, utcnow
from app.modules.audit.service import record_audit
from app.modules.auth.models import Shop
from app.modules.ledger import accounts as acc
from app.modules.ledger.service import Posting, at_for, money, post, reverse
from app.modules.notifications import service as notify
from app.modules.parties.models import Party
from app.modules.payments.models import Payment, PaymentDirection, PaymentPurpose
from app.modules.payments.schemas import PaymentCreate
from app.modules.paymode import service as paymode
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
    cash = paymode.account_for(db, shop_id, data.payment, data.cash_account_id)
    method = data.payment.method if data.payment and data.payment.method != "cash" else data.method
    lending = data.purpose == PaymentPurpose.LENDING

    # allocations (len-den is money with no bill: it is never put on a bill when it is made)
    allocations: list[dict] = []
    if lending and data.allocations:
        raise ValidationFailed(
            code="lending_no_bills",
            message_en="Money lent or borrowed is not paid against a bill",
            message_ur="لین دین کی رقم کسی بل کے بدلے نہیں ہوتی",
        )
    if lending:
        pass
    elif data.allocations is not None:
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
        purpose=data.purpose,
        amount=amount,
        cash_account_id=cash.id,
        method=method,
        reference=data.reference or (data.payment.reference if data.payment else None),
        date=data.date or shop_today(),
        notes=data.notes,
        allocations=allocations,
        created_by=user_id,
    )
    db.add(payment)
    db.flush()
    paymode.save(db, shop_id, "payment", payment.id, data.payment, amount)
    # the same khata either way, so len-den nets against the person's later bills; its own
    # document type keeps it apart from bill money in every cash and party report
    posting = Posting(
        document_type="lending" if lending else "payment",
        document_id=payment.id,
        memo=f"{payment.no} {party.name}",
    )
    posting.at = posting.at or at_for(payment.date)
    if data.direction == PaymentDirection.IN:
        memo = f"Borrowed from {party.name}" if lending else f"Received from {party.name}"
        posting.debit(acc.cash_account(cash.id), amount, memo=memo).credit(
            acc.party_account(party.id), amount
        )
    else:
        memo = f"Lent to {party.name}" if lending else f"Paid to {party.name}"
        posting.debit(acc.party_account(party.id), amount).credit(
            acc.cash_account(cash.id), amount, memo=memo
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
        after={
            "no": payment.no,
            "direction": data.direction,
            "purpose": data.purpose,
            "amount": str(amount),
        },
    )
    db.commit()
    return payment


def get_payment(db: Session, shop_id: uuid.UUID, payment_id: uuid.UUID) -> Payment:
    p = db.get(Payment, payment_id)
    if p is None or p.shop_id != shop_id:
        raise NotFound(code="payment_not_found")
    return p


def list_payments(
    db: Session,
    shop_id: uuid.UUID,
    *,
    party_id,
    direction,
    date_from,
    date_to,
    limit,
    purpose=None,
) -> list[Payment]:
    stmt = select(Payment).where(Payment.shop_id == shop_id)
    if purpose:
        stmt = stmt.where(Payment.purpose == purpose)
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
        "payment": paymode.detail_for(db, p.shop_id, "payment", p.id),
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


# ---- len-den (docs/32) ----------------------------------------------------------------------------


def _unallocated(p: Payment) -> Decimal:
    return money(p.amount - sum((money(a["amount"]) for a in p.allocations), ZERO))


def lending_balances(
    db: Session, shop_id: uuid.UUID, party_ids: list[uuid.UUID] | None = None, until=None
) -> dict[uuid.UUID, Decimal]:
    """Len-den still open per person: money lent minus money borrowed, less what was later put on a
    bill. Positive = the person owes the shop, negative = the shop owes the person. It is a part of
    the khata balance, never a second balance."""
    stmt = select(Payment).where(
        Payment.shop_id == shop_id,
        Payment.purpose == PaymentPurpose.LENDING,
        Payment.status == "posted",
    )
    if until is not None:
        stmt = stmt.where(Payment.date <= until)
    if party_ids is not None:
        if not party_ids:
            return {}
        stmt = stmt.where(Payment.party_id.in_(party_ids))
    out: dict[uuid.UUID, Decimal] = {}
    for p in db.scalars(stmt).all():
        sign = 1 if p.direction == PaymentDirection.OUT else -1
        out[p.party_id] = money(out.get(p.party_id, ZERO) + sign * _unallocated(p))
    return {k: v for k, v in out.items() if v != ZERO}


def _settle_plan(db: Session, shop_id: uuid.UUID, party_id: uuid.UUID) -> dict:
    """What can be put on the person's open bills from money already given / taken with no bill:
    money they gave the shop (advance or len-den) against their unpaid sale bills, money the shop
    gave them against its unpaid purchase bills. Len-den both ways counts only its net."""
    pays = db.scalars(
        select(Payment)
        .where(
            Payment.shop_id == shop_id,
            Payment.party_id == party_id,
            Payment.status == "posted",
        )
        .order_by(Payment.date, Payment.created_at)
    ).all()
    lend = {"in": ZERO, "out": ZERO}
    for p in pays:
        if p.purpose == PaymentPurpose.LENDING:
            lend[p.direction] = money(lend[p.direction] + _unallocated(p))
    out = {}
    for direction in ("in", "out"):
        other = "out" if direction == "in" else "in"
        lend_free = max(ZERO, money(lend[direction] - lend[other]))
        sources = []
        # advances first, len-den after
        for p in sorted(pays, key=lambda x: x.purpose == PaymentPurpose.LENDING):
            if p.direction != direction:
                continue
            free = _unallocated(p)
            if p.purpose == PaymentPurpose.LENDING:
                free = min(free, lend_free)
                lend_free = money(lend_free - free)
            if free > ZERO:
                sources.append((p, free))
        docs = _open_documents(db, shop_id, party_id, direction)
        due = money(sum((money(d.total - d.paid) for d in docs), ZERO))
        free_total = money(sum((f for _, f in sources), ZERO))
        out[direction] = {
            "sources": sources,
            "docs": docs,
            "amount": min(due, free_total),
            "open_bills": due,
            "free": free_total,
        }
    return out


def settle_summary(db: Session, shop_id: uuid.UUID, party_id: uuid.UUID) -> dict:
    s = _settle_plan(db, shop_id, party_id)
    return {
        d: {"amount": s[d]["amount"], "open_bills": s[d]["open_bills"], "free": s[d]["free"]}
        for d in ("in", "out")
    }


def settle(db: Session, shop_id: uuid.UUID, user_id: uuid.UUID, party_id: uuid.UUID) -> dict:
    """Put money already given / taken with no bill on the person's open bills, oldest first. The
    khata balance does not move (the money is already in it); only the bills show as paid."""
    party = db.get(Party, party_id)
    if party is None or party.shop_id != shop_id:
        raise NotFound(code="party_not_found")
    plan = _settle_plan(db, shop_id, party_id)
    done: list[dict] = []
    for direction in ("in", "out"):
        docs = [[d, money(d.total - d.paid)] for d in plan[direction]["docs"]]
        for p, free in plan[direction]["sources"]:
            for slot in docs:
                if free <= ZERO:
                    break
                doc, due = slot
                take = min(due, free)
                if take <= ZERO:
                    continue
                kind = "invoice" if isinstance(doc, Invoice) else "purchase"
                no = _apply_allocation(db, shop_id, party_id, direction, kind, doc.id, take, +1)
                p.allocations = [
                    *p.allocations,
                    {
                        "document_type": kind,
                        "document_id": str(doc.id),
                        "document_no": no,
                        "amount": str(take),
                        "settled": True,
                    },
                ]
                p.updated_at = utcnow()
                slot[1] = money(due - take)
                free = money(free - take)
                done.append({"payment_no": p.no, "document_no": no, "amount": take})
    if not done:
        raise ValidationFailed(
            code="nothing_to_settle",
            message_en="Nothing to adjust: no open bill, or no money given or taken without a bill",
            message_ur="ایڈجسٹ کرنے کو کچھ نہیں: کوئی کھلا بل یا بغیر بل کی رقم نہیں",
        )
    record_audit(
        db,
        shop_id=shop_id,
        user_id=user_id,
        entity="party",
        entity_id=party_id,
        action="settle",
        after={"lines": [{**d, "amount": str(d["amount"])} for d in done]},
    )
    db.commit()
    return {"lines": done, "total": money(sum((d["amount"] for d in done), ZERO))}


def party_lending(db: Session, shop_id: uuid.UUID, party_id: uuid.UUID) -> dict:
    party = db.get(Party, party_id)
    if party is None or party.shop_id != shop_id:
        raise NotFound(code="party_not_found")
    rows = db.scalars(
        select(Payment)
        .where(
            Payment.shop_id == shop_id,
            Payment.party_id == party_id,
            Payment.purpose == PaymentPurpose.LENDING,
        )
        .order_by(Payment.date.desc(), Payment.created_at.desc())
    ).all()
    lending = lending_balances(db, shop_id, [party_id]).get(party_id, ZERO)
    posted = [p for p in rows if p.status == "posted"]
    return {
        "party_id": party_id,
        "balance": money(party.balance),
        "lending": lending,
        "bills": money(party.balance - lending),
        "lent": money(sum((p.amount for p in posted if p.direction == "out"), ZERO)),
        "borrowed": money(sum((p.amount for p in posted if p.direction == "in"), ZERO)),
        "settle": settle_summary(db, shop_id, party_id),
        "entries": [
            {
                "id": p.id,
                "no": p.no,
                "direction": p.direction,
                "amount": p.amount,
                "open": _unallocated(p) if p.status == "posted" else ZERO,
                "date": p.date,
                "method": p.method,
                "notes": p.notes,
                "status": p.status,
            }
            for p in rows
        ],
    }
