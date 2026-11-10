"""Exchange = trade-in purchase (credit to the customer) + sale (debit), one DB transaction.

Balance arithmetic (docs/01 S5): new balance = previous balance + new price − trade-in value − paid now (+ refund paid out).

Owner 2026-11-10 (ADR-057): the trade-in value is put against the new bill (and the trade-in bill
marked paid by it) without moving money, so each bill shows only what is really still open: the
new bill "Customer se lena", the trade-in bill "Customer ko dena". The shop may pay back all, part
or none of what it owes; the rest stays in the khata. The old phone's sale bill is linked.
"""

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import today as shop_today
from app.core.errors import NotFound, ValidationFailed
from app.db.base import ZERO
from app.modules.audit.service import record_audit
from app.modules.auth.models import Shop
from app.modules.exchanges.models import Exchange
from app.modules.exchanges.schemas import ExchangeCreate
from app.modules.ledger import accounts as acc
from app.modules.ledger.service import Posting, money, post
from app.modules.parties.models import Party
from app.modules.purchases.models import Purchase, PurchaseKind
from app.modules.purchases.schemas import PurchaseCreate
from app.modules.purchases.service import create_purchase, next_number
from app.modules.sales.models import Invoice
from app.modules.sales.schemas import SaleCreate
from app.modules.sales.service import create_sale, status_for


def create_exchange(db: Session, shop_id: uuid.UUID, ctx, data: ExchangeCreate) -> Exchange:
    shop = db.get(Shop, shop_id)
    party = db.get(Party, data.party_id)
    if party is None or party.shop_id != shop_id:
        raise NotFound(code="party_not_found")
    if not data.devices and not data.misc:
        raise ValidationFailed(
            code="exchange_needs_new_item",
            message_en="Pick the new device",
            message_ur="نیا موبائل منتخب کریں",
        )
    previous = money(party.balance)
    try:
        purchase = create_purchase(
            db,
            shop_id,
            ctx.id,
            PurchaseCreate(
                kind=PurchaseKind.TRADE_IN,
                party_id=party.id,
                devices=data.trade_in,
                paid=0,
                notes=data.notes,
            ),
            commit=False,
        )
        invoice = create_sale(
            db,
            shop_id,
            ctx,
            SaleCreate(
                party_id=party.id,
                devices=data.devices,
                misc=data.misc,
                discount=data.discount,
                paid=data.paid,
                cash_account_id=data.cash_account_id,
                payment=data.payment if money(data.paid) > ZERO else None,
                override_reason=data.override_reason,
                notes=data.notes,
            ),
            commit=False,
        )
        # the trade-in value goes against the new bill; what is left of it the shop owes
        applied = min(money(purchase.total), money(invoice.total - invoice.paid))
        shop_owes = money(purchase.total - applied)
        refund = money(data.refund)
        if refund > shop_owes:
            raise ValidationFailed(
                code="refund_exceeds",
                message_en=f"The shop owes the customer only {shop_owes} on this exchange",
                message_ur=f"اس ایکسچینج پر دکان کو گاہک کو صرف {shop_owes} دینے ہیں",
            )
        if applied > ZERO:
            invoice.paid = money(invoice.paid + applied)
            invoice.status = status_for(invoice.total, invoice.paid)
        purchase.paid = money(purchase.paid + applied + refund)
        if refund > ZERO:
            from app.modules.paymode import service as paymode

            cash = paymode.account_for(db, shop_id, data.payment, data.cash_account_id)
            p = Posting(
                document_type="exchange_refund",
                document_id=invoice.id,
                memo=f"Exchange refund {party.name}",
            )
            p.debit(acc.party_account(party.id), refund).credit(
                acc.cash_account(cash.id), refund, memo="Exchange refund"
            )
            post(db, shop_id, ctx.id, p)
            paymode.save(db, shop_id, "exchange_refund", purchase.id, data.payment, refund)
        db.flush()
        ex = Exchange(
            shop_id=shop_id,
            no=next_number(db, shop, "EXC", "next_exchange_no"),
            party_id=party.id,
            date=shop_today(),
            purchase_id=purchase.id,
            invoice_id=invoice.id,
            trade_in_value=purchase.total,
            new_total=invoice.total,
            previous_balance=previous,
            paid=money(data.paid),
            new_balance=money(party.balance),
            original_invoice_id=_sold_on(db, purchase, party.id),
            trade_in_applied=applied,
            refund=refund,
            notes=data.notes,
            created_by=ctx.id,
        )
        db.add(ex)
        db.flush()
        record_audit(
            db,
            shop_id=shop_id,
            user_id=ctx.id,
            entity="exchange",
            entity_id=ex.id,
            action="create",
            after={
                "purchase": purchase.no,
                "invoice": invoice.no,
                "trade_in": str(ex.trade_in_value),
                "new_total": str(ex.new_total),
            },
        )
        db.commit()
    except Exception:
        db.rollback()
        raise
    return ex


def _sold_on(db: Session, purchase: Purchase, party_id: uuid.UUID) -> uuid.UUID | None:
    """the bill this shop sold the traded-in phone on to this customer, if it did"""
    from app.modules.devices.models import DeviceEvent
    from app.modules.devices.state import EventType

    for ln in purchase.lines:
        if not ln.device_id:
            continue
        ev = db.scalar(
            select(DeviceEvent)
            .where(
                DeviceEvent.device_id == ln.device_id,
                DeviceEvent.type == EventType.SOLD,
                DeviceEvent.party_id == party_id,
                DeviceEvent.document_type == "invoice",
            )
            .order_by(DeviceEvent.seq.desc())
        )
        if ev is not None:
            return ev.document_id
    return None


def get_exchange(db: Session, shop_id: uuid.UUID, exchange_id: uuid.UUID) -> Exchange:
    ex = db.get(Exchange, exchange_id)
    if ex is None or ex.shop_id != shop_id:
        raise NotFound(code="exchange_not_found")
    return ex


def list_exchanges(db: Session, shop_id: uuid.UUID, limit: int) -> list[Exchange]:
    return list(
        db.scalars(
            select(Exchange)
            .where(Exchange.shop_id == shop_id)
            .order_by(Exchange.created_at.desc())
            .limit(limit)
        ).all()
    )


def to_out(db: Session, ex: Exchange) -> dict:
    party = db.get(Party, ex.party_id)
    pur = db.get(Purchase, ex.purchase_id)
    inv = db.get(Invoice, ex.invoice_id)
    orig = db.get(Invoice, ex.original_invoice_id) if ex.original_invoice_id else None
    return {
        **{c.name: getattr(ex, c.name) for c in Exchange.__table__.columns},
        "party_name": party.name if party else None,
        "purchase_no": pur.no if pur else None,
        "invoice_no": inv.no if inv else None,
        "original_invoice_no": orig.no if orig else None,
    }
