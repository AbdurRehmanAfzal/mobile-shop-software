import datetime as dt
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.clock import today as shop_today
from app.core.permissions import Cap
from app.core.tenancy import DB, Ctx, require_cap
from app.modules.attendance import service
from app.modules.attendance.schemas import (
    ActivityRow,
    AttendanceOut,
    LogRow,
    MarkIn,
    SummaryRow,
    TodayOut,
)

router = APIRouter(prefix="/api/v1/attendance", tags=["attendance"])
activity_router = APIRouter(prefix="/api/v1/staff-activity", tags=["staff"])
Staff = Annotated[Ctx, Depends(require_cap(Cap.MANAGE_STAFF))]


def _range(date_from: dt.date | None, date_to: dt.date | None) -> tuple[dt.date, dt.date]:
    t = shop_today()
    return date_from or t, date_to or date_from or t


@router.get("/today", response_model=TodayOut)
def my_today(ctx: Ctx, db: DB):
    return service.my_today(db, ctx.shop_id, ctx.id)


@router.post("/check-in", response_model=AttendanceOut)
def check_in(ctx: Ctx, db: DB):
    return service.check_in(db, ctx.shop_id, ctx.id)


@router.post("/check-out", response_model=AttendanceOut)
def check_out(ctx: Ctx, db: DB):
    return service.check_out(db, ctx.shop_id, ctx.id)


@router.get("", response_model=list[AttendanceOut])
def list_rows(
    ctx: Staff,
    db: DB,
    date_from: dt.date | None = None,
    date_to: dt.date | None = None,
    user_id: uuid.UUID | None = None,
):
    a, b = _range(date_from, date_to)
    return service.list_rows(db, ctx.shop_id, a, b, user_id)


@router.get("/summary", response_model=list[SummaryRow])
def summary(ctx: Staff, db: DB, date_from: dt.date | None = None, date_to: dt.date | None = None):
    a, b = _range(date_from, date_to)
    return service.summary(db, ctx.shop_id, a, b)


@router.put("/{user_id}/{day}", response_model=AttendanceOut)
def mark(user_id: uuid.UUID, day: dt.date, data: MarkIn, ctx: Staff, db: DB):
    return service.mark(db, ctx.shop_id, ctx.id, user_id, day, data)


@activity_router.get("", response_model=list[ActivityRow])
def activity(ctx: Staff, db: DB, date_from: dt.date | None = None, date_to: dt.date | None = None):
    a, b = _range(date_from, date_to)
    return service.activity(db, ctx.shop_id, a, b)


@activity_router.get("/{user_id}/log", response_model=list[LogRow])
def log(
    user_id: uuid.UUID,
    ctx: Staff,
    db: DB,
    date_from: dt.date | None = None,
    date_to: dt.date | None = None,
    limit: int = Query(default=200, le=500),
):
    a, b = _range(date_from, date_to)
    return service.log(db, ctx.shop_id, user_id, a, b, limit)
