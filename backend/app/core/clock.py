"""The shop's day. Times are stored in UTC, but a Pakistani shop's "today" and the day a sale belongs to
follow Pakistan time (settings.timezone, Asia/Karachi). Without this, anything between 00:00 and
05:00 PKT counted on the previous day and the server's "today" lagged five hours (found 2026-10-28).
"""

import datetime as dt
from zoneinfo import ZoneInfo

from sqlalchemy import Date
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.sql.functions import FunctionElement

from app.core.config import settings


def shop_tz() -> ZoneInfo:
    return ZoneInfo(settings.timezone)


def today() -> dt.date:
    """today's date in the shop's time zone"""
    return dt.datetime.now(shop_tz()).date()


def local_date(at: dt.datetime) -> dt.date:
    """the shop's calendar day of a stored (UTC) timestamp"""
    if at.tzinfo is None:
        at = at.replace(tzinfo=dt.UTC)
    return at.astimezone(shop_tz()).date()


class local_day(FunctionElement):
    """SQL: the shop's calendar day of a timestamp column."""

    type = Date()
    inherit_cache = True
    name = "local_day"


def _offset_minutes() -> int:
    # Pakistan has a fixed offset (no daylight saving), so a number is exact and needs no
    # time-zone database inside PostgreSQL / SQLite
    return int(dt.datetime.now(shop_tz()).utcoffset().total_seconds() // 60)


@compiles(local_day, "postgresql")
def _pg(element, compiler, **kw):
    col = compiler.process(next(iter(element.clauses)), **kw)
    return f"date(({col} AT TIME ZONE 'UTC') + make_interval(mins => {_offset_minutes()}))"


@compiles(local_day, "sqlite")
def _sqlite(element, compiler, **kw):
    minutes = _offset_minutes()
    col = compiler.process(next(iter(element.clauses)), **kw)
    return f"date({col}, '{minutes:+d} minutes')"


@compiles(local_day)
def _default(element, compiler, **kw):
    return f"date({compiler.process(next(iter(element.clauses)), **kw)})"
