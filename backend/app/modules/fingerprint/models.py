"""Ways to log in with a fingerprint (owner, 2026-10-28).

kind "device": the Android app keeps a random secret in the phone's Keystore behind the fingerprint
               prompt; only its hash is stored here.
kind "passkey": a WebAuthn credential (the website): fingerprint / face / Windows Hello on that device.
Removing a key (revoked_at) stops that phone or browser from logging in.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, LargeBinary, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, Timestamped, UUIDPk


class LoginKey(UUIDPk, Timestamped, Base):
    __tablename__ = "login_keys"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kind: Mapped[str] = mapped_column(String(10), nullable=False)  # device | passkey
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    secret_hash: Mapped[str | None] = mapped_column(String(64))  # device: sha256 of the secret
    credential_id: Mapped[str | None] = mapped_column(
        String(400), unique=True
    )  # passkey, base64url
    public_key: Mapped[bytes | None] = mapped_column(LargeBinary)
    sign_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
