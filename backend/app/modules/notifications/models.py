"""Notification outbox (FR-RPT-04, FR-RPT-06). Messages are queued in the same transaction as the
document that caused them; a provider (WhatsApp Cloud API, SMTP) sends them later. Until a provider
is configured, WhatsApp rows carry a `wa.me` link the UI can open to share by hand."""

import datetime as dt
import uuid
from enum import StrEnum

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, ShopScoped, UUIDPk, utcnow


class Channel(StrEnum):
    WHATSAPP = "whatsapp"
    EMAIL = "email"


class MessageStatus(StrEnum):
    QUEUED = "queued"
    SENT = "sent"
    FAILED = "failed"
    SKIPPED = "skipped"


class Message(UUIDPk, ShopScoped, Base):
    __tablename__ = "messages"
    __table_args__ = (Index("ix_messages_shop_status", "shop_id", "status"),)

    channel: Mapped[str] = mapped_column(String(10), nullable=False)
    audience: Mapped[str] = mapped_column(String(10), nullable=False)  # owner|customer
    recipient: Mapped[str] = mapped_column(String(200), nullable=False)  # phone or email
    party_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("parties.id", ondelete="SET NULL")
    )
    template_key: Mapped[str] = mapped_column(String(40), nullable=False)
    lang: Mapped[str] = mapped_column(String(5), nullable=False)
    subject: Mapped[str | None] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text, nullable=False)
    link: Mapped[str | None] = mapped_column(Text)  # wa.me deep link for manual sharing
    event_type: Mapped[str] = mapped_column(String(30), nullable=False)  # sale|purchase|payment|...
    document_type: Mapped[str | None] = mapped_column(String(30))
    document_id: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    status: Mapped[str] = mapped_column(String(10), nullable=False, default=MessageStatus.QUEUED)
    provider: Mapped[str | None] = mapped_column(String(30))
    provider_id: Mapped[str | None] = mapped_column(String(120))
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    sent_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))
