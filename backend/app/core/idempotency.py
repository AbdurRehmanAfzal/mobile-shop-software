"""`Idempotency-Key` on the documents a phone may send twice (owner 2026-10-29, offline mode): a
sale, purchase, payment or expense queued on the phone and sent again after a dropped connection
must not be posted twice. The first request claims the key; the same key later gets the first
answer back; a second request while the first is still running gets 409.

Keys are per shop and kept for 7 days (the queue on a phone never waits longer than that)."""

import datetime as dt
import uuid
from typing import Annotated

from fastapi import Header
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, UniqueConstraint, Uuid, delete
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Mapped, Session, mapped_column

from app.core.errors import Conflict
from app.db.base import Base, UUIDPk, utcnow

IdemKey = Annotated[str | None, Header(alias="Idempotency-Key", max_length=80)]
KEEP_DAYS = 7


class IdempotencyKey(UUIDPk, Base):
    __tablename__ = "idempotency_keys"
    __table_args__ = (UniqueConstraint("shop_id", "key", name="uq_idempotency_shop_key"),)

    shop_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("shops.id", ondelete="CASCADE"), nullable=False
    )
    key: Mapped[str] = mapped_column(String(80), nullable=False)
    route: Mapped[str] = mapped_column(String(80), nullable=False)
    status: Mapped[int | None] = mapped_column(Integer)  # None while the first request runs
    body: Mapped[dict | list | None] = mapped_column(JSON)
    created_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )


def claim(db: Session, shop_id: uuid.UUID, key: str | None, route: str) -> JSONResponse | None:
    """None = go ahead (the key is now ours, or there is no key). A JSONResponse = the answer the
    same key already got. Raises Conflict while the first request with this key is still running."""
    if not key:
        return None
    db.execute(
        delete(IdempotencyKey).where(
            IdempotencyKey.created_at < utcnow() - dt.timedelta(days=KEEP_DAYS)
        )
    )
    db.add(IdempotencyKey(shop_id=shop_id, key=key, route=route))
    try:
        db.commit()
        return None
    except IntegrityError:
        db.rollback()
    row = db.query(IdempotencyKey).filter_by(shop_id=shop_id, key=key).one_or_none()
    if row is None or row.status is None:
        raise Conflict(
            code="in_progress",
            message_en="This request is already being processed",
            message_ur="یہ درخواست پہلے ہی چل رہی ہے",
        )
    return JSONResponse(row.body, status_code=row.status)


def remember(db: Session, shop_id: uuid.UUID, key: str | None, status: int, body) -> None:
    if not key:
        return
    row = db.query(IdempotencyKey).filter_by(shop_id=shop_id, key=key).one_or_none()
    if row is not None:
        row.status = status
        row.body = jsonable_encoder(body)
        db.commit()


def release(db: Session, shop_id: uuid.UUID, key: str | None) -> None:
    """The request failed: free the key so a retry can try again."""
    if not key:
        return
    db.rollback()
    db.execute(
        delete(IdempotencyKey).where(IdempotencyKey.shop_id == shop_id, IdempotencyKey.key == key)
    )
    db.commit()


def run(db: Session, shop_id: uuid.UUID, key: str | None, route: str, make):
    """claim → make() → remember, releasing the key when make() raises."""
    hit = claim(db, shop_id, key, route)
    if hit is not None:
        return hit
    try:
        out = make()
    except Exception:
        release(db, shop_id, key)
        raise
    remember(db, shop_id, key, 201, out)
    return out
