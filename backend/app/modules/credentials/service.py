"""Password / PIN history and changing one's own password (ADR-088). Writing the history is
best-effort: it never stops a password or PIN from being changed."""

import datetime as dt
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import Unauthorized
from app.core.request_info import client_info
from app.core.security import hash_password, verify_password
from app.db.refs import user_name
from app.modules.auth.models import User
from app.modules.credentials.models import CredentialChange


def log(
    db: Session,
    user: User,
    kind: str,
    action: str,
    by: uuid.UUID | None,
    by_kind: str,
) -> None:
    ip, ua = client_info()
    try:
        with db.begin_nested():  # a savepoint: a failure here never undoes the change itself
            db.add(
                CredentialChange(
                    organisation_id=user.organisation_id,
                    user_id=user.id,
                    kind=kind,
                    action=action,
                    by_user_id=by,
                    by_kind=by_kind,
                    ip=(ip or "")[:64] or None,
                    user_agent=(ua or "")[:300] or None,
                )
            )
    except Exception:  # noqa: BLE001, S110 — the history never blocks the change
        pass


def change_own_password(db: Session, user: User, current: str, new: str) -> None:
    if not verify_password(current, user.password_hash):
        raise Unauthorized(
            code="bad_credentials",
            message_en="The current password is wrong",
            message_ur="موجودہ پاس ورڈ غلط ہے",
        )
    user.password_hash = hash_password(new)
    log(db, user, "password", "changed", user.id, "self")
    db.commit()


def _aware(v: dt.datetime) -> dt.datetime:
    return v if v.tzinfo else v.replace(tzinfo=dt.UTC)


def history(
    db: Session, organisation_id: uuid.UUID, user_id: uuid.UUID | None = None, limit: int = 200
) -> list[dict]:
    stmt = select(CredentialChange, User.name, User.role, User.phone).join(
        User, User.id == CredentialChange.user_id
    )
    stmt = stmt.where(CredentialChange.organisation_id == organisation_id)
    if user_id:
        stmt = stmt.where(CredentialChange.user_id == user_id)
    rows = db.execute(stmt.order_by(CredentialChange.at.desc()).limit(limit)).all()
    return [
        {
            "id": c.id,
            "user_id": c.user_id,
            "user_name": name,
            "role": role,
            "phone": phone,
            "kind": c.kind,
            "action": c.action,
            "by_kind": c.by_kind,
            "by_name": user_name(db, c.by_user_id) if c.by_kind != "super_admin" else None,
            "ip": c.ip,
            "user_agent": c.user_agent,
            "at": _aware(c.at),
        }
        for c, name, role, phone in rows
    ]
