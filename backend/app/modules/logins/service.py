"""Login sessions (ADR-074). Starting, touching and ending a session is best-effort: a failure
here never stops anybody from logging in or working."""

import time
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import NotFound, Unauthorized
from app.core.request_info import client_info
from app.db.base import utcnow
from app.modules.auth.models import User
from app.modules.logins.models import LoginSession

ONLINE_MINUTES = 5


def start(db: Session, user: User, method: str) -> uuid.UUID | None:
    ip, ua = client_info()
    try:
        s = LoginSession(
            organisation_id=user.organisation_id,
            user_id=user.id,
            method=method[:12],
            ip=(ip or None) and ip[:64],
            user_agent=(ua or None) and ua[:300],
        )
        db.add(s)
        db.commit()
        return s.id
    except Exception:  # noqa: BLE001 — never blocks a login
        db.rollback()
        return None


def check(db: Session, sid: str | None) -> None:
    """an ended session's tokens stop working"""
    if not sid:
        return
    try:
        s = db.get(LoginSession, uuid.UUID(sid))
    except (ValueError, Exception):  # noqa: BLE001
        return
    if s is not None and s.ended_at is not None:
        raise Unauthorized(
            code="session_ended",
            message_en="This login was ended. Please log in again.",
            message_ur="یہ لاگ اِن بند کر دیا گیا۔ دوبارہ لاگ اِن کریں۔",
        )


_seen: dict[str, float] = {}


def touch(db: Session, sid: str | None) -> None:
    """when the session was last used: written at most once a minute per session"""
    if not sid:
        return
    now = time.monotonic()
    if now - _seen.get(sid, -1e9) < 60:
        return
    _seen[sid] = now
    try:
        s = db.get(LoginSession, uuid.UUID(sid))
        if s is not None and s.ended_at is None:
            s.last_seen_at = utcnow()
            db.commit()
    except Exception:  # noqa: BLE001 — activity is best-effort
        db.rollback()


def end(db: Session, s: LoginSession, by: uuid.UUID | None, reason: str) -> None:
    if s.ended_at is None:
        s.ended_at = utcnow()
        s.ended_by = by
        s.end_reason = reason
        db.commit()


def end_own(db: Session, sid: str | None, user_id: uuid.UUID) -> None:
    if not sid:
        return
    try:
        s = db.get(LoginSession, uuid.UUID(sid))
        if s is not None and s.user_id == user_id:
            end(db, s, user_id, "logout")
    except Exception:  # noqa: BLE001
        db.rollback()


def _aware(v: datetime) -> datetime:
    return v if v.tzinfo else v.replace(tzinfo=UTC)


def listing(
    db: Session, organisation_id: uuid.UUID, days: int, current_sid: str | None
) -> list[dict]:
    since = datetime.now(UTC) - timedelta(days=days)
    rows = db.execute(
        select(LoginSession, User.name, User.role, User.phone)
        .join(User, User.id == LoginSession.user_id)
        .where(LoginSession.organisation_id == organisation_id, LoginSession.last_seen_at >= since)
        .order_by(LoginSession.last_seen_at.desc())
        .limit(500)
    ).all()
    now = datetime.now(UTC)
    out = []
    for s, name, role, phone in rows:
        last = _aware(s.last_seen_at)
        out.append(
            {
                "id": s.id,
                "user_id": s.user_id,
                "user_name": name,
                "role": role,
                "phone": phone,
                "method": s.method,
                "ip": s.ip,
                "user_agent": s.user_agent,
                "started_at": _aware(s.started_at),
                "last_seen_at": last,
                "ended_at": _aware(s.ended_at) if s.ended_at else None,
                "end_reason": s.end_reason,
                "online": s.ended_at is None and now - last <= timedelta(minutes=ONLINE_MINUTES),
                "this_device": current_sid is not None and str(s.id) == current_sid,
            }
        )
    return out


def end_by_owner(
    db: Session, organisation_id: uuid.UUID, owner_id: uuid.UUID, sid: uuid.UUID
) -> dict:
    s = db.get(LoginSession, sid)
    if s is None or s.organisation_id != organisation_id:
        raise NotFound(code="session_not_found")
    end(db, s, owner_id, "owner")
    return {"id": s.id, "ended_at": s.ended_at}
