"""Phones sold on installments / qist (owner 2026-10-29). The money itself lives on the invoice and
the party's khata as before (advance paid now, the rest udhaar); the plan only says how the rest is
to come: how many months, how much each, which day. Each installment's state is derived from what
the invoice has received, so a payment taken from the khata screen counts too."""

import datetime as dt
import uuid
from decimal import Decimal

from sqlalchemy import Date, ForeignKey, Integer, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import ZERO, Base, ShopScoped, Timestamped, UUIDPk


class InstallmentPlan(UUIDPk, ShopScoped, Timestamped, Base):
    __tablename__ = "installment_plans"

    invoice_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    party_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("parties.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    total: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)  # the invoice total
    advance: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)
    months: Mapped[int] = mapped_column(Integer, nullable=False)
    monthly: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)
    due_day: Mapped[int] = mapped_column(Integer, nullable=False)  # 1..28
    first_due: Mapped[dt.date] = mapped_column(Date, nullable=False)
    guarantor_name: Mapped[str | None] = mapped_column(String(200))
    guarantor_phone: Mapped[str | None] = mapped_column(String(20))
    guarantor_cnic: Mapped[str | None] = mapped_column(String(20))
    notes: Mapped[str | None] = mapped_column(Text)
    last_reminded_at: Mapped[dt.datetime | None] = mapped_column()
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )
