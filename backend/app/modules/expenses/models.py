"""Expenses, categories and day-close (FR-TXN-09, FR-TXN-10)."""

import datetime as dt
import uuid
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    Date,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import ZERO, Base, ShopScoped, Timestamped, UUIDPk


class ExpenseCategory(UUIDPk, Base):
    __tablename__ = "expense_categories"

    shop_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("shops.id", ondelete="CASCADE"), index=True
    )
    key: Mapped[str] = mapped_column(String(40), nullable=False)  # ledger account suffix, e.g. rent
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    name_ur: Mapped[str | None] = mapped_column(String(100))
    sort_order: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Expense(UUIDPk, ShopScoped, Timestamped, Base):
    __tablename__ = "expenses"
    __table_args__ = (
        UniqueConstraint("shop_id", "no", name="uq_expenses_shop_no"),
        Index("ix_expenses_shop_date", "shop_id", "date"),
    )

    no: Mapped[str] = mapped_column(String(20), nullable=False)
    category_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("expense_categories.id", ondelete="RESTRICT"), nullable=False
    )
    category_key: Mapped[str] = mapped_column(String(40), nullable=False)
    amount: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)
    cash_account_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("cash_accounts.id", ondelete="RESTRICT"), nullable=False
    )
    date: Mapped[dt.date] = mapped_column(Date, nullable=False)
    party_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("parties.id", ondelete="SET NULL")
    )  # e.g. technician
    staff_user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )  # salary / advance
    description: Mapped[str | None] = mapped_column(String(200))
    receipt_path: Mapped[str | None] = mapped_column(String(300))
    notes: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="posted")
    ledger_group_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("ledger_groups.id", ondelete="SET NULL")
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )
    void_reason: Mapped[str | None] = mapped_column(Text)


class DayClose(UUIDPk, ShopScoped, Base):
    __tablename__ = "day_closes"
    __table_args__ = (UniqueConstraint("shop_id", "cash_account_id", "date", name="uq_day_close"),)

    cash_account_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("cash_accounts.id", ondelete="RESTRICT"), nullable=False
    )
    date: Mapped[dt.date] = mapped_column(Date, nullable=False)
    opening: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)
    cash_in: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)
    cash_out: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)
    expected: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)
    counted: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)
    difference: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    closed_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )
    closed_at: Mapped[dt.datetime] = mapped_column(
        nullable=False, default=lambda: dt.datetime.now(dt.UTC)
    )
