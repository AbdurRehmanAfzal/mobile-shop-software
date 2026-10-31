"""Daily stock snapshots (owner decision 2026-10-31, docs/17 §5): for very large shops the stock
held on a past day is read from a nightly snapshot instead of walking every device event.

A snapshot is a derived cache, never a source: it is recomputed from the events, one row per shop
and day (count, value at cost, value at asking), taken by the nightly tick for the day that just
ended, and it can be rebuilt for any range. `stock_at` prefers a snapshot when one exists for the
exact day asked for and falls back to the event walk otherwise, so a shop without snapshots sees
the same numbers, only slower."""

import datetime as dt
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.periods import day_end
from app.modules.shopaudit.models import StockSnapshot


def take(db: Session, shop_id: uuid.UUID, day: dt.date) -> StockSnapshot:
    """(re)compute the snapshot for `day` from the device events and store it"""
    from app.modules.shopaudit import service

    figures = service.stock_at(db, shop_id, day_end(day), True, use_snapshot=False)
    row = db.scalar(
        select(StockSnapshot).where(StockSnapshot.shop_id == shop_id, StockSnapshot.day == day)
    )
    if row is None:
        row = StockSnapshot(shop_id=shop_id, day=day)
        db.add(row)
    row.count = figures["count"]
    row.cost_value = figures["cost_value"]
    row.asking_value = figures["asking_value"]
    row.taken_at = dt.datetime.now(dt.UTC)
    db.flush()
    return row


def get(db: Session, shop_id: uuid.UUID, day: dt.date) -> StockSnapshot | None:
    return db.scalar(
        select(StockSnapshot).where(StockSnapshot.shop_id == shop_id, StockSnapshot.day == day)
    )


def backfill(db: Session, shop_id: uuid.UUID, d_from: dt.date, d_to: dt.date) -> int:
    n = 0
    d = d_from
    while d <= d_to:
        take(db, shop_id, d)
        n += 1
        d += dt.timedelta(days=1)
    return n


def nightly(db: Session, shop_id: uuid.UUID, today_local: dt.date) -> StockSnapshot:
    """the tick calls this once per shop and day: the day that just ended"""
    return take(db, shop_id, today_local - dt.timedelta(days=1))
