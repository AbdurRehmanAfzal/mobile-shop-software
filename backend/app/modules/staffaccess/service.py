"""Staff access requests (ADR-077): ask, approve, reject, take back; and the check the export uses."""

import datetime as dt
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import Conflict, NotFound
from app.db.base import utcnow
from app.db.refs import user_name
from app.modules.staffaccess.models import StaffAccess


def _aware(v: dt.datetime | None) -> dt.datetime | None:
    if v is None:
        return None
    return v if v.tzinfo else v.replace(tzinfo=dt.UTC)


def _latest(db: Session, shop_id: uuid.UUID, user_id: uuid.UUID, kind: str) -> StaffAccess | None:
    return db.scalars(
        select(StaffAccess)
        .where(
            StaffAccess.shop_id == shop_id,
            StaffAccess.user_id == user_id,
            StaffAccess.kind == kind,
        )
        .order_by(StaffAccess.requested_at.desc())
        .limit(1)
    ).first()


def has_access(db: Session, shop_id: uuid.UUID, user_id: uuid.UUID, kind: str) -> bool:
    r = _latest(db, shop_id, user_id, kind)
    return r is not None and r.status == "approved"


def _out(db: Session, r: StaffAccess) -> dict:
    return {
        "id": r.id,
        "user_id": r.user_id,
        "name": user_name(db, r.user_id),
        "kind": r.kind,
        "status": r.status,
        "requested_at": _aware(r.requested_at),
        "decided_at": _aware(r.decided_at),
        "decided_by": user_name(db, r.decided_by),
    }


def mine(db: Session, shop_id: uuid.UUID, user_id: uuid.UUID, kind: str) -> dict:
    r = _latest(db, shop_id, user_id, kind)
    return {"status": r.status if r else None, "allowed": bool(r and r.status == "approved")}


def ask(db: Session, shop_id: uuid.UUID, user_id: uuid.UUID, kind: str) -> dict:
    r = _latest(db, shop_id, user_id, kind)
    if r is None or r.status not in ("pending", "approved"):
        r = StaffAccess(shop_id=shop_id, user_id=user_id, kind=kind, status="pending")
        db.add(r)
        db.commit()
    return mine(db, shop_id, user_id, kind)


def listing(db: Session, shop_id: uuid.UUID, kind: str) -> list[dict]:
    """the latest request of each staff member that is waiting or allowed"""
    rows = db.scalars(
        select(StaffAccess)
        .where(StaffAccess.shop_id == shop_id, StaffAccess.kind == kind)
        .order_by(StaffAccess.requested_at.desc())
    ).all()
    seen: set[uuid.UUID] = set()
    out = []
    for r in rows:
        if r.user_id in seen:
            continue
        seen.add(r.user_id)
        if r.status in ("pending", "approved"):
            out.append(_out(db, r))
    out.sort(key=lambda x: (x["status"] != "pending", x["name"] or ""))
    return out


def decide(
    db: Session, shop_id: uuid.UUID, by: uuid.UUID, request_id: uuid.UUID, action: str
) -> dict:
    r = db.get(StaffAccess, request_id)
    if r is None or r.shop_id != shop_id:
        raise NotFound()
    allowed = {
        "approve": ("pending", "approved"),
        "reject": ("pending", "rejected"),
        "revoke": ("approved", "revoked"),
    }
    need, to = allowed[action]
    if r.status != need:
        raise Conflict(
            code="access_changed",
            message_en="This request has already been answered.",
            message_ur="اس درخواست کا جواب پہلے ہی دیا جا چکا ہے۔",
        )
    r.status = to
    r.decided_at = utcnow()
    r.decided_by = by
    db.commit()
    return _out(db, r)
