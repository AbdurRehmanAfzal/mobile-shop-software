"""How money was paid on a sale or a purchase (owner, 2026-10-28): cash, online (bank app or wallet),
cheque, or a remittance sent from abroad. The ledger still holds the money; this table only keeps
the details a shopkeeper asks about later ("kis bank se aaye? TID kya tha? kis ne bheje?")."""

import datetime as dt
import uuid
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import Date, Index, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import ZERO, Base, ShopScoped, Timestamped, UUIDPk


class PayMethod(StrEnum):
    CASH = "cash"
    ONLINE = "online"  # bank app transfer, IBFT, Raast or a wallet
    CHEQUE = "cheque"
    REMITTANCE = "remittance"  # money sent from abroad by the buyer's family


class PaymentDetail(UUIDPk, ShopScoped, Timestamped, Base):
    __tablename__ = "payment_details"
    __table_args__ = (
        Index("ix_payment_details_document", "shop_id", "document_type", "document_id"),
    )

    document_type: Mapped[str] = mapped_column(String(20), nullable=False)  # sale|purchase
    document_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False)
    method: Mapped[str] = mapped_column(String(12), nullable=False)
    amount: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)  # PKR
    bank: Mapped[str | None] = mapped_column(String(80))  # bank or wallet name
    reference: Mapped[str | None] = mapped_column(String(80))  # TID / cheque no / MTCN
    cheque_date: Mapped[dt.date | None] = mapped_column(Date)
    sender_name: Mapped[str | None] = mapped_column(String(120))
    country: Mapped[str | None] = mapped_column(String(60))
    currency: Mapped[str | None] = mapped_column(String(3))
    foreign_amount: Mapped[Decimal | None] = mapped_column()
    rate: Mapped[Decimal | None] = mapped_column()
    service: Mapped[str | None] = mapped_column(String(60))  # Western Union, MoneyGram, ...
