"""Purchase documents (FR-TXN-03): devices and misc items bought from a supplier, walk-in, another shop or as trade-in."""

import datetime as dt
import uuid
from datetime import date
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import (
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import ZERO, Base, ShopScoped, Timestamped, UUIDPk


class PurchaseKind(StrEnum):
    SUPPLIER = "supplier"
    WALK_IN = "walk_in"
    SHOP = "shop"
    TRADE_IN = "trade_in"


class PurchaseStatus(StrEnum):
    POSTED = "posted"
    VOIDED = "voided"


class Purchase(UUIDPk, ShopScoped, Timestamped, Base):
    __tablename__ = "purchases"
    __table_args__ = (
        UniqueConstraint("shop_id", "no", name="uq_purchases_shop_no"),
        Index("ix_purchases_shop_date", "shop_id", "date"),
    )

    no: Mapped[str] = mapped_column(String(20), nullable=False)
    kind: Mapped[str] = mapped_column(String(10), nullable=False)
    party_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("parties.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    date: Mapped[date] = mapped_column(Date, nullable=False)
    due_date: Mapped[dt.date | None] = mapped_column(Date)  # when we promised to pay the supplier
    # owner addendum 5: the supplier's own bill number, freight / loading spread over the lines
    supplier_invoice_no: Mapped[str | None] = mapped_column(String(40))
    extra_costs: Mapped[Decimal] = mapped_column(default=ZERO, server_default="0", nullable=False)
    extra_costs_note: Mapped[str | None] = mapped_column(String(120))
    # when the phone was actually bought (shopkeeper may enter it later); null on old rows
    purchased_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))
    subtotal: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)
    discount: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)
    total: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)
    paid: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)
    returned_total: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)
    cash_account_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("cash_accounts.id", ondelete="RESTRICT")
    )
    status: Mapped[str] = mapped_column(String(10), nullable=False, default=PurchaseStatus.POSTED)
    ledger_group_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("ledger_groups.id", ondelete="SET NULL")
    )
    reference: Mapped[str | None] = mapped_column(String(80))  # supplier invoice no
    notes: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )
    voided_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )
    void_reason: Mapped[str | None] = mapped_column(Text)

    lines: Mapped[list["PurchaseLine"]] = relationship(
        back_populates="purchase", cascade="all, delete-orphan", order_by="PurchaseLine.line_no"
    )


class PurchaseLine(UUIDPk, Base):
    __tablename__ = "purchase_lines"

    purchase_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("purchases.id", ondelete="CASCADE"), nullable=False, index=True
    )
    line_no: Mapped[int] = mapped_column(Integer, nullable=False)
    kind: Mapped[str] = mapped_column(String(10), nullable=False)  # device|misc
    device_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("devices.id", ondelete="RESTRICT"), index=True
    )
    accessory_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("accessories.id", ondelete="RESTRICT")
    )
    description: Mapped[str | None] = mapped_column(String(200))
    qty: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    unit_cost: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)
    discount_share: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)
    net_cost: Mapped[Decimal] = mapped_column(
        default=ZERO, nullable=False
    )  # qty*unit_cost - discount_share
    # owner addendum 5: bought in dozens / boxes (qty stays pieces), freight share, lot reference
    pack_unit: Mapped[str | None] = mapped_column(String(12))
    pack_qty: Mapped[int | None] = mapped_column(Integer)
    extra_cost_share: Mapped[Decimal] = mapped_column(default=ZERO, server_default="0", nullable=False)
    batch_ref: Mapped[str | None] = mapped_column(String(40))
    returned_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))

    purchase: Mapped[Purchase] = relationship(back_populates="lines")
