import datetime as dt
import uuid
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.modules.payments.models import PaymentDirection, PaymentMethod, PaymentPurpose
from app.modules.paymode.schemas import PaymentDetailOut, PaymentInfo


class AllocationIn(BaseModel):
    document_type: str = Field(pattern="^(invoice|purchase)$")
    document_id: uuid.UUID
    amount: Decimal = Field(gt=0)


class PaymentCreate(BaseModel):
    party_id: uuid.UUID
    direction: PaymentDirection
    # lending = len-den with no bill: never allocated to bills when it is made (docs/32)
    purpose: PaymentPurpose = PaymentPurpose.BILL
    amount: Decimal = Field(gt=0)
    cash_account_id: uuid.UUID | None = None
    method: PaymentMethod = PaymentMethod.CASH
    reference: str | None = Field(default=None, max_length=80)
    # online / cheque / from abroad, the same picker as on sales (owner 2026-10-28); sets `method`
    payment: PaymentInfo | None = None
    date: dt.date | None = None
    notes: str | None = None
    # len-den only: the date the money is to come back (reminders, docs/32 §7)
    due_date: dt.date | None = None
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
    purpose: PaymentPurpose = PaymentPurpose.BILL
    amount: Decimal
    cash_account_id: uuid.UUID
    method: PaymentMethod
    reference: str | None
    payment: PaymentDetailOut | None = None
    date: dt.date
    notes: str | None
    due_date: dt.date | None = None
    reminded_at: dt.datetime | None = None
    allocations: list[AllocationOut]
    unallocated: Decimal
    status: str
    ledger_group_id: uuid.UUID | None
    created_by: uuid.UUID | None
    created_at: dt.datetime
    void_reason: str | None


class VoidIn(BaseModel):
    reason: str = Field(min_length=3, max_length=300)


class SettleSide(BaseModel):
    amount: Decimal  # what an adjust would put on bills now
    open_bills: Decimal
    free: Decimal  # money given / taken with no bill that is still free


class LendingEntry(BaseModel):
    id: uuid.UUID
    no: str
    direction: PaymentDirection
    amount: Decimal
    open: Decimal  # still not put on a bill
    date: dt.date
    method: PaymentMethod
    notes: str | None
    status: str
    due_date: dt.date | None = None


class LendingDue(BaseModel):
    side: str  # owes_us | we_owe
    amount: Decimal
    due_date: dt.date
    days_late: int
    status: str  # late | today | soon | later
    reminded_at: dt.datetime | None = None


class LendingDueRow(LendingDue):
    party_id: uuid.UUID
    name: str | None
    phone: str | None


class DueDateIn(BaseModel):
    due_date: dt.date | None = None


class PartyLendingOut(BaseModel):
    party_id: uuid.UUID
    balance: Decimal  # the whole khata (+ = the person owes the shop)
    lending: Decimal  # of which len-den
    bills: Decimal  # of which bills
    lent: Decimal  # all money lent to the person (posted)
    borrowed: Decimal  # all money borrowed from the person (posted)
    settle: dict[str, SettleSide]
    due: LendingDue | None = None
    entries: list[LendingEntry]


class SettleLine(BaseModel):
    payment_no: str
    document_no: str
    amount: Decimal


class SettleOut(BaseModel):
    lines: list[SettleLine]
    total: Decimal
