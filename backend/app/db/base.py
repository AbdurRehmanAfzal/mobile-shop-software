"""Declarative base and mixins shared by every model.

- UUID primary keys (portable across SQLite and PostgreSQL via SQLAlchemy's `Uuid`).
- `Timestamped`: created_at / updated_at in UTC.
- `ShopScoped`: `shop_id` FK + index. Every tenant-owned table uses it.
- `Money`: Numeric(14, 2). Never Float.
"""

import uuid
from datetime import UTC, datetime
from decimal import Decimal
from typing import ClassVar

from sqlalchemy import DateTime, ForeignKey, Numeric, Uuid
from sqlalchemy.orm import DeclarativeBase, Mapped, declared_attr, mapped_column

Money = Numeric(14, 2)
ZERO = Decimal("0.00")


def utcnow() -> datetime:
    return datetime.now(UTC)


class Base(DeclarativeBase):
    type_annotation_map: ClassVar[dict] = {Decimal: Money}


class UUIDPk:
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)


class Timestamped:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )


class ShopScoped:
    @declared_attr
    def shop_id(cls) -> Mapped[uuid.UUID]:
        return mapped_column(
            Uuid, ForeignKey("shops.id", ondelete="RESTRICT"), nullable=False, index=True
        )
