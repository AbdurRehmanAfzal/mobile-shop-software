"""Payments in (from customers / shops) and out (to suppliers / shops) with allocation (FR-TXN-05)."""

import datetime as dt
import uuid
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import JSON, Date, ForeignKey, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import ZERO, Base, ShopScoped, Timestamped, UUIDPk


class PaymentDirection(StrEnum):
    IN = "in"
    OUT = "out"


class PaymentMethod(StrEnum):
    CASH = "cash"
    BANK = "bank"
    EASYPAISA = "easypaisa"
    JAZZCASH = "jazzcash"
    CARD = "card"
    OTHER = "other"
    ONLINE = "online"  # bank app / wallet, details in payment_details
    CHEQUE = "cheque"
    REMITTANCE = "remittance"


class Payment(UUIDPk, ShopScoped, Timestamped, Base):
    __tablename__ = "payments"
    __table_args__ = (UniqueConstraint("shop_id", "no", name="uq_payments_shop_no"),)

    no: Mapped[str] = mapped_column(String(20), nullable=False)
    party_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("parties.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    direction: Mapped[str] = mapped_column(String(3), nullable=False)
    amount: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)
    cash_account_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("cash_accounts.id", ondelete="RESTRICT"), nullable=False
    )
    method: Mapped[str] = mapped_column(String(10), nullable=False, default=PaymentMethod.CASH)
    reference: Mapped[str | None] = mapped_column(String(80))
    date: Mapped[dt.date] = mapped_column(Date, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    allocations: Mapped[list[dict]] = mapped_column(
        JSON, nullable=False, default=list
    )  # [{document_type, document_id, amount}]
    status: Mapped[str] = mapped_column(
        String(10), nullable=False, default="posted"
    )  # posted|voided
    ledger_group_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("ledger_groups.id", ondelete="SET NULL")
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )
    void_reason: Mapped[str | None] = mapped_column(Text)
