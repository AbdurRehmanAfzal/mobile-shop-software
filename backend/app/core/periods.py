"""Reporting periods for the Shop Audit (docs/16 §2, docs/17 P3-1).

One resolver for every audit screen: a preset or a custom from–to, an optional `as_of` day for
balances (defaults to the end of the period), and the period just before it for comparisons.
Boundaries are shop calendar days (Asia/Karachi); the ledger is queried with the UTC instants of
those day boundaries so a 02:00 PKT sale lands on the right day."""

import datetime as dt
from dataclasses import asdict, dataclass

from app.core.clock import shop_tz
from app.core.clock import today as shop_today

PRESETS = (
    "today",
    "yesterday",
    "this_week",
    "last_week",
    "this_month",
    "last_month",
    "this_year",
    "all_time",
    "custom",
)


@dataclass(slots=True)
class Period:
    preset: str
    date_from: dt.date
    date_to: dt.date
    as_of: dt.date
    prev_from: dt.date
    prev_to: dt.date

    @property
    def days(self) -> int:
        return (self.date_to - self.date_from).days + 1

    def as_dict(self) -> dict:
        d = asdict(self)
        d["days"] = self.days
        return d


def _month_start(d: dt.date) -> dt.date:
    return d.replace(day=1)


def _prev_month_start(d: dt.date) -> dt.date:
    first = _month_start(d)
    return (first - dt.timedelta(days=1)).replace(day=1)


def _week_start(d: dt.date) -> dt.date:
    """Monday"""
    return d - dt.timedelta(days=d.weekday())


def resolve(
    preset: str | None = None,
    date_from: dt.date | None = None,
    date_to: dt.date | None = None,
    as_of: dt.date | None = None,
    *,
    first_day: dt.date | None = None,
    today: dt.date | None = None,
) -> Period:
    """`preset` wins unless it is `custom` / missing; then `date_from`/`date_to` (defaulting to
    this month). `first_day` is the shop's earliest record, used by `all_time`."""
    today = today or shop_today()
    preset = preset or ("custom" if (date_from or date_to) else "this_month")
    if preset not in PRESETS:
        raise ValueError(f"unknown period preset {preset!r}")
    if preset == "today":
        f = t = today
    elif preset == "yesterday":
        f = t = today - dt.timedelta(days=1)
    elif preset == "this_week":
        f, t = _week_start(today), today
    elif preset == "last_week":
        t = _week_start(today) - dt.timedelta(days=1)
        f = t - dt.timedelta(days=6)
    elif preset == "this_month":
        f, t = _month_start(today), today
    elif preset == "last_month":
        f = _prev_month_start(today)
        t = _month_start(today) - dt.timedelta(days=1)
    elif preset == "this_year":
        f, t = today.replace(month=1, day=1), today
    elif preset == "all_time":
        f, t = (first_day or today), today
    else:  # custom
        f = date_from or (date_to and _month_start(date_to)) or _month_start(today)
        t = date_to or today
        if t < f:
            f, t = t, f
    # the period before: same calendar unit for weeks / months / years, same length otherwise
    if preset in ("this_week", "last_week"):
        pf = f - dt.timedelta(days=7)
        pt = f - dt.timedelta(days=1)
    elif preset in ("this_month", "last_month"):
        pf = _prev_month_start(f)
        pt = f - dt.timedelta(days=1)
    elif preset == "this_year":
        pf = f.replace(year=f.year - 1)
        pt = f - dt.timedelta(days=1)
    else:
        n = (t - f).days + 1
        pt = f - dt.timedelta(days=1)
        pf = pt - dt.timedelta(days=n - 1)
    return Period(preset, f, t, as_of or t, pf, pt)


def day_start(d: dt.date) -> dt.datetime:
    """UTC instant when the shop's day `d` begins"""
    return dt.datetime.combine(d, dt.time.min, tzinfo=shop_tz()).astimezone(dt.UTC)


def day_end(d: dt.date) -> dt.datetime:
    """UTC instant when the shop's day `d` is over (start of the next day)"""
    return day_start(d + dt.timedelta(days=1))
