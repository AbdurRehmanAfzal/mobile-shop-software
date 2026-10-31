"""Offline-friendly renewal codes (the one-PC Windows install has no server to ask).

The provider signs `org_id · months · issued · nonce` with an Ed25519 private key that lives only on
the SaaS server (`RENEWAL_PRIVATE_KEY`); every install carries the public key
(`RENEWAL_PUBLIC_KEY`) and checks the signature locally. A code is tied to one organisation and is
redeemed once. `python -m app.modules.plan.renewal keygen` prints a fresh pair."""

import base64
import datetime as dt
import secrets
import uuid

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey

from app.core.config import settings
from app.core.errors import ValidationFailed

PREFIX = "MS1"  # code format version


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def _unb64(text: str) -> bytes:
    pad = "=" * (-len(text) % 4)
    return base64.urlsafe_b64decode(text + pad)


def keygen() -> tuple[str, str]:
    k = Ed25519PrivateKey.generate()
    priv = k.private_bytes(
        serialization.Encoding.Raw, serialization.PrivateFormat.Raw, serialization.NoEncryption()
    )
    pub = k.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
    return _b64(priv), _b64(pub)


def _payload(org_id: uuid.UUID, months: int, issued: dt.date, nonce: str) -> bytes:
    return f"{org_id.hex}|{months}|{issued.isoformat()}|{nonce}".encode()


def make_code(org_id: uuid.UUID, months: int, issued: dt.date | None = None) -> str:
    """Provider side: needs RENEWAL_PRIVATE_KEY."""
    if not settings.renewal_private_key:
        raise ValidationFailed(
            code="renewal_key_missing",
            message_en="RENEWAL_PRIVATE_KEY is not set on this server",
            message_ur="اس سرور پر RENEWAL_PRIVATE_KEY سیٹ نہیں ہے",
        )
    issued = issued or dt.date.today()
    nonce = secrets.token_hex(6)
    key = Ed25519PrivateKey.from_private_bytes(_unb64(settings.renewal_private_key))
    body = _payload(org_id, months, issued, nonce)
    sig = key.sign(body)
    return f"{PREFIX}.{_b64(body)}.{_b64(sig)}"


def parse_code(code: str) -> dict:
    """Checks the signature with the public key and returns org_id, months, issued, nonce.
    Raises ValidationFailed `renewal_code_invalid` on anything wrong."""
    bad = ValidationFailed(
        code="renewal_code_invalid",
        message_en="This renewal code is not valid. Copy it exactly as it was sent.",
        message_ur="یہ تجدیدی کوڈ درست نہیں۔ اسے ویسے ہی کاپی کریں جیسے بھیجا گیا تھا۔",
    )
    parts = "".join(code.split()).split(".")
    if len(parts) != 3 or parts[0] != PREFIX or not settings.renewal_public_key:
        raise bad
    try:
        body, sig = _unb64(parts[1]), _unb64(parts[2])
        pub = Ed25519PublicKey.from_public_bytes(_unb64(settings.renewal_public_key))
        pub.verify(sig, body)
        org_hex, months, issued, nonce = body.decode().split("|")
        return {
            "org_id": uuid.UUID(org_hex),
            "months": int(months),
            "issued": dt.date.fromisoformat(issued),
            "nonce": nonce,
        }
    except (ValueError, InvalidSignature) as exc:
        raise bad from exc


if __name__ == "__main__":  # pragma: no cover
    import sys

    if sys.argv[1:] == ["keygen"]:
        priv, pub = keygen()
        print(f"RENEWAL_PRIVATE_KEY={priv}\nRENEWAL_PUBLIC_KEY={pub}")
