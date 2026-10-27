"""The shop's day follows Pakistan time, not UTC (bug found 2026-10-28 at 00:51 PKT: a sale made
after midnight counted on the previous day and the dashboard's "today" showed nothing)."""

import datetime as dt

from sqlalchemy import literal, select
from sqlalchemy.types import DateTime

from app.core.clock import local_date, local_day, today

LATE = dt.datetime(2026, 10, 27, 20, 30, tzinfo=dt.UTC)  # 01:30 on the 28th in Pakistan


def test_local_date_in_python():
    assert local_date(LATE) == dt.date(2026, 10, 28)
    assert local_date(LATE.replace(tzinfo=None)) == dt.date(2026, 10, 28)  # naive = UTC
    assert local_date(dt.datetime(2026, 10, 27, 18, 0, tzinfo=dt.UTC)) == dt.date(2026, 10, 27)
    pk_now = dt.datetime.now(dt.UTC) + dt.timedelta(hours=5)
    assert today() == pk_now.date()


def test_local_day_in_sql(engine):
    with engine.connect() as c:
        got = c.execute(select(local_day(literal(LATE, DateTime(timezone=True))))).scalar()
    assert str(got) == "2026-10-28"
