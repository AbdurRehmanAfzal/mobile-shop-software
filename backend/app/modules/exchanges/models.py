"""Exchange / upgrade (FR-TXN-07, scenario S5): a trade-in purchase and a sale to the same customer, posted atomically."""

import datetime as dt
import uuid
from decimal import Decimal

from sqlalchemy import Date, ForeignKey, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import ZERO, Base, ShopScoped, Timestamped, UUIDPk


class Exchange(UUIDPk, ShopScoped, Timestamped, Base):
    __tablename__ = "exchanges"
    __table_args__ = (UniqueConstraint("shop_id", "no", name="uq_exchanges_shop_no"),)

    no: Mapped[str] = mapped_column(String(20), nullable=False)
    party_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("parties.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    date: Mapped[dt.date] = mapped_column(Date, nullable=False)
    purchase_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("purchases.id", ondelete="RESTRICT"), nullable=False
    )
    invoice_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("invoices.id", ondelete="RESTRICT"), nullable=False
    )
    trade_in_value: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)
    new_total: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)
    previous_balance: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)
    paid: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)
    new_balance: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )
