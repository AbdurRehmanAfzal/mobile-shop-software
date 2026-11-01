"""License (renewal) keys the product owner issues (docs/28): every key is kept — who it is for, its
months, when it was sent and how, whether the shop opened its magic link, redeemed it, or it was
revoked. Before this, a code was only remembered once redeemed, so a lost key could not be found
again. The key itself is the signed renewal code of `plan/renewal.py` (works offline)."""

import datetime as dt
import secrets
import uuid
from urllib.parse import quote

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, Uuid, select
from sqlalchemy.orm import Mapped, Session, mapped_column

from app.core.errors import Conflict, NotFound
from app.db.base import Base, UUIDPk, utcnow

ISSUED, REDEEMED, REVOKED = "issued", "redeemed", "revoked"
LINK_DAYS = 7


class LicenseKey(UUIDPk, Base):
    __tablename__ = "license_keys"

    organisation_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("organisations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    shop_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("shops.id", ondelete="CASCADE"), nullable=False, index=True
    )
    nonce: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    months: Mapped[int] = mapped_column(Integer, nullable=False)
    code: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(10), default=ISSUED, nullable=False, index=True)
    note: Mapped[str | None] = mapped_column(String(200))
    issued_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="SET NULL")
    )
    issued_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    redeemed_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))
    redeemed_where: Mapped[str | None] = mapped_column(String(10))  # cloud | local
    revoked_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))
    revoke_reason: Mapped[str | None] = mapped_column(String(200))
    renewed_from: Mapped[uuid.UUID | None] = mapped_column(Uuid)
    sent_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_sent_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))
    last_sent_via: Mapped[str | None] = mapped_column(String(12))  # whatsapp | sms | copy | link
    view_token: Mapped[str | None] = mapped_column(String(48), unique=True, index=True)
    view_expires_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))
    view_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_viewed_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True))


def _aware(t: dt.datetime | None) -> dt.datetime | None:
    if t is not None and t.tzinfo is None:
        return t.replace(tzinfo=dt.UTC)
    return t


def issue(db: Session, shop, by_user_id: uuid.UUID | None, months: int, note: str | None = None, renewed_from: uuid.UUID | None = None) -> LicenseKey:
    from app.modules.plan import renewal

    code = renewal.make_code(shop.organisation_id, months)
    nonce = renewal.parse_nonce(code)
    k = LicenseKey(
        organisation_id=shop.organisation_id,
        shop_id=shop.id,
        nonce=nonce,
        months=months,
        code=code,
        note=note,
        issued_by=by_user_id,
        renewed_from=renewed_from,
    )
    new_link(k)
    db.add(k)
    db.flush()
    return k


def new_link(k: LicenseKey) -> None:
    k.view_token = secrets.token_urlsafe(24)
    k.view_expires_at = utcnow() + dt.timedelta(days=LINK_DAYS)


def get(db: Session, key_id: uuid.UUID) -> LicenseKey:
    k = db.get(LicenseKey, key_id)
    if k is None:
        raise NotFound()
    return k


def revoke(k: LicenseKey, reason: str | None) -> None:
    if k.status == REDEEMED:
        raise Conflict(
            code="key_redeemed",
            message_en="This key was already used; it cannot be revoked",
            message_ur="یہ کی استعمال ہو چکی ہے؛ اب منسوخ نہیں ہو سکتی",
        )
    k.status = REVOKED
    k.revoked_at = utcnow()
    k.revoke_reason = reason
    k.view_token = None


def mark_sent(k: LicenseKey, via: str) -> None:
    k.sent_count += 1
    k.last_sent_at = utcnow()
    k.last_sent_via = via


def mark_redeemed(db: Session, nonce: str, where: str) -> None:
    k = db.scalar(select(LicenseKey).where(LicenseKey.nonce == nonce))
    if k is not None and k.status != REDEEMED:
        k.status = REDEEMED
        k.redeemed_at = utcnow()
        k.redeemed_where = where


def is_revoked(db: Session, nonce: str) -> bool:
    return db.scalar(
        select(LicenseKey.id).where(LicenseKey.nonce == nonce, LicenseKey.status == REVOKED)
    ) is not None


def by_token(db: Session, token: str) -> LicenseKey:
    k = db.scalar(select(LicenseKey).where(LicenseKey.view_token == token))
    if k is None or k.status == REVOKED or (_aware(k.view_expires_at) or utcnow()) < utcnow():
        raise NotFound(
            code="key_link_expired",
            message_en="This link has expired. Ask the software provider to send it again.",
            message_ur="یہ لنک ختم ہو چکا ہے۔ سافٹ ویئر فراہم کرنے والے سے دوبارہ بھیجنے کو کہیں۔",
        )
    return k


def link_url(k: LicenseKey, site: str) -> str | None:
    return f"{site.rstrip('/')}/key/{k.view_token}" if k.view_token else None


def message(k: LicenseKey, shop_name: str, site: str) -> str:
    url = link_url(k, site)
    lines = [
        f"{shop_name} — Mobile Shop renewal key ({k.months} month{'s' if k.months != 1 else ''})",
        k.code,
        "More → Software fees → Renewal code → paste → Renew",
    ]
    if url:
        lines.append(f"Open: {url}")
    return "\n".join(lines)


def share_links(k: LicenseKey, shop_name: str, phone: str | None, site: str) -> dict:
    text = message(k, shop_name, site)
    num = (phone or "").lstrip("0")
    return {
        "whatsapp": f"https://wa.me/92{num}?text={quote(text)}" if num else f"https://wa.me/?text={quote(text)}",
        "sms": f"sms:{phone or ''}?body={quote(text)}",
        "text": text,
        "link": link_url(k, site),
    }


def to_out(k: LicenseKey, shop_name: str | None = None) -> dict:
    exp = _aware(k.view_expires_at)
    return {
        "id": str(k.id),
        "shop_id": str(k.shop_id),
        "shop_name": shop_name,
        "months": k.months,
        "code": k.code,
        "status": k.status,
        "note": k.note,
        "issued_at": k.issued_at,
        "redeemed_at": k.redeemed_at,
        "redeemed_where": k.redeemed_where,
        "revoked_at": k.revoked_at,
        "revoke_reason": k.revoke_reason,
        "renewed_from": str(k.renewed_from) if k.renewed_from else None,
        "sent_count": k.sent_count,
        "last_sent_at": k.last_sent_at,
        "last_sent_via": k.last_sent_via,
        "link_active": bool(k.view_token and exp and exp > utcnow()),
        "link_expires_at": exp,
        "view_count": k.view_count,
        "last_viewed_at": k.last_viewed_at,
    }
