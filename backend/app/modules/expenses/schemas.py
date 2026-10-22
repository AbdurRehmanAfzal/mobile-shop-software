import datetime as dt
import uuid
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    key: str
    name: str
    name_ur: str | None
    is_global: bool = False


class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    name_ur: str | None = Field(default=None, max_length=100)


class ExpenseCreate(BaseModel):
    category_id: uuid.UUID
    amount: Decimal = Field(gt=0)
    cash_account_id: uuid.UUID | None = None
    date: dt.date | None = None
    party_id: uuid.UUID | None = None
    staff_user_id: uuid.UUID | None = None
    description: str | None = Field(default=None, max_length=200)
    receipt_path: str | None = None
    notes: str | None = None


class ExpenseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    no: str
    category_id: uuid.UUID
    category_key: str
    category_name: str | None = None
    amount: Decimal
    cash_account_id: uuid.UUID
    date: dt.date
    party_id: uuid.UUID | None
    party_name: str | None = None
    staff_user_id: uuid.UUID | None
    staff_name: str | None = None
    description: str | None
    receipt_path: str | None
    notes: str | None
    status: str
    ledger_group_id: uuid.UUID | None
    created_by: uuid.UUID | None
    created_at: dt.datetime
    void_reason: str | None


class VoidIn(BaseModel):
    reason: str = Field(min_length=3, max_length=300)


class DayCloseIn(BaseModel):
    date: dt.date | None = None
    cash_account_id: uuid.UUID | None = None
    counted: Decimal = Field(ge=0)
    notes: str | None = None


class DayCloseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    cash_account_id: uuid.UUID
    date: dt.date
    opening: Decimal
    cash_in: Decimal
    cash_out: Decimal
    expected: Decimal
    counted: Decimal
    difference: Decimal
    notes: str | None
    closed_by: uuid.UUID | None
    closed_at: dt.datetime


class DayPreviewOut(BaseModel):
    cash_account_id: uuid.UUID
    date: dt.date
    opening: Decimal
    cash_in: Decimal
    cash_out: Decimal
    expected: Decimal
    closed: bool
