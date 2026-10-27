"""Accessory stock (FR-ACC-01, FR-ACC-04): chargers, covers, glass... with a movement log."""

import datetime as dt
import uuid
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint, Uuid
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
    "other",
)


class Accessory(UUIDPk, ShopScoped, Timestamped, Base):
    __tablename__ = "accessories"
    __table_args__ = (UniqueConstraint("shop_id", "sku", name="uq_accessories_shop_sku"),)

    sku: Mapped[str] = mapped_column(String(40), nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    name_ur: Mapped[str | None] = mapped_column(String(150))
    category: Mapped[str] = mapped_column(String(20), nullable=False, default="other")
    qty: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    avg_cost: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)
    price: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)
    reorder_level: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


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
