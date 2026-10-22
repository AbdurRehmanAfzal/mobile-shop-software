"""Verification record for a used device bought from a walk-in (FR-VER-01..04)."""

import uuid
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, ShopScoped, Timestamped, UUIDPk


class Verification(UUIDPk, ShopScoped, Timestamped, Base):
    __tablename__ = "verifications"

    device_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("devices.id", ondelete="CASCADE"), nullable=False, index=True
    )
    cycle_no: Mapped[int] = mapped_column(
        nullable=False, default=1
    )  # one record per purchase cycle
    purchase_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    seller_party_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("parties.id", ondelete="SET NULL")
    )
    cnic_no: Mapped[str | None] = mapped_column(String(15))
    cnic_front_path: Mapped[str | None] = mapped_column(String(300))
    cnic_back_path: Mapped[str | None] = mapped_column(String(300))
    seller_photo_path: Mapped[str | None] = mapped_column(String(300))
    device_photos: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    egadget_result: Mapped[str] = mapped_column(
        String(15), nullable=False, default="not_checked"
    )  # clear|flagged|not_checked
    egadget_ref: Mapped[str | None] = mapped_column(String(80))
    egadget_screenshot_path: Mapped[str | None] = mapped_column(String(300))
    pta_checked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    pta_result: Mapped[str | None] = mapped_column(String(20))
    declaration_signed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    declaration_path: Mapped[str | None] = mapped_column(String(300))
    physical_notes: Mapped[str | None] = mapped_column(Text)
    result: Mapped[str] = mapped_column(
        String(10), nullable=False, default="pending"
    )  # pending|clear|flagged
    missing: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    checked_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )
    checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    override_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )
    override_reason: Mapped[str | None] = mapped_column(Text)
    override_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
