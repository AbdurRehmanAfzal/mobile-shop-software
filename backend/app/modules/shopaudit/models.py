"""Derived caches for the Shop Audit (owner decision 2026-10-31). Never a source of truth."""

import datetime as dt
import uuid
from decimal import Decimal

from sqlalchemy import Date, DateTime, ForeignKey, Integer, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import ZERO, Base, UUIDPk, utcnow


class StockSnapshot(UUIDPk, Base):
    """phones in stock at the end of a shop day, with their value — rebuilt from device events"""

    __tablename__ = "stock_snapshots"
    __table_args__ = (UniqueConstraint("shop_id", "day", name="uq_stock_snapshots_shop_day"),)

    shop_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("shops.id", ondelete="CASCADE"), nullable=False, index=True
    )
    day: Mapped[dt.date] = mapped_column(Date, nullable=False)
    count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    cost_value: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)
    asking_value: Mapped[Decimal] = mapped_column(default=ZERO, nullable=False)
    taken_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
