"""Accessory stock (FR-ACC-01, FR-ACC-04): chargers, covers, glass... with a movement log."""

import datetime as dt
import uuid
from decimal import Decimal

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import ZERO, Base, ShopScoped, Timestamped, UUIDPk, utcnow

CATEGORIES = (
    "charger",
    "cable",
    "cover",
    "glass",
    "earphones",
    "battery",
    "memory",
    "sim_tray",
    "part",
    "power_bank",
    "speaker",
    "smart_band",
    "car_charger",
    "holder",
    "watch",  # ordinary watches, counted (smart watches are tracked one by one like phones)
    "other",
)


class Accessory(UUIDPk, ShopScoped, Timestamped, Base):
    __tablename__ = "accessories"
    __table_args__ = (UniqueConstraint("shop_id", "sku", name="uq_accessories_shop_sku"),)

    sku: Mapped[str] = mapped_column(String(40), nullable=False)
    # owner addendum 4: one barcode per SKU (made when the item is created), its type, maker's code
    barcode: Mapped[str | None] = mapped_column(String(64), index=True)
    barcode_type: Mapped[str | None] = mapped_column(String(12))
    manufacturer_code: Mapped[str | None] = mapped_column(String(64), index=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    name_ur: Mapped[str | None] = mapped_column(String(150))
    category: Mapped[str] = mapped_column(String(20), nullable=False, default="other")
    qty: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    avg_cost: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)
    price: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)
    reorder_level: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # owner addendum 5 (2026-10-31, docs/24): the product card. `qty` is always pieces (the base
    # unit); `price` is the retail price; `avg_cost` the weighted average cost per piece.
    brand: Mapped[str | None] = mapped_column(String(80), index=True)
    compatible: Mapped[str | None] = mapped_column(String(200))  # free text: "iPhone 14/15"
    compatible_model_ids: Mapped[list | None] = mapped_column(JSON)  # links into the model list
    grade: Mapped[str] = mapped_column(String(20), default="unspecified", server_default="unspecified", nullable=False)
    color: Mapped[str | None] = mapped_column(String(40))
    size: Mapped[str | None] = mapped_column(String(40))
    capacity: Mapped[str | None] = mapped_column(String(40))  # mAh / GB
    connector: Mapped[str | None] = mapped_column(String(40))  # Type-C / Lightning / Micro-USB
    wattage: Mapped[str | None] = mapped_column(String(20))
    warranty_days: Mapped[int] = mapped_column(Integer, default=0, server_default="0", nullable=False)
    warranty_terms: Mapped[str | None] = mapped_column(String(300))
    warranty_by: Mapped[str | None] = mapped_column(String(10))  # shop | supplier
    unit: Mapped[str] = mapped_column(String(12), default="piece", server_default="piece", nullable=False)
    pack_units: Mapped[dict | None] = mapped_column(JSON)  # this item's own {"box": 20}
    wholesale_price: Mapped[Decimal | None] = mapped_column()
    min_price: Mapped[Decimal | None] = mapped_column()
    promo_price: Mapped[Decimal | None] = mapped_column()
    promo_from: Mapped[dt.date | None] = mapped_column(Date)
    promo_to: Mapped[dt.date | None] = mapped_column(Date)
    pricing_mode: Mapped[str] = mapped_column(String(8), default="fixed", server_default="fixed", nullable=False)  # fixed | markup
    markup_pct: Mapped[Decimal | None] = mapped_column()
    tax_rate: Mapped[Decimal | None] = mapped_column()
    tax_inclusive: Mapped[bool | None] = mapped_column(Boolean)
    max_stock: Mapped[int | None] = mapped_column(Integer)
    location: Mapped[str | None] = mapped_column(String(60))
    show_in_sale: Mapped[bool] = mapped_column(Boolean, default=True, server_default="1", nullable=False)
    image_path: Mapped[str | None] = mapped_column(String(500))
    description: Mapped[str | None] = mapped_column(Text)


class AccessoryMovement(UUIDPk, ShopScoped, Base):
    __tablename__ = "accessory_movements"

    accessory_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("accessories.id", ondelete="CASCADE"), nullable=False, index=True
    )
    qty_delta: Mapped[int] = mapped_column(Integer, nullable=False)
    qty_after: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[str] = mapped_column(
        String(20), nullable=False
    )  # purchase|sale|repair|adjust|return|void
    unit_cost: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)
    document_type: Mapped[str | None] = mapped_column(String(30))
    document_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    note: Mapped[str | None] = mapped_column(String(200))
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )
    at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class AccessoryBatch(UUIDPk, ShopScoped, Base):
    """One purchase (or opening / return) lot: what it cost and how many of it are still here.
    Never edited after the fact; `qty_left` only goes down as pieces are sold (FIFO)."""

    __tablename__ = "accessory_batches"

    accessory_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("accessories.id", ondelete="CASCADE"), nullable=False, index=True
    )
    source: Mapped[str] = mapped_column(String(12), nullable=False)  # purchase|opening|return|adjust
    document_type: Mapped[str | None] = mapped_column(String(30))
    document_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    party_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("parties.id", ondelete="SET NULL"))
    date: Mapped[dt.date] = mapped_column(Date, nullable=False)
    qty_in: Mapped[int] = mapped_column(Integer, nullable=False)
    qty_left: Mapped[int] = mapped_column(Integer, nullable=False)
    unit_cost: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)
    pack_unit: Mapped[str | None] = mapped_column(String(12))
    pack_qty: Mapped[int | None] = mapped_column(Integer)
    batch_ref: Mapped[str | None] = mapped_column(String(40))
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class AccessoryPriceChange(UUIDPk, ShopScoped, Base):
    """Cost / retail / wholesale / minimum price history, one row per change."""

    __tablename__ = "accessory_price_changes"

    accessory_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("accessories.id", ondelete="CASCADE"), nullable=False, index=True
    )
    field: Mapped[str] = mapped_column(String(20), nullable=False)
    old_value: Mapped[Decimal | None] = mapped_column()
    new_value: Mapped[Decimal | None] = mapped_column()
    source: Mapped[str] = mapped_column(String(12), default="edit", nullable=False)  # edit|purchase|bulk|markup
    user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("users.id", ondelete="SET NULL"))
    at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class AccessorySupplierSku(UUIDPk, ShopScoped, Base):
    """The code a supplier uses for this item (several suppliers per item)."""

    __tablename__ = "accessory_supplier_skus"

    accessory_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("accessories.id", ondelete="CASCADE"), nullable=False, index=True
    )
    party_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("parties.id", ondelete="SET NULL"), index=True)
    sku: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
