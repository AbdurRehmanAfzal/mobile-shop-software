import datetime as dt
import uuid
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.modules.loans.models import LoanStatus


class LoanCreate(BaseModel):
    device_id: uuid.UUID
    party_id: uuid.UUID
    expected_back_at: dt.date | None = None
    notes: str | None = Field(default=None, max_length=500)


class LoanReturnIn(BaseModel):
    notes: str | None = Field(default=None, max_length=500)


class LoanSellIn(BaseModel):
    price: Decimal = Field(ge=0)
    paid: Decimal = Field(default=Decimal(0), ge=0)
    discount: Decimal = Field(default=Decimal(0), ge=0)
    cash_account_id: uuid.UUID | None = None
    warranty_days: int = Field(default=0, ge=0, le=3660)
    notes: str | None = None


class LoanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    device_id: uuid.UUID
    imei1: str | None = None
    device_label: str | None = None
    party_id: uuid.UUID
    party_name: str | None = None
    out_at: dt.datetime
    expected_back_at: dt.date | None
    overdue: bool = False
    status: LoanStatus
    settled_at: dt.datetime | None
    invoice_id: uuid.UUID | None
    notes: str | None
    created_by: uuid.UUID | None
