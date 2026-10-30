"""Attendance (hazri) and the staff activity view (owner 2026-10-30).

Activity is read from the audit log, which every module already writes (who created which bill,
payment, purchase, expense, repair...), so nothing new has to be recorded for it."""

import datetime as dt
import uuid
from collections import defaultdict
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import today as shop_today
from app.core.errors import Conflict, NotFound
from app.db.base import utcnow
from app.modules.attendance.models import STATUSES, Attendance
from app.modules.attendance.schemas import MarkIn
from app.modules.audit.models import AuditLog
from app.modules.audit.service import record_audit
from app.modules.auth.models import User, UserShop

TZ = ZoneInfo("Asia/Karachi")
ZERO = Decimal("0.00")


def _hours(row: Attendance) -> float | None:
    if not row.in_at or not row.out_at:
        return None
    return round((row.out_at - row.in_at).total_seconds() / 3600, 2)


def _out(db: Session, row: Attendance, names: dict[uuid.UUID, str] | None = None) -> dict:
    name = (names or {}).get(row.user_id)
    if name is None:
        u = db.get(User, row.user_id)
        name = u.name if u else None
    return {
        "id": row.id,
        "user_id": row.user_id,
        "user_name": name,
        "day": row.day,
        "status": row.status,
        "in_at": row.in_at,
        "out_at": row.out_at,
        "hours": _hours(row),
        "note": row.note,
        "marked_by": row.marked_by,
    }


def _row(db: Session, shop_id: uuid.UUID, user_id: uuid.UUID, day: dt.date) -> Attendance | None:
    return db.scalar(
        select(Attendance).where(
            Attendance.shop_id == shop_id, Attendance.user_id == user_id, Attendance.day == day
        )
    )


def staff_of(db: Session, shop_id: uuid.UUID) -> list[User]:
    """Everyone who may log in to this shop, owner first, then by name."""
    rows = db.scalars(
        select(User)
        .join(UserShop, UserShop.user_id == User.id)
        .where(UserShop.shop_id == shop_id)
        .order_by(User.name)
    ).all()
    return sorted(rows, key=lambda u: (u.role != "owner", u.name.lower()))


# ---- the person's own day -----------------------------------------------------------------


def my_today(db: Session, shop_id: uuid.UUID, user_id: uuid.UUID) -> dict:
    day = shop_today()
    row = _row(db, shop_id, user_id, day)
    return {"day": day, "record": _out(db, row) if row else None}


def check_in(db: Session, shop_id: uuid.UUID, user_id: uuid.UUID) -> dict:
    day = shop_today()
    row = _row(db, shop_id, user_id, day)
    if row and row.in_at:
        raise Conflict(
            code="already_in",
            message_en="Already checked in today",
            message_ur="آج حاضری پہلے لگ چکی ہے",
        )
    if row is None:
        row = Attendance(shop_id=shop_id, user_id=user_id, day=day)
        db.add(row)
    row.status = "present"
    row.in_at = utcnow()
    row.marked_by = None
    db.commit()
    db.refresh(row)
    return _out(db, row)


def check_out(db: Session, shop_id: uuid.UUID, user_id: uuid.UUID) -> dict:
    row = _row(db, shop_id, user_id, shop_today())
    if row is None or not row.in_at:
        raise Conflict(code="not_in", message_en="Check in first", message_ur="پہلے حاضری لگائیں")
    if row.out_at:
        raise Conflict(
            code="already_out", message_en="Already checked out", message_ur="چھٹی پہلے لگ چکی ہے"
        )
    row.out_at = utcnow()
    db.commit()
    db.refresh(row)
    return _out(db, row)


# ---- the owner's side ---------------------------------------------------------------------


def _member(db: Session, shop_id: uuid.UUID, user_id: uuid.UUID) -> User:
    u = db.scalar(
        select(User)
        .join(UserShop, UserShop.user_id == User.id)
        .where(UserShop.shop_id == shop_id, User.id == user_id)
    )
    if u is None:
        raise NotFound()
    return u


def mark(
    db: Session, shop_id: uuid.UUID, by: uuid.UUID, user_id: uuid.UUID, day: dt.date, data: MarkIn
) -> dict:
    _member(db, shop_id, user_id)
    assert data.status in STATUSES
    row = _row(db, shop_id, user_id, day)
    before = {"status": row.status} if row else None
    if row is None:
        row = Attendance(shop_id=shop_id, user_id=user_id, day=day)
        db.add(row)
    row.status = data.status
    if data.status in ("leave", "absent"):
        row.in_at = None
        row.out_at = None
    else:
        if data.in_at is not None:
            row.in_at = data.in_at
        if data.out_at is not None:
            row.out_at = data.out_at
    row.note = data.note
    row.marked_by = by
    record_audit(
        db,
        shop_id=shop_id,
        user_id=by,
        entity="attendance",
        entity_id=user_id,
        action="mark",
        before=before,
        after={"day": day.isoformat(), "status": row.status, "note": row.note},
    )
    db.commit()
    db.refresh(row)
    return _out(db, row)


def list_rows(
    db: Session,
    shop_id: uuid.UUID,
    date_from: dt.date,
    date_to: dt.date,
    user_id: uuid.UUID | None = None,
) -> list[dict]:
    stmt = (
        select(Attendance)
        .where(
            Attendance.shop_id == shop_id,
            Attendance.day >= date_from,
            Attendance.day <= date_to,
        )
        .order_by(Attendance.day.desc(), Attendance.in_at)
    )
    if user_id:
        stmt = stmt.where(Attendance.user_id == user_id)
    names = {u.id: u.name for u in staff_of(db, shop_id)}
    return [_out(db, r, names) for r in db.scalars(stmt).all()]


