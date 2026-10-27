import datetime as dt
import uuid
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.modules.payments.models import PaymentDirection, PaymentMethod


class AllocationIn(BaseModel):
    document_type: str = Field(pattern="^(invoice|purchase)$")
    document_id: uuid.UUID
    amount: Decimal = Field(gt=0)


class PaymentCreate(BaseModel):
    party_id: uuid.UUID
    direction: PaymentDirection
    amount: Decimal = Field(gt=0)
    cash_account_id: uuid.UUID | None = None
    method: PaymentMethod = PaymentMethod.CASH
    reference: str | None = Field(default=None, max_length=80)
    date: dt.date | None = None
    notes: str | None = None
    allocations: list[AllocationIn] | None = Field(
        default=None, description="None = auto-allocate FIFO to open documents"
    )


class AllocationOut(BaseModel):
    document_type: str
    document_id: uuid.UUID
    document_no: str | None = None
    amount: Decimal


class PaymentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    no: str
    party_id: uuid.UUID
    party_name: str | None = None
    party_balance_after: Decimal | None = None
    direction: PaymentDirection
    amount: Decimal
    cash_account_id: uuid.UUID
    method: PaymentMethod
    reference: str | None
    date: dt.date
    notes: str | None
    allocations: list[AllocationOut]
    unallocated: Decimal
    status: str
    ledger_group_id: uuid.UUID | None
    created_by: uuid.UUID | None
    created_at: dt.datetime
    void_reason: str | None


class VoidIn(BaseModel):
    reason: str = Field(min_length=3, max_length=300)
