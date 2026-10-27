"""Exchange = trade-in purchase (credit to the customer) + sale (debit), one DB transaction.

Balance arithmetic (docs/01 S5): new balance = previous balance + new price − trade-in value − paid now (+ refund paid out).
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
from app.modules.ledger.models import CashAccount
from app.modules.ledger.service import Posting, default_cash_account, money, post
from app.modules.parties.models import Party
from app.modules.purchases.models import Purchase, PurchaseKind
from app.modules.purchases.schemas import PurchaseCreate
from app.modules.purchases.service import create_purchase, next_number
from app.modules.sales.models import Invoice
from app.modules.sales.schemas import SaleCreate
from app.modules.sales.service import create_sale


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
                override_reason=data.override_reason,
                notes=data.notes,
            ),
            commit=False,
        )
        refund = money(data.refund)
        if refund > ZERO:
            cash = (
                db.get(CashAccount, data.cash_account_id)
                if data.cash_account_id
                else default_cash_account(db, shop_id)
            )
            if cash is None or cash.shop_id != shop_id:
                raise NotFound(code="cash_account_not_found")
            p = Posting(
                document_type="exchange_refund",
                document_id=invoice.id,
                memo=f"Exchange refund {party.name}",
            )
            p.debit(acc.party_account(party.id), refund).credit(
                acc.cash_account(cash.id), refund, memo="Exchange refund"
            )
            post(db, shop_id, ctx.id, p)
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
    return {
        **{c.name: getattr(ex, c.name) for c in Exchange.__table__.columns},
        "party_name": party.name if party else None,
        "purchase_no": pur.no if pur else None,
        "invoice_no": inv.no if inv else None,
    }
