"""Login sessions (owner 2026-11-14, ADR-074): one row per sign-in on a phone or browser — who, how,
from where (IP, browser), when it started, when it was last used and when it ended. The tokens carry
its id (`sid`); an ended session stops working at its next request. Kept for every shop; the owner
sees them only when the super admin switches on the "Login activity" module."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, UUIDPk, utcnow


class LoginSession(UUIDPk, Base):
    __tablename__ = "login_sessions"

    organisation_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # password | pin | fingerprint | passkey | signup | reset | resumed (an older login seen again)
    method: Mapped[str] = mapped_column(String(12), nullable=False)
    ip: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String(300))
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ended_by: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    end_reason: Mapped[str | None] = mapped_column(String(20))  # logout | owner
