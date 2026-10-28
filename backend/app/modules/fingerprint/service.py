"""Fingerprint login: who may use it, device keys for the app, passkeys for the website."""

import hashlib
import hmac
import json
import secrets
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session
from webauthn import (
    generate_authentication_options,
    generate_registration_options,
    options_to_json,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers import base64url_to_bytes, bytes_to_base64url
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    PublicKeyCredentialDescriptor,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)

from app.core.config import settings
from app.core.errors import Forbidden, NotFound, Unauthorized, ValidationFailed
from app.core.permissions import Role
from app.core.security import create_challenge_token, decode_token
from app.db.base import utcnow
from app.modules.auth.models import Shop, User, UserShop
from app.modules.fingerprint.models import LoginKey

ORIGINS = lambda: [o.strip() for o in settings.webauthn_origins.split(",") if o.strip()]


def allowed(db: Session, user: User) -> bool:
    """The owner always; staff only when the owner has switched it on for one of their shops."""
    if user.role == Role.OWNER:
        return True
    return bool(
        db.scalar(
            select(Shop.id)
            .join(UserShop, UserShop.shop_id == Shop.id)
            .where(UserShop.user_id == user.id, Shop.fingerprint_staff.is_(True))
        )
    )


def _need_allowed(db: Session, user: User) -> None:
    if not user.is_active or not allowed(db, user):
        raise Forbidden(
            code="fingerprint_not_allowed",
            message_en="Fingerprint login is not switched on for you. Ask the shop owner.",
            message_ur="آپ کے لیے فنگر پرنٹ لاگ اِن آن نہیں۔ دکان کے مالک سے کہیں۔",
        )


def _hash(secret: str) -> str:
    return hashlib.sha256(secret.encode()).hexdigest()


def _refuse() -> Unauthorized:
    return Unauthorized(
        code="fingerprint_failed",
        message_en="Fingerprint login did not work. Log in with your password and switch it on again.",
        message_ur="فنگر پرنٹ لاگ اِن نہیں ہوا۔ پاس ورڈ سے لاگ اِن کر کے دوبارہ آن کریں۔",
    )


def _usable(db: Session, key: LoginKey | None) -> User:
    if key is None or key.revoked_at is not None:
        raise _refuse()
    user = db.get(User, key.user_id)
    if user is None:
        raise _refuse()
    _need_allowed(db, user)
    key.last_used_at = utcnow()
    user.last_login_at = utcnow()
    return user


# ---- app (device key) -----------------------------------------------------------------------


def add_device(db: Session, user: User, name: str) -> dict:
    _need_allowed(db, user)
    secret = secrets.token_urlsafe(32)
    key = LoginKey(user_id=user.id, kind="device", name=name, secret_hash=_hash(secret))
    db.add(key)
    db.commit()
    return {"key_id": key.id, "secret": secret}


def device_login(db: Session, key_id: uuid.UUID, secret: str) -> User:
    key = db.get(LoginKey, key_id)
    if (
        key is None
        or key.kind != "device"
        or not hmac.compare_digest(key.secret_hash or "", _hash(secret))
    ):
        raise _refuse()
    user = _usable(db, key)
    db.commit()
    return user


# ---- website (passkey) ----------------------------------------------------------------------


def passkey_register_options(db: Session, user: User) -> dict:
    _need_allowed(db, user)
    existing = db.scalars(
        select(LoginKey).where(
            LoginKey.user_id == user.id, LoginKey.kind == "passkey", LoginKey.revoked_at.is_(None)
        )
    ).all()
    opts = generate_registration_options(
        rp_id=settings.webauthn_rp_id,
        rp_name="Mobile Shop",
        user_id=user.id.bytes,
        user_name=user.phone,
        user_display_name=user.name,
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.REQUIRED,
            user_verification=UserVerificationRequirement.REQUIRED,
        ),
        exclude_credentials=[
            PublicKeyCredentialDescriptor(id=base64url_to_bytes(k.credential_id)) for k in existing
        ],
    )
    return {
        "options": json.loads(options_to_json(opts)),
        "token": create_challenge_token(bytes_to_base64url(opts.challenge), user.id),
    }


def passkey_register(db: Session, user: User, credential: dict, token: str, name: str) -> None:
    _need_allowed(db, user)
    claims = decode_token(token, "challenge")
    if claims.get("sub") != str(user.id):
        raise _refuse()
    try:
        v = verify_registration_response(
            credential=credential,
            expected_challenge=base64url_to_bytes(claims["ch"]),
            expected_rp_id=settings.webauthn_rp_id,
            expected_origin=ORIGINS(),
            require_user_verification=True,
        )
    except Exception as exc:
        raise ValidationFailed(code="passkey_invalid") from exc
    db.add(
        LoginKey(
            user_id=user.id,
            kind="passkey",
            name=name,
            credential_id=bytes_to_base64url(v.credential_id),
            public_key=v.credential_public_key,
            sign_count=v.sign_count,
        )
    )
    db.commit()


def passkey_login_options() -> dict:
    opts = generate_authentication_options(
        rp_id=settings.webauthn_rp_id, user_verification=UserVerificationRequirement.REQUIRED
    )
    return {
        "options": json.loads(options_to_json(opts)),
        "token": create_challenge_token(bytes_to_base64url(opts.challenge)),
    }


def passkey_login(db: Session, credential: dict, token: str) -> User:
    claims = decode_token(token, "challenge")
    key = db.scalar(
        select(LoginKey).where(
            LoginKey.kind == "passkey", LoginKey.credential_id == credential.get("id")
        )
    )
    if key is None:
        raise _refuse()
    try:
        v = verify_authentication_response(
            credential=credential,
            expected_challenge=base64url_to_bytes(claims["ch"]),
            expected_rp_id=settings.webauthn_rp_id,
            expected_origin=ORIGINS(),
            credential_public_key=key.public_key,
            credential_current_sign_count=key.sign_count,
            require_user_verification=True,
        )
    except Exception as exc:
        raise _refuse() from exc
    user = _usable(db, key)
    key.sign_count = v.new_sign_count
    db.commit()
    return user


# ---- list / remove --------------------------------------------------------------------------


def list_keys(db: Session, user: User) -> list[LoginKey]:
    """Your own keys; the owner also sees the staff's keys of the same organisation."""
    stmt = (
        select(LoginKey)
        .join(User, User.id == LoginKey.user_id)
        .where(LoginKey.revoked_at.is_(None))
    )
    if user.role == Role.OWNER:
        stmt = stmt.where(User.organisation_id == user.organisation_id)
    else:
        stmt = stmt.where(LoginKey.user_id == user.id)
    return list(db.scalars(stmt.order_by(LoginKey.created_at.desc())).all())


def remove_key(db: Session, user: User, key_id: uuid.UUID) -> None:
    key = db.get(LoginKey, key_id)
    owner = db.get(User, key.user_id) if key else None
    mine = key is not None and key.user_id == user.id
    org_owner = (
        owner is not None
        and user.role == Role.OWNER
        and owner.organisation_id == user.organisation_id
    )
    if key is None or not (mine or org_owner):
        raise NotFound(code="key_not_found")
    key.revoked_at = utcnow()
    db.commit()
