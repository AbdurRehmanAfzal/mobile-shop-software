"""OTP by WhatsApp (Meta Cloud API when configured). Without a sender the code cannot go anywhere:
the response says `delivery: none` and the app falls back to the request-to-owner flow. In dev and
e2e, OTP_DEV_ECHO=true returns the code in the response instead of sending it."""

import datetime as dt
import hashlib
import hmac
import secrets
import time

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import AppError, ValidationFailed
from app.core.ratelimit import FailureLimiter
from app.db.base import utcnow
from app.modules.auth.models import User
from app.modules.notifications import provider
from app.modules.notifications.templates import TEMPLATES
from app.modules.otp.models import PURPOSES, OtpCode

TTL = dt.timedelta(minutes=10)
MAX_ATTEMPTS = 5
TOKEN_TTL = 15 * 60
send_limiter = FailureLimiter(max_failures=3, window_seconds=600)  # 3 codes per number per 10 min


class OtpInvalid(AppError):
    status_code = 400
    code = "otp_invalid"
    message_en = "Wrong or expired code"
    message_ur = "کوڈ غلط ہے یا ختم ہو چکا ہے"


def _hash(phone: str, purpose: str, code: str) -> str:
    return hmac.new(
        settings.secret_key.encode(), f"{purpose}:{phone}:{code}".encode(), hashlib.sha256
    ).hexdigest()


def _registered(db: Session, phone: str) -> User | None:
    return db.scalar(select(User).where(User.phone == phone, User.is_active.is_(True)))


def send(db: Session, phone: str, purpose: str, lang: str = "ur") -> dict:
    if purpose not in PURPOSES:
        raise ValidationFailed(code="bad_purpose")
    user = _registered(db, phone)
    if purpose == "reset" and user is None:
        return {"delivery": "unknown"}  # nothing is revealed beyond "not registered"
    if purpose == "signup" and user is not None:
        return {"delivery": "registered"}
    send_limiter.check(f"otp:{phone}")
    send_limiter.fail(f"otp:{phone}")
    code = f"{secrets.randbelow(1_000_000):06d}"
    channel = "none"
    out: dict = {}
    body = TEMPLATES["otp"][lang if lang in ("en", "ur") else "ur"]["body"].format(code=code)
    if settings.otp_dev_echo:
        channel = "echo"
        out["dev_code"] = code
    elif provider.configured():
        try:
            provider.send_whatsapp(phone, body, "otp")
            channel = "whatsapp"
        except Exception:  # noqa: BLE001 - the sender's error is not the caller's problem
            channel = "none"
    if channel == "none":
        return {"delivery": "none"}
    db.add(
        OtpCode(
            phone=phone,
            purpose=purpose,
            code_hash=_hash(phone, purpose, code),
            channel=channel,
            expires_at=utcnow() + TTL,
        )
    )
    db.commit()
    return {"delivery": channel, **out}


def verify(db: Session, phone: str, purpose: str, code: str) -> str:
    """Burns the code; returns a short-lived token the next step presents."""
    row = db.scalar(
        select(OtpCode)
        .where(OtpCode.phone == phone, OtpCode.purpose == purpose, OtpCode.used_at.is_(None))
        .order_by(OtpCode.created_at.desc())
    )
    now = utcnow()
    if row is None:
        raise OtpInvalid()
    # SQLite hands back naive datetimes for timezone-aware columns
    exp = row.expires_at if row.expires_at.tzinfo else row.expires_at.replace(tzinfo=dt.UTC)
    if exp < now or row.attempts >= MAX_ATTEMPTS:
        raise OtpInvalid()
    row.attempts += 1
    ok = hmac.compare_digest(row.code_hash, _hash(phone, purpose, code.strip()))
    if not ok:
        db.commit()
        raise OtpInvalid()
    row.used_at = now
    db.commit()
    return make_token(phone, purpose)


def make_token(phone: str, purpose: str) -> str:
    exp = int(time.time()) + TOKEN_TTL
    msg = f"{purpose}:{phone}:{exp}"
    sig = hmac.new(settings.secret_key.encode(), msg.encode(), hashlib.sha256).hexdigest()[:32]
    return f"{exp}.{sig}"


def check_token(phone: str, purpose: str, token: str | None) -> bool:
    if not token or "." not in token:
        return False
    exp_s, sig = token.split(".", 1)
    if not exp_s.isdigit() or int(exp_s) < time.time():
        return False
    msg = f"{purpose}:{phone}:{exp_s}"
    want = hmac.new(settings.secret_key.encode(), msg.encode(), hashlib.sha256).hexdigest()[:32]
    return hmac.compare_digest(want, sig)


def token_used(db: Session, token: str) -> bool:
    return (
        db.scalar(
            select(OtpCode).where(OtpCode.purpose == "used_token", OtpCode.code_hash == token[-64:])
        )
        is not None
    )


def burn_token(db: Session, token: str) -> None:
    db.add(
        OtpCode(
            phone="-",
            purpose="used_token",
            code_hash=token[-64:],
            channel="none",
            expires_at=utcnow() + dt.timedelta(seconds=TOKEN_TTL),
            used_at=utcnow(),
        )
    )
    db.commit()
