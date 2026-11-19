import datetime as dt
import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.modules.ledger.models import CashAccountKind


class CashAccountCreate(BaseModel):
    kind: CashAccountKind
    name: str = Field(min_length=1, max_length=100)
    name_ur: str | None = Field(default=None, max_length=100)
    account_no: str | None = Field(default=None, max_length=60)
    opening_balance: Decimal = Field(default=Decimal(0), ge=0)
    opening_date: date | None = None


class CashAccountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    kind: CashAccountKind
    name: str
    name_ur: str | None
    account_no: str | None
    opening_balance: Decimal | None  # None for a salesman (ADR-072)
    opening_date: date | None
    is_default: bool
    is_active: bool
    balance: Decimal | None


class EntryOut(BaseModel):
    id: uuid.UUID
    seq: int
    account: str
    party_id: uuid.UUID | None
    cash_account_id: uuid.UUID | None
    device_id: uuid.UUID | None
    debit: Decimal
    credit: Decimal
    memo: str | None


class GroupOut(BaseModel):
    id: uuid.UUID
    document_type: str
    document_id: uuid.UUID | None
    memo: str | None
    posted_by: uuid.UUID | None
    at: datetime
    reverses_group_id: uuid.UUID | None
    reversed_by_group_id: uuid.UUID | None
    entries: list[EntryOut]


class StatementRow(BaseModel):
    entry_id: uuid.UUID
    group_id: uuid.UUID
    at: datetime
    document_type: str
    document_id: uuid.UUID | None
    memo: str | None
    debit: Decimal
    credit: Decimal
    balance: Decimal
    reversed: bool


class StatementOut(BaseModel):
    party_id: uuid.UUID
    opening_balance: Decimal
    closing_balance: Decimal
    rows: list[StatementRow]


class CashBookRow(BaseModel):
    entry_id: uuid.UUID
    group_id: uuid.UUID
    at: datetime
    document_type: str
    document_id: uuid.UUID | None
    memo: str | None
    in_: Decimal = Field(alias="in")
    out: Decimal
    balance: Decimal
    reversed: bool

    model_config = ConfigDict(populate_by_name=True)


class CashBookOut(BaseModel):
    cash_account_id: uuid.UUID
    opening_balance: Decimal
    closing_balance: Decimal
    rows: list[CashBookRow]


class TransferCreate(BaseModel):
    from_account_id: uuid.UUID
    to_account_id: uuid.UUID
    amount: Decimal = Field(gt=0)
    date: dt.date | None = None
    note: str | None = Field(default=None, max_length=200)


class TransferOut(BaseModel):
    id: uuid.UUID
    at: datetime
    from_account_id: uuid.UUID | None
    from_name: str | None
    to_account_id: uuid.UUID | None
    to_name: str | None
    amount: Decimal
    memo: str | None
    posted_by: uuid.UUID | None
    posted_by_name: str | None
    reversed: bool


class ReverseRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=200)


class OldItem(BaseModel):
    """one line of a dealing from before the software: what went, how many, at what rate"""

    description: str = Field(min_length=1, max_length=120)
    qty: int = Field(ge=1, le=100000)
    rate: Decimal = Field(ge=0)


class OpeningBalanceRequest(BaseModel):
    """A balance carried over from before the software (owner 2026-11-19, ADR-110). Either the
    amount still open, or the goods that went (`items`) and what was already settled — the
    server then works out what is left. No stock and no profit are touched: those phones left
    before the software, so their IMEIs are not needed."""

    amount: Decimal | None = Field(default=None, gt=0)
    party_owes: bool = Field(
        description="True: party owes the shop (lena hai). False: shop owes the party (dena hai)."
    )
    memo: str | None = Field(default=None, max_length=200)
    items: list[OldItem] = Field(default_factory=list, max_length=60)
    settled: Decimal = Field(default=Decimal(0), ge=0)  # already paid / received before
    as_of: date | None = None

    @model_validator(mode="after")
    def _one_way(self):
        if self.amount is None and not self.items:
            raise ValueError("Write the amount, or the goods that went")
        return self


class OldBalanceOut(BaseModel):
    group_id: uuid.UUID
    at: datetime
    amount: Decimal
    party_owes: bool
    memo: str | None
    deleted: bool


class UndoOpeningRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=200)


class CashAccountUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    account_no: str | None = Field(default=None, max_length=60)
    # owner 2026-11-05 (accounting audit): the galla made with the shop starts at 0; the money that
    # was really in it on the first day can be set later, so its balance is not shown below zero
    opening_balance: Decimal | None = Field(default=None, ge=0)
