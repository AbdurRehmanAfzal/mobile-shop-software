"""Staff access requests (owner 2026-11-14, ADR-077): a salesman or technician asks for something
only the owner may allow (now: downloading the stock tally sheet's staff copy); the owner approves or
rejects it, and can take an approval back. One row per request; nothing is ever deleted."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, UUIDPk, utcnow

KINDS = ("stock_tally",)


class StaffAccess(UUIDPk, Base):
    __tablename__ = "staff_access"

    shop_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("shops.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    # pending | approved | rejected | revoked
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="pending")
    requested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    decided_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
