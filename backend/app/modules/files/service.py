"""File storage behind one interface. Local disk now; S3-compatible later (docs/03).

Paths returned to clients are relative: `<shop_id>/<uuid>.<ext>`; the shop prefix is what makes
cross-tenant reads impossible (see router).
"""

import uuid
from pathlib import Path

from app.core.config import settings
from app.core.errors import NotFound, ValidationFailed

ALLOWED = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "application/pdf": "pdf",
}
MAX_BYTES = 8 * 1024 * 1024


def _root() -> Path:
    root = Path(settings.upload_dir).resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def save(shop_id: uuid.UUID, content_type: str, data: bytes, purpose: str = "misc") -> str:
    ext = ALLOWED.get(content_type)
    if ext is None:
        raise ValidationFailed(
            code="file_type",
            message_en="Only JPG, PNG, WEBP or PDF files are allowed",
            message_ur="صرف JPG، PNG، WEBP یا PDF فائلیں قبول ہیں",
        )
    if len(data) > MAX_BYTES:
        raise ValidationFailed(
            code="file_too_large",
            message_en="File larger than 8 MB",
            message_ur="فائل 8 MB سے بڑی ہے",
        )
    if not data:
        raise ValidationFailed(code="file_empty")
    folder = _root() / str(shop_id)
    folder.mkdir(parents=True, exist_ok=True)
    name = f"{purpose}-{uuid.uuid4().hex}.{ext}"
    (folder / name).write_bytes(data)
    return f"{shop_id}/{name}"


def resolve(shop_id: uuid.UUID, rel_path: str) -> Path:
    """Return the on-disk path only if it belongs to this shop and exists."""
    prefix = f"{shop_id}/"
    if not rel_path.startswith(prefix) or ".." in rel_path or "\\" in rel_path:
        raise NotFound(code="file_not_found")
    p = (_root() / rel_path).resolve()
    if not p.is_file() or _root() not in p.parents:
        raise NotFound(code="file_not_found")
    return p


def belongs(shop_id: uuid.UUID, rel_path: str | None) -> bool:
    return rel_path is None or rel_path.startswith(f"{shop_id}/")
