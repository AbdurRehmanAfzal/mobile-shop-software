import uuid
from datetime import UTC, datetime, timedelta
from typing import Literal

import bcrypt
import jwt

from app.core.config import settings
from app.core.errors import Unauthorized

TokenType = Literal["access", "refresh", "link", "challenge"]


def hash_password(raw: str) -> str:
    return bcrypt.hashpw(raw.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def verify_password(raw: str, hashed: str | None) -> bool:
    if not hashed:
        return False
    try:
        return bcrypt.checkpw(raw.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


def hash_pin(pin: str) -> str:
    # PINs are short; bcrypt is still fine because attempts are rate-limited server-side.
    return hash_password(pin)


def create_token(user_id: uuid.UUID, organisation_id: uuid.UUID, token_type: TokenType) -> str:
    now = datetime.now(UTC)
    if token_type == "access":
        exp = now + timedelta(minutes=settings.access_token_minutes)
    else:
        exp = now + timedelta(days=settings.refresh_token_days)
    payload = {
        "sub": str(user_id),
        "org": str(organisation_id),
        "typ": token_type,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
        "jti": uuid.uuid4().hex,
    }
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")


LINK_SECONDS = 120


def create_link_token(user_id: uuid.UUID, shop_id: uuid.UUID, target: str) -> str:
    """A 2-minute token that opens exactly one GET address (path + query) as this user, in this
    shop. The Android app uses it to show a print page or a download in Chrome, which cannot send
    the app's Authorization header (owner, 2026-10-28)."""
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "shop": str(shop_id),
        "typ": "link",
        "target": target,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=LINK_SECONDS)).timestamp()),
    }
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")


def create_challenge_token(challenge: str, user_id: uuid.UUID | None = None) -> str:
    """Carries a WebAuthn challenge to the next request for 5 minutes (no server-side session)."""
    now = datetime.now(UTC)
    payload = {
        "typ": "challenge",
        "ch": challenge,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=5)).timestamp()),
    }
    if user_id:  # PyJWT accepts "sub" only as a string, so it is left out for a login challenge
        payload["sub"] = str(user_id)
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")


def decode_token(token: str, expected_type: TokenType) -> dict:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
    except jwt.ExpiredSignatureError as exc:
        raise Unauthorized(
            code="token_expired",
            message_en="Session expired, please log in again",
            message_ur="سیشن ختم ہو گیا، دوبارہ لاگ اِن کریں",
        ) from exc
    except jwt.PyJWTError as exc:
        raise Unauthorized(code="token_invalid") from exc
    if payload.get("typ") != expected_type:
        raise Unauthorized(code="token_wrong_type")
    return payload
