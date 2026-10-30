import datetime as dt
import uuid
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field

Status = Literal["present", "half", "leave", "absent"]


class AttendanceOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    user_name: str | None
    day: dt.date
    status: str
    in_at: dt.datetime | None
    out_at: dt.datetime | None
    hours: float | None  # out − in, when both are there
    note: str | None
    marked_by: uuid.UUID | None


class TodayOut(BaseModel):
    day: dt.date
    record: AttendanceOut | None


class MarkIn(BaseModel):
    status: Status
    in_at: dt.datetime | None = None
    out_at: dt.datetime | None = None
    note: str | None = Field(default=None, max_length=300)


class SummaryRow(BaseModel):
    user_id: uuid.UUID
    user_name: str
    role: str
    present: int
    half: int
    leave: int
    absent: int
    missing: int  # days in the period (up to today) with no record
    hours: float
    today: str | None  # today's status, if any


class ActivityRow(BaseModel):
    user_id: uuid.UUID
    user_name: str
    role: str
    is_active: bool
    last_login_at: dt.datetime | None
    today: str | None
    actions: int
    sales_count: int
    sales_total: Decimal
    purchases_count: int
    purchases_total: Decimal
    received: Decimal
    paid_out: Decimal
    expenses_total: Decimal
    repairs_count: int


class LogRow(BaseModel):
    id: uuid.UUID
    at: dt.datetime
    user_id: uuid.UUID | None
    user_name: str | None
    entity: str
    entity_id: uuid.UUID | None
    action: str
    ref: str | None  # the document number or the thing's name
    amount: Decimal | None