def summary(db: Session, shop_id: uuid.UUID, date_from: dt.date, date_to: dt.date) -> list[dict]:
    today = shop_today()
    last = min(date_to, today)
    rows = db.scalars(
        select(Attendance).where(
            Attendance.shop_id == shop_id,
            Attendance.day >= date_from,
            Attendance.day <= date_to,
        )
    ).all()
    by_user: dict[uuid.UUID, list[Attendance]] = defaultdict(list)
    for r in rows:
        by_user[r.user_id].append(r)
    out = []
    for u in staff_of(db, shop_id):
        mine = by_user.get(u.id, [])
        counts = {s: sum(1 for r in mine if r.status == s) for s in STATUSES}
        # days before the person joined do not count as missing
        joined = u.created_at.astimezone(TZ).date() if u.created_at else date_from
        start = max(date_from, joined)
        days = max(0, (last - start).days + 1)
        recorded = sum(1 for r in mine if start <= r.day <= last)
        today_row = next((r for r in mine if r.day == today), None)
        out.append(
            {
                "user_id": u.id,
                "user_name": u.name,
                "role": u.role,
                **counts,
                "missing": max(0, days - recorded),
                "hours": round(sum(_hours(r) or 0 for r in mine), 2),
                "today": today_row.status if today_row else None,
            }
        )
    return out


# ---- what each staff member did (from the audit log) ---------------------------------------


def _bounds(date_from: dt.date, date_to: dt.date) -> tuple[dt.datetime, dt.datetime]:
    start = dt.datetime.combine(date_from, dt.time.min, TZ)
    end = dt.datetime.combine(date_to + dt.timedelta(days=1), dt.time.min, TZ)
    return start.astimezone(dt.UTC), end.astimezone(dt.UTC)


def _money(v) -> Decimal:
    try:
        return Decimal(str(v)).quantize(Decimal("0.01"))
    except Exception:  # noqa: BLE001 - a payload without a usable number counts as 0
        return ZERO


def _audit_rows(
    db: Session, shop_id: uuid.UUID, date_from: dt.date, date_to: dt.date, user_id=None
):
    start, end = _bounds(date_from, date_to)
    stmt = (
        select(AuditLog)
        .where(AuditLog.shop_id == shop_id, AuditLog.at >= start, AuditLog.at < end)
        .order_by(AuditLog.at.desc())
    )
    if user_id:
        stmt = stmt.where(AuditLog.user_id == user_id)
    return db.scalars(stmt).all()


def activity(db: Session, shop_id: uuid.UUID, date_from: dt.date, date_to: dt.date) -> list[dict]:
    today = shop_today()
    today_rows = {
        r.user_id: r.status
        for r in db.scalars(
            select(Attendance).where(Attendance.shop_id == shop_id, Attendance.day == today)
        ).all()
    }
    agg: dict[uuid.UUID, dict] = defaultdict(
        lambda: {
            "actions": 0,
            "sales_count": 0,
            "sales_total": ZERO,
            "purchases_count": 0,
            "purchases_total": ZERO,
            "received": ZERO,
            "paid_out": ZERO,
            "expenses_total": ZERO,
            "repairs_count": 0,
        }
    )
    for a in _audit_rows(db, shop_id, date_from, date_to):
        if a.user_id is None:
            continue
        g = agg[a.user_id]
        g["actions"] += 1
        after = a.after or {}
        if a.action != "create":
            continue
        if a.entity == "invoice":
            g["sales_count"] += 1
            g["sales_total"] += _money(after.get("total"))
        elif a.entity == "purchase":
            g["purchases_count"] += 1
            g["purchases_total"] += _money(after.get("total"))
        elif a.entity == "payment":
            amt = _money(after.get("amount"))
            if after.get("direction") == "out":
                g["paid_out"] += amt
            else:
                g["received"] += amt
        elif a.entity == "expense":
            g["expenses_total"] += _money(after.get("amount") or after.get("total"))
        elif a.entity == "repair":
            g["repairs_count"] += 1
    return [
        {
            "user_id": u.id,
            "user_name": u.name,
            "role": u.role,
            "is_active": u.is_active,
            "last_login_at": u.last_login_at,
            "today": today_rows.get(u.id),
            **agg[u.id],
        }
        for u in staff_of(db, shop_id)
    ]


def log(
    db: Session,
    shop_id: uuid.UUID,
    user_id: uuid.UUID,
    date_from: dt.date,
    date_to: dt.date,
    limit: int = 200,
) -> list[dict]:
    names = {u.id: u.name for u in staff_of(db, shop_id)}
    out = []
    for a in _audit_rows(db, shop_id, date_from, date_to, user_id)[:limit]:
        after, before = a.after or {}, a.before or {}
        ref = after.get("no") or before.get("no") or after.get("name") or before.get("name")
        raw = after.get("total") or after.get("amount") or after.get("advance")
        out.append(
            {
                "id": a.id,
                "at": a.at,
                "user_id": a.user_id,
                "user_name": names.get(a.user_id) if a.user_id else None,
                "entity": a.entity,
                "entity_id": a.entity_id,
                "action": a.action,
                "ref": str(ref) if ref is not None else None,
                "amount": _money(raw) if raw is not None else None,
            }
        )
    return out
