"""Clock-tamper guard for installs that run on the shop's own PC (docs/19 §G).

The status of a plan is computed with server time. On the one-PC install the "server" is the
shopkeeper's Windows machine, so a clock rolled back would stretch a plan. We remember the latest
time we have ever seen (in memory and, once an hour, in `platform_settings`) and never compute with
an earlier one: `now()` is max(system clock, last seen)."""

import datetime as dt

from sqlalchemy.orm import Session

from app.db.base import utcnow

KEY = "last_seen"
_last_seen: dt.datetime | None = None
_persisted_at: dt.datetime | None = None
ROLLBACK_TOLERANCE = dt.timedelta(hours=12)


def load(db: Session) -> None:
    """Reads the stored high-water mark once (at startup or on first use)."""
    global _last_seen
    from app.modules.admin.fees import PlatformSetting

    row = db.get(PlatformSetting, KEY)
    if row and isinstance(row.value, dict) and row.value.get("at"):
        try:
            seen = dt.datetime.fromisoformat(row.value["at"])
            if seen.tzinfo is None:
                seen = seen.replace(tzinfo=dt.UTC)
            _last_seen = max(_last_seen or seen, seen)
        except ValueError:
            pass


def now(db: Session | None = None) -> dt.datetime:
    """The time to compute plan status with: the system clock unless it has gone backwards."""
    global _last_seen
    real = utcnow()
    if _last_seen is None and db is not None:
        load(db)
    if _last_seen is None or real >= _last_seen:
        _last_seen = real
        return real
    return _last_seen


def rolled_back() -> bool:
    """True when the system clock is more than the tolerance behind the latest time seen."""
    real = utcnow()
    return _last_seen is not None and _last_seen - real > ROLLBACK_TOLERANCE


def observe(db: Session) -> None:
    """Called by the scheduler tick: persists the high-water mark about once an hour."""
    global _persisted_at
    from app.modules.admin.fees import PlatformSetting

    current = now(db)
    if _persisted_at is not None and current - _persisted_at < dt.timedelta(hours=1):
        return
    row = db.get(PlatformSetting, KEY)
    value = {"at": current.isoformat()}
    if row is None:
        db.add(PlatformSetting(key=KEY, value=value))
    else:
        row.value = value
    db.commit()
    _persisted_at = current


def reset_for_tests() -> None:
    global _last_seen, _persisted_at
    _last_seen = None
    _persisted_at = None
