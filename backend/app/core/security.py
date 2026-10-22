import uuid
from datetime import UTC, datetime, timedelta
from typing import Literal

import bcrypt
import jwt

from app.core.config import settings
from app.core.errors import Unauthorized

TokenType = Literal["access", "refresh"]


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
