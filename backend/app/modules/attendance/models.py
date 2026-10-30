"""Staff attendance / hazri (owner 2026-10-30): one row per person per day. The person checks in
and out from their phone; the owner can mark a day by hand (leave, absent, half day). Salary and
advances stay expenses; this only records who was there."""

import datetime as dt
import uuid

from sqlalchemy import Date, DateTime, ForeignKey, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, ShopScoped, Timestamped, UUIDPk

STATUSES = ("present", "half", "leave", "absent")


class Attendance(UUIDPk, ShopScoped, Timestamped, Base):
    __tablename__ = "attendance"
    __table_args__ = (UniqueConstraint("shop_id", "user_id", "day", name="uq_attendance_user_day"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    day: Mapped[dt.date] = mapped_column(Date, nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="present")
    in_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))
    out_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))
    note: Mapped[str | None] = mapped_column(String(300))
    # who wrote the row by hand; None = the person checked in themselves
    marked_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
