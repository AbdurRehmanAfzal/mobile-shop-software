"""Loans ("amanat"): a device handed to another shop without money changing hands (FR-TXN-06)."""

import datetime as dt
import uuid
from enum import StrEnum

from sqlalchemy import Date, DateTime, ForeignKey, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, ShopScoped, Timestamped, UUIDPk, utcnow


class LoanStatus(StrEnum):
    OUT = "out"
    RETURNED = "returned"
    SOLD = "sold"


class Loan(UUIDPk, ShopScoped, Timestamped, Base):
    __tablename__ = "loans"

    device_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("devices.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    party_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("parties.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    out_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    expected_back_at: Mapped[dt.date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(10), nullable=False, default=LoanStatus.OUT)
    settled_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))
    invoice_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("invoices.id", ondelete="SET NULL")
    )
    notes: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )
