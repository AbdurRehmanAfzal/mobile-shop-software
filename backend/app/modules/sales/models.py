"""Sales invoices (FR-TXN-04, FR-TXN-12, FR-TAX-02)."""

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
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import ZERO, Base, ShopScoped, Timestamped, UUIDPk


class InvoiceStatus(StrEnum):
    OPEN = "open"  # nothing paid
    PARTIALLY_PAID = "partially_paid"
    PAID = "paid"
    RETURNED = "returned"
    VOID = "void"


class Invoice(UUIDPk, ShopScoped, Timestamped, Base):
    __tablename__ = "invoices"
    __table_args__ = (
        UniqueConstraint("shop_id", "no", name="uq_invoices_shop_no"),
        Index("ix_invoices_shop_date", "shop_id", "date"),
    )

    no: Mapped[str] = mapped_column(String(20), nullable=False)
    party_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("parties.id", ondelete="RESTRICT"), index=True
    )
    date: Mapped[dt.date] = mapped_column(Date, nullable=False)
    # owner decision 2026-10-31: an optional promise date for udhaar (the audit calls it overdue after it)
    due_date: Mapped[dt.date | None] = mapped_column(Date)
    subtotal: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)
    discount: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)
    tax_rate: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)
    tax_inclusive: Mapped[bool] = mapped_column(default=True, nullable=False)
    tax_amount: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)
    total: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)
    paid: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)
    cost_total: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)
    returned_total: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)
    cash_account_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("cash_accounts.id", ondelete="RESTRICT")
    )
    status: Mapped[str] = mapped_column(String(16), nullable=False, default=InvoiceStatus.OPEN)
    ledger_group_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("ledger_groups.id", ondelete="SET NULL")
    )
    loan_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid
    )  # set when the sale settles a loan (loans module)
    fbr_invoice_no: Mapped[str | None] = mapped_column(String(60))
    notes: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )
    voided_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )
    void_reason: Mapped[str | None] = mapped_column(Text)

    lines: Mapped[list["InvoiceLine"]] = relationship(
        back_populates="invoice", cascade="all, delete-orphan", order_by="InvoiceLine.line_no"
    )


class InvoiceLine(UUIDPk, Base):
    __tablename__ = "invoice_lines"

    invoice_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False, index=True
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
    unit_price: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)
    discount_share: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)
    tax_share: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)
    line_total: Mapped[Decimal] = mapped_column(
        default=ZERO, nullable=False
    )  # what the customer pays for this line
    cost: Mapped[Decimal] = mapped_column(
        default=ZERO, nullable=False
    )  # device cost at the time of sale
    # owner 2026-10-30: the asking price when it was sold (after any revision at checkout)
    asking_price: Mapped[Decimal | None] = mapped_column()
    warranty_days: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    accessories_given: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    accessories_pending: Mapped[list[dict]] = mapped_column(JSON, nullable=False, default=list)
    returned_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))

    invoice: Mapped[Invoice] = relationship(back_populates="lines")


class HeldSale(UUIDPk, ShopScoped, Timestamped, Base):
    """A sale parked at the counter to finish later (POS "hold"). Only the cart as the screen had it:
    nothing is sold, no stock moves and no ledger entry is made until it is resumed and completed."""

    __tablename__ = "held_sales"

    label: Mapped[str | None] = mapped_column(String(80))
    total: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)
    items: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    cart: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )
