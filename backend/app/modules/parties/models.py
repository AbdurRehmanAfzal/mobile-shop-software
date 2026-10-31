"""Parties: customers, suppliers, other shops and outside technicians in one table (FR-MST-03).

`balance` is a CACHE of the ledger (positive = party owes the shop). Only the ledger posting
service may write it; it is recomputed from `ledger_entries`, never edited by hand.
"""

from decimal import Decimal
from enum import StrEnum

from sqlalchemy import JSON, Boolean, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import ZERO, Base, ShopScoped, Timestamped, UUIDPk


class PartyKind(StrEnum):
    CUSTOMER = "customer"
    SUPPLIER = "supplier"
    SHOP = "shop"  # another mobile shop (loans, wholesale)
    TECHNICIAN = "technician"  # outside repair technician


class Party(UUIDPk, ShopScoped, Timestamped, Base):
    __tablename__ = "parties"
    __table_args__ = (UniqueConstraint("shop_id", "phone", name="uq_parties_shop_phone"),)

    name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    name_ur: Mapped[str | None] = mapped_column(String(200))
    phone: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    alt_phone: Mapped[str | None] = mapped_column(String(20))
    whatsapp: Mapped[str | None] = mapped_column(String(20))
    cnic: Mapped[str | None] = mapped_column(String(15), index=True)
    address: Mapped[str | None] = mapped_column(Text)
    city: Mapped[str | None] = mapped_column(String(100))
    photo_path: Mapped[str | None] = mapped_column(String(500))
    kinds: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    notes: Mapped[str | None] = mapped_column(Text)
    balance: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # owner addendum 5: a dealer / wholesale customer gets the wholesale price of items
    wholesale: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0", nullable=False)
