"""Which money account a payment lands in, and its saved details.

Each way of paying has its own account, so the day's hisaab shows how much came by each:
cash → the cash drawer; online → the shop's bank or wallet account (Easypaisa / JazzCash go to the
shop's own wallet account when it has one); cheque → "Cheques"; remittance → "Remittance".
The extra accounts are made the first time they are needed.
"""

import uuid
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ValidationFailed
from app.modules.ledger.models import CashAccount, CashAccountKind
from app.modules.ledger.service import default_cash_account, money
from app.modules.paymode.models import PaymentDetail, PayMethod
from app.modules.paymode.schemas import PaymentInfo

_AUTO = {
    PayMethod.ONLINE: (CashAccountKind.BANK, "Bank / Online", "بینک / آن لائن"),
    PayMethod.CHEQUE: (CashAccountKind.CHEQUE, "Cheques", "چیک"),
    PayMethod.REMITTANCE: (CashAccountKind.REMITTANCE, "Remittance", "بیرونِ ملک سے رقم"),
}
_WALLETS = {"easypaisa": CashAccountKind.EASYPAISA, "jazzcash": CashAccountKind.JAZZCASH}


def _first(db: Session, shop_id: uuid.UUID, kind: str) -> CashAccount | None:
    return db.scalar(
        select(CashAccount)
        .where(
            CashAccount.shop_id == shop_id,
            CashAccount.kind == kind,
            CashAccount.is_active.is_(True),
        )
        .order_by(CashAccount.created_at)
    )


def account_for(
    db: Session, shop_id: uuid.UUID, info: PaymentInfo | None, explicit_id: uuid.UUID | None
) -> CashAccount:
    if explicit_id:
        acc = db.get(CashAccount, explicit_id)
        if acc is None or acc.shop_id != shop_id or not acc.is_active:
            raise ValidationFailed(code="cash_account_invalid")
        return acc
    method = info.method if info else PayMethod.CASH
    if method == PayMethod.CASH:
        return default_cash_account(db, shop_id)
    if method == PayMethod.ONLINE:
        wallet = _WALLETS.get((info.bank or "").strip().lower())
        found = (_first(db, shop_id, wallet) if wallet else None) or _first(
            db, shop_id, CashAccountKind.BANK
        )
        if found:
            return found
    kind, name, name_ur = _AUTO[method]
    found = _first(db, shop_id, kind)
    if found:
        return found
    acc = CashAccount(shop_id=shop_id, kind=kind, name=name, name_ur=name_ur)
    db.add(acc)
    db.flush()
    return acc


def save(
    db: Session,
    shop_id: uuid.UUID,
    document_type: str,
    document_id: uuid.UUID,
    info: PaymentInfo | None,
    amount: Decimal,
) -> None:
    """Keep the details of a non-cash payment (cash needs none)."""
    if info is None or info.method == PayMethod.CASH or amount <= 0:
        return
    db.add(
        PaymentDetail(
            shop_id=shop_id,
            document_type=document_type,
            document_id=document_id,
            amount=money(amount),
            **info.model_dump(exclude={"method"}),
            method=info.method,
        )
    )


def detail_for(db: Session, shop_id: uuid.UUID, document_type: str, document_id: uuid.UUID):
    return db.scalar(
        select(PaymentDetail).where(
            PaymentDetail.shop_id == shop_id,
            PaymentDetail.document_type == document_type,
            PaymentDetail.document_id == document_id,
        )
    )
