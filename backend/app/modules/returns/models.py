"""Sale returns (customer/shop brings a device back) and purchase returns (to a supplier) — FR-TXN-08."""

import datetime as dt
import uuid
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import (
    JSON,
    Date,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import ZERO, Base, ShopScoped, Timestamped, UUIDPk


class ReturnKind(StrEnum):
    SALE = "sale"
    PURCHASE = "purchase"


class Settlement(StrEnum):
    REFUND = "refund"  # money handed back now
    CREDIT = "credit"  # stays on the party's account
    INCOME = "income"  # shop keeps part of what was paid (restocking / amanat fee)


# owner 2026-11-17 (ADR-097): why it came back, for the returns report
REASONS = (
    "changed_mind",  # the customer changed his mind
    "fault",  # the phone has a fault
    "not_as_told",  # PTA / condition / storage not as told
    "price",  # found it cheaper
    "another_phone",  # wants a different phone
    "not_selling",  # to the supplier: it did not sell
    "other",
)


class ReturnDoc(UUIDPk, ShopScoped, Timestamped, Base):
    __tablename__ = "returns"
    __table_args__ = (
        UniqueConstraint("shop_id", "no", name="uq_returns_shop_no"),
        Index("ix_returns_shop_date", "shop_id", "date"),
    )

    no: Mapped[str] = mapped_column(String(20), nullable=False)
    kind: Mapped[str] = mapped_column(String(10), nullable=False)
    document_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, nullable=False, index=True
    )  # invoice or purchase id
    document_no: Mapped[str] = mapped_column(String(20), nullable=False)
    party_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("parties.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    date: Mapped[dt.date] = mapped_column(Date, nullable=False)
    amount: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)  # value of returned lines
    settlement: Mapped[str] = mapped_column(String(10), nullable=False, default=Settlement.CREDIT)
    refund_amount: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)
    kept_amount: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)
    cash_account_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("cash_accounts.id", ondelete="RESTRICT")
    )
    reason: Mapped[str | None] = mapped_column(Text)
    reason_code: Mapped[str | None] = mapped_column(String(20))  # one of REASONS, or not said
    lines: Mapped[list[dict]] = mapped_column(JSON, nullable=False, default=list)
    ledger_group_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("ledger_groups.id", ondelete="SET NULL")
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )
    # owner 2026-11-15 (ADR-090): a return entered by mistake is undone, kept as Deleted
    status: Mapped[str] = mapped_column(
        String(10), nullable=False, default="posted", server_default="posted"
    )  # posted | voided
    void_reason: Mapped[str | None] = mapped_column(Text)
    voided_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    # owner 2026-11-17 (ADR-101): when it was undone; how the item came back (ok | damaged — a
    # damaged phone goes to Faulty, not to normal stock); and the wrong return this one replaces
    voided_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))
    item_condition: Mapped[str | None] = mapped_column(String(12))
    replaces_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
