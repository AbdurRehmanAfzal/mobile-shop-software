"""FBR Digital Invoicing submissions (docs/36 §4, ADR-050).

One row per bill sent (or waiting to be sent) to FBR. The bill itself never changes except for the
FBR invoice number written back on `invoices.fbr_invoice_no` once FBR accepts it. The request and
FBR's answer are kept for the record; a bill is never posted again once accepted.
"""

import uuid
from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, ShopScoped, Timestamped, UUIDPk


class FbrStatus:
    PENDING = "pending"  # waiting to be sent (or to be tried again)
    SENT = "sent"  # FBR accepted it and gave its number
    REJECTED = "rejected"  # FBR answered "invalid": the shop must fix something, then retry


class FbrSubmission(UUIDPk, ShopScoped, Timestamped, Base):
    __tablename__ = "fbr_submissions"
    __table_args__ = (
        UniqueConstraint("invoice_id", "kind", name="uq_fbr_submission_invoice_kind"),
    )

    invoice_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kind: Mapped[str] = mapped_column(String(12), nullable=False, default="sale")
    env: Mapped[str] = mapped_column(String(12), nullable=False, default="sandbox")
    status: Mapped[str] = mapped_column(
        String(12), nullable=False, default=FbrStatus.PENDING, index=True
    )
    fbr_invoice_no: Mapped[str | None] = mapped_column(String(60))
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_error: Mapped[str | None] = mapped_column(Text)
    request: Mapped[dict | None] = mapped_column(JSON)
    response: Mapped[dict | None] = mapped_column(JSON)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    next_try_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
