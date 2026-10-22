"""Catalogue: brands, models, storages, colours (FR-MST-01, FR-MST-02).

Rows with `shop_id IS NULL` are the global catalogue every shop sees; a shop can add its own
rows (shop_id set) which only it sees. Uniqueness of names within a scope is enforced in the
service because NULL shop_id rows are not covered by a unique index.
"""

import uuid
from decimal import Decimal

from sqlalchemy import Boolean, ForeignKey, Index, Integer, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, Timestamped, UUIDPk


class Brand(UUIDPk, Timestamped, Base):
    __tablename__ = "brands"
    __table_args__ = (Index("ix_brands_shop_name", "shop_id", "name"),)

    shop_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("shops.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    name_ur: Mapped[str | None] = mapped_column(String(100))
    sort_order: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    models: Mapped[list["Model"]] = relationship(back_populates="brand")


class Model(UUIDPk, Timestamped, Base):
    __tablename__ = "models"
    __table_args__ = (Index("ix_models_shop_brand_name", "shop_id", "brand_id", "name"),)

    shop_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("shops.id", ondelete="CASCADE"), index=True
    )
    brand_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("brands.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    name_ur: Mapped[str | None] = mapped_column(String(150))
    reference_price: Mapped[Decimal | None] = (
        mapped_column()
    )  # indicative new price in PKR, optional
    is_feature_phone: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    brand: Mapped[Brand] = relationship(back_populates="models")


class Storage(UUIDPk, Base):
    __tablename__ = "storages"

    shop_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("shops.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(20), nullable=False)  # "128GB"
    name_ur: Mapped[str | None] = mapped_column(String(40))
    gigabytes: Mapped[int] = mapped_column(Integer, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=100, nullable=False)


class Colour(UUIDPk, Base):
    __tablename__ = "colours"

    shop_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("shops.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    name_ur: Mapped[str | None] = mapped_column(String(50))
    hex: Mapped[str | None] = mapped_column(String(7))
    sort_order: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
