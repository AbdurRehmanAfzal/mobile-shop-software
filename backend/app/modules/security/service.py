"""Login security (owner 2026-11-15, ADR-080). Both rules are off until the owner switches them on,
and neither ever applies to the owner or the super admin:
- device approval: a staff member logs in only on a phone / browser the owner approved; a new one
  waits for the owner (the owner sees it on the home screen and on Login security);
- login hours: staff log in only between the shop's hours (checked at login and when the login is
  renewed, every 30 minutes).
Taking a device back, logging all staff out, or switching a staff member off ends their logins."""

import datetime as dt
import hashlib
import re
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import shop_tz
from app.core.errors import Conflict, Forbidden, NotFound, ValidationFailed
from app.core.permissions import Role
from app.core.request_info import client_info, device_key
from app.db.base import utcnow
from app.db.refs import user_name
from app.modules.auth.models import Organisation, User
from app.modules.security.models import TrustedDevice

DEFAULT = {"device_approval": False, "hours_on": False, "hours_from": "09:00", "hours_to": "23:00"}
HHMM = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


def rules(org: Organisation | None) -> dict:
    return {**DEFAULT, **((org.login_rules or {}) if org is not None else {})}


def _hash(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()


def _label(ua: str | None) -> str:
    """a short name for the device from its browser string"""
    ua = ua or ""
    os_ = next(
        (
            n
            for p, n in (
                ("Android", "Android"),
                ("iPhone", "iPhone"),
                ("iPad", "iPad"),
                ("Windows", "Windows PC"),
                ("Mac OS", "Mac"),
                ("Linux", "Linux"),
            )
            if p in ua
        ),
        "Device",
    )
    model = re.search(r"Android [\d.]+; ([^;)]+)", ua)
    if model and model.group(1).strip() not in ("K", "wv"):
        os_ = f"{os_} · {model.group(1).strip()}"
    br = next(
        (
            n
            for p, n in (
                ("Edg/", "Edge"),
                ("Chrome/", "Chrome"),
                ("Firefox/", "Firefox"),
                ("Safari/", "Safari"),
            )
            if p in ua
        ),
        "",
    )
    return f"{os_}{' · ' + br if br else ''}"[:120]


def _minutes(hhmm: str) -> int:
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def within_hours(r: dict, now: dt.datetime | None = None) -> bool:
    if not r.get("hours_on"):
        return True
    t = now or dt.datetime.now(shop_tz())
    cur = t.hour * 60 + t.minute
    a, b = _minutes(r["hours_from"]), _minutes(r["hours_to"])
    return a <= cur < b if a <= b else cur >= a or cur < b  # e.g. 10:00–02:00 over midnight


def _exempt(user: User) -> bool:
    from app.modules.auth.service import is_superuser

    return user.role == Role.OWNER or is_superuser(user)


def _check_hours(r: dict) -> None:
    if not within_hours(r):
        raise Forbidden(
            code="outside_hours",
            message_en=f"Staff can log in only between {r['hours_from']} and {r['hours_to']}.",
            message_ur=f"عملہ صرف {r['hours_from']} سے {r['hours_to']} تک لاگ اِن کر سکتا ہے۔",
            details={"from": r["hours_from"], "to": r["hours_to"]},
        )


def guard_login(db: Session, user: User, method: str) -> uuid.UUID | None:
    """called for every new sign-in; returns the approved device (kept on the login session)"""
    if method in ("signup", "resumed") or _exempt(user):
        return None
    r = rules(db.get(Organisation, user.organisation_id))
    _check_hours(r)
    if not r["device_approval"]:
        return None
    key = device_key()
    if not key or len(key) < 20:
        raise Forbidden(
            code="device_unknown",
            message_en="This app is out of date. Please update it and log in again.",
            message_ur="یہ ایپ پرانی ہے۔ اپ ڈیٹ کر کے دوبارہ لاگ اِن کریں۔",
        )
    h = _hash(key)
    d = db.scalar(
        select(TrustedDevice).where(TrustedDevice.user_id == user.id, TrustedDevice.key_hash == h)
    )
    ip, ua = client_info()
    if d is not None and d.status == "approved":
        d.last_used_at = utcnow()
        db.commit()
        return d.id
    if d is not None and d.status == "rejected":
        raise Forbidden(
            code="device_rejected",
            message_en="The owner did not allow this phone. Ask the owner.",
            message_ur="مالک نے اس فون کی اجازت نہیں دی۔ مالک سے بات کریں۔",
        )
    if d is None:
        d = TrustedDevice(organisation_id=user.organisation_id, user_id=user.id, key_hash=h)
        db.add(d)
    if d.status != "pending":  # taken back earlier: asks again
        d.status = "pending"
        d.requested_at = utcnow()
        d.decided_at = d.decided_by = None
    d.label = _label(ua)
    d.user_agent = (ua or "")[:300] or None
    d.ip = (ip or "")[:64] or None
    db.commit()
    raise Forbidden(
        code="device_pending",
        message_en="This phone is new. The owner must allow it first — ask the owner to tap Allow on the home screen, then log in again.",
        message_ur='یہ فون نیا ہے۔ پہلے مالک اجازت دے — مالک سے کہیں ہوم اسکرین پر "اجازت دیں" دبائے، پھر دوبارہ لاگ اِن کریں۔',
        details={"device": d.label},
    )


def guard_refresh(db: Session, user: User) -> None:
    """a renewed login keeps to the hours too"""
    if _exempt(user):
        return
    org = db.get(Organisation, user.organisation_id)
    if org is not None and org.login_rules:
        _check_hours(rules(org))


# ------------------------------------------------------------ the owner's screen


def _aware(v: dt.datetime | None) -> dt.datetime | None:
    if v is None:
        return None
    return v if v.tzinfo else v.replace(tzinfo=dt.UTC)


def state(db: Session, organisation_id: uuid.UUID) -> dict:
    org = db.get(Organisation, organisation_id)
    rows = db.execute(
        select(TrustedDevice, User.name, User.role)
        .join(User, User.id == TrustedDevice.user_id)
        .where(TrustedDevice.organisation_id == organisation_id)
        .order_by(TrustedDevice.requested_at.desc())
        .limit(300)
    ).all()
    order = {"pending": 0, "approved": 1, "rejected": 2, "revoked": 3}
    devices = [
        {
            "id": d.id,
            "user_id": d.user_id,
            "user_name": name,
            "role": role,
            "label": d.label,
            "ip": d.ip,
            "status": d.status,
            "requested_at": _aware(d.requested_at),
            "decided_at": _aware(d.decided_at),
            "decided_by": user_name(db, d.decided_by),
            "last_used_at": _aware(d.last_used_at),
        }
        for d, name, role in rows
        if d.status != "revoked"
    ]
    devices.sort(key=lambda x: order.get(x["status"], 9))
    return {
        "rules": rules(org),
        "devices": devices,
        "pending": sum(1 for x in devices if x["status"] == "pending"),
    }


def set_rules(db: Session, organisation_id: uuid.UUID, data: dict) -> dict:
    org = db.get(Organisation, organisation_id)
    if org is None:
        raise NotFound()
    r = rules(org)
    for k in ("device_approval", "hours_on"):
        if k in data and data[k] is not None:
            r[k] = bool(data[k])
    for k in ("hours_from", "hours_to"):
        if data.get(k) is not None:
            if not HHMM.match(str(data[k])):
                raise ValidationFailed(code="bad_time", message_en="Use a time like 09:00")
            r[k] = data[k]
    if r["hours_from"] == r["hours_to"]:
        raise ValidationFailed(
            code="bad_hours",
            message_en="The start and end of the hours cannot be the same.",
            message_ur="شروع اور ختم کا وقت ایک جیسا نہیں ہو سکتا۔",
        )
    org.login_rules = r
    db.commit()
    return r


def _end_sessions(db: Session, by: uuid.UUID, where) -> int:
    from app.modules.logins import service as logins
    from app.modules.logins.models import LoginSession

    rows = db.scalars(select(LoginSession).where(LoginSession.ended_at.is_(None), *where)).all()
    for s in rows:
        logins.end(db, s, by, "owner")
    return len(rows)


def decide(
    db: Session, organisation_id: uuid.UUID, by: uuid.UUID, device_id: uuid.UUID, action: str
) -> dict:
    from app.modules.logins.models import LoginSession

    d = db.get(TrustedDevice, device_id)
    if d is None or d.organisation_id != organisation_id:
        raise NotFound()
    to = {"approve": "approved", "reject": "rejected", "revoke": "revoked"}[action]
    allowed_from = {
        "approve": ("pending", "rejected"),
        "reject": ("pending",),
        "revoke": ("approved", "rejected"),
    }[action]
    if d.status not in allowed_from:
        raise Conflict(
            code="device_changed",
            message_en="This device has already been answered.",
            message_ur="اس ڈیوائس کا جواب پہلے دیا جا چکا ہے۔",
        )
    d.status = to
    d.decided_at = utcnow()
    d.decided_by = by
    db.commit()
    if to == "revoked":
        _end_sessions(db, by, [LoginSession.device_id == d.id])
    return {"id": d.id, "status": d.status}


def logout_staff(db: Session, organisation_id: uuid.UUID, by: uuid.UUID) -> dict:
    """every open login of the staff (not the owner) ends now"""
    from app.modules.logins.models import LoginSession

    staff = select(User.id).where(User.organisation_id == organisation_id, User.role != Role.OWNER)
    n = _end_sessions(
        db, by, [LoginSession.organisation_id == organisation_id, LoginSession.user_id.in_(staff)]
    )
    return {"ended": n}


def end_user_sessions(db: Session, user_id: uuid.UUID, by: uuid.UUID) -> None:
    """a staff member switched off: their logins end now (best-effort)"""
    from app.modules.logins.models import LoginSession

    try:
        _end_sessions(db, by, [LoginSession.user_id == user_id])
    except Exception:  # noqa: BLE001
        db.rollback()
