"""Reminder state per user (server-side, so a snooze holds across phones) and the renewal codes
that were already used (each code works once)."""

import datetime as dt
import uuid

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, UUIDPk, utcnow


class PlanReminderState(UUIDPk, Base):
    __tablename__ = "plan_reminder_states"
    __table_args__ = (UniqueConstraint("user_id", name="uq_plan_reminder_user"),)

    organisation_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    stage: Mapped[str | None] = mapped_column(String(16))  # the stage the snooze was taken in
    snoozed_until: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))
    last_shown_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))
    times_snoozed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # the approved payment whose "thank you, renewed until …" this user has already seen
    thanked_payment_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )


class PlanRenewalCode(UUIDPk, Base):
    """A signed renewal code that was redeemed (so it cannot be pasted twice)."""

    __tablename__ = "plan_renewal_codes"

    organisation_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    nonce: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    months: Mapped[int] = mapped_column(Integer, nullable=False)
    redeemed_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )
    redeemed_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
