import datetime as dt
import uuid
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator

from app.core.pk import normalise_cnic, normalise_phone
from app.modules.paymode.schemas import PaymentInfo


class InstallmentPlanIn(BaseModel):
    """Sent with the sale: the advance is the sale's `paid`; the rest is split over `months`."""

    months: int = Field(ge=1, le=36)
    monthly: Decimal | None = Field(default=None, gt=0)  # None = (total - advance) / months
    due_day: int = Field(default=10, ge=1, le=28)
    first_due: dt.date | None = None  # None = next month on due_day
    guarantor_name: str | None = Field(default=None, max_length=200)
    guarantor_phone: str | None = None
    guarantor_cnic: str | None = None
    notes: str | None = Field(default=None, max_length=500)

    @field_validator("guarantor_phone")
    @classmethod
    def _phone(cls, v: str | None) -> str | None:
        return normalise_phone(v) if v else None

    @field_validator("guarantor_cnic")
    @classmethod
    def _cnic(cls, v: str | None) -> str | None:
        return normalise_cnic(v) if v else None


class InstallmentOut(BaseModel):
    seq: int
    due_date: dt.date
    amount: Decimal
    paid: Decimal
    status: str  # paid | partial | today | late | due


class PlanRowOut(BaseModel):
    id: uuid.UUID
    invoice_id: uuid.UUID
    invoice_no: str
    party_id: uuid.UUID
    party_name: str
    party_phone: str | None
    item: str
    total: Decimal
    advance: Decimal
    months: int
    monthly: Decimal
    due_day: int
    paid: Decimal
    remaining: Decimal
    paid_count: int
    overdue_count: int
    overdue_amount: Decimal
    next_due: dt.date | None
    next_amount: Decimal | None
    days_late: int
    status: str  # active | closed | void
    guarantor_name: str | None
    guarantor_phone: str | None
    guarantor_cnic: str | None
    notes: str | None
    last_reminded_at: dt.datetime | None
    created_at: dt.datetime


class PlanDetailOut(PlanRowOut):
    schedule: list[InstallmentOut]
    # set right after a collection: the payment that was just made
    payment_id: uuid.UUID | None = None
    payment_no: str | None = None


class CollectIn(BaseModel):
    amount: Decimal = Field(gt=0)
    payment: PaymentInfo | None = None
    notes: str | None = Field(default=None, max_length=300)
