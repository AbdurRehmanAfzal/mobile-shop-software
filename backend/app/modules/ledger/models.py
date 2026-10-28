"""Append-only ledger (FR-TXN-01, FR-TXN-02; ADR-002).

- `ledger_groups`: one balanced posting (a document's money effect). Never updated except to mark
  `reversed_by_group_id` when a reversing group is posted.
- `ledger_entries`: the lines. Σdebit = Σcredit within a group (enforced by the service).
- `cash_accounts`: cash drawer, bank, Easypaisa, JazzCash. Balance = opening + Σ(debit − credit).
"""

import uuid
from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import ZERO, Base, ShopScoped, Timestamped, UUIDPk, utcnow


class CashAccountKind(StrEnum):
    CASH = "cash"
    BANK = "bank"
    EASYPAISA = "easypaisa"
    JAZZCASH = "jazzcash"
    CHEQUE = "cheque"  # cheques received / given, until they are banked
    REMITTANCE = "remittance"  # money sent from abroad for a sale


class CashAccount(UUIDPk, ShopScoped, Timestamped, Base):
    __tablename__ = "cash_accounts"

    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    name_ur: Mapped[str | None] = mapped_column(String(100))
    account_no: Mapped[str | None] = mapped_column(String(60))  # IBAN / wallet number
    opening_balance: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)
    opening_date: Mapped[date | None] = mapped_column(Date)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class LedgerGroup(UUIDPk, ShopScoped, Base):
    __tablename__ = "ledger_groups"
    __table_args__ = (
        Index("ix_ledger_groups_document", "shop_id", "document_type", "document_id"),
    )

    document_type: Mapped[str] = mapped_column(
        String(40), nullable=False
    )  # invoice|purchase|payment|expense|...
    document_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    memo: Mapped[str | None] = mapped_column(Text)
    posted_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )
    at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False, index=True
    )
    reverses_group_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("ledger_groups.id")
    )
    reversed_by_group_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("ledger_groups.id")
    )

    entries: Mapped[list["LedgerEntry"]] = relationship(
        back_populates="group", cascade="all, delete-orphan", order_by="LedgerEntry.seq"
    )


class LedgerEntry(UUIDPk, ShopScoped, Base):
    __tablename__ = "ledger_entries"
    __table_args__ = (
        Index("ix_ledger_entries_account_at", "shop_id", "account", "at"),
        Index("ix_ledger_entries_party_at", "shop_id", "party_id", "at"),
    )

    group_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("ledger_groups.id", ondelete="CASCADE"), nullable=False, index=True
    )
    seq: Mapped[int] = mapped_column(nullable=False, default=0)
    account: Mapped[str] = mapped_column(String(80), nullable=False)
    party_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("parties.id", ondelete="RESTRICT")
    )
    cash_account_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("cash_accounts.id", ondelete="RESTRICT")
    )
    device_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("devices.id", ondelete="SET NULL"), index=True
    )
    debit: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)
    credit: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)
    memo: Mapped[str | None] = mapped_column(String(200))
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    group: Mapped[LedgerGroup] = relationship(back_populates="entries")
