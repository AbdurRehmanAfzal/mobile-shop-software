"""When did a phone enter the stock it is in now? (Shop Audit P2-3, owner brief 2026-10-30.)

Stock age used to count from `Device.last_event_at`, so a note or a price change made an old phone
look fresh. The age of a unit starts at the intake event of its current cycle: the purchase that
brought it in, or the sale return that brought it back. Loans, approvals and repairs do not restart
the clock (the phone stayed ours)."""

import datetime as dt
import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.modules.devices.models import Device, DeviceEvent
from app.modules.devices.state import EventType

INTAKE_EVENTS = (EventType.PURCHASED.value, EventType.SALE_RETURNED.value)


def _aware(t: dt.datetime) -> dt.datetime:
    return t if t.tzinfo else t.replace(tzinfo=dt.UTC)


def intake_map(
    db: Session, shop_id: uuid.UUID, device_ids: list[uuid.UUID] | None = None
) -> dict[uuid.UUID, dt.datetime]:
    """device id -> time of the latest intake event (purchased / sale_returned)."""
    stmt = (
        select(DeviceEvent.device_id, func.max(DeviceEvent.at))
        .where(DeviceEvent.shop_id == shop_id, DeviceEvent.type.in_(INTAKE_EVENTS))
        .group_by(DeviceEvent.device_id)
    )
    if device_ids is not None:
        if not device_ids:
            return {}
        stmt = stmt.where(DeviceEvent.device_id.in_(device_ids))
    return {d: _aware(t) for d, t in db.execute(stmt).all()}


def intake_at(d: Device, intakes: dict[uuid.UUID, dt.datetime]) -> dt.datetime:
    """the intake time for one device, falling back to when it was first seen"""
    return intakes.get(d.id) or _aware(d.first_seen_at)


def days_in_stock(d: Device, intakes: dict[uuid.UUID, dt.datetime], now=None) -> int:
    now = now or dt.datetime.now(dt.UTC)
    return max((now - intake_at(d, intakes)).days, 0)
