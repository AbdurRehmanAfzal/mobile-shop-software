"""Password / PIN history (owner 2026-11-15, ADR-088): every time a password or PIN is set, changed,
removed or reset — whose, which, by whom (self, the shop owner, the super admin, an SMS / WhatsApp
code), from which phone / browser and when. The password or PIN itself is never kept: only its
one-way hash on the user, as always, so nobody — not even the super admin — can read it."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, UUIDPk, utcnow


class CredentialChange(UUIDPk, Base):
    __tablename__ = "credential_changes"

    organisation_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kind: Mapped[str] = mapped_column(String(10), nullable=False)  # password | pin
    action: Mapped[str] = mapped_column(
        String(10), nullable=False
    )  # set | changed | removed | reset
    by_user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    by_kind: Mapped[str] = mapped_column(
        String(12), nullable=False
    )  # self | owner | super_admin | code
    ip: Mapped[str | None] = mapped_column(String(64))
    user_agent: Mapped[str | None] = mapped_column(String(300))
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
