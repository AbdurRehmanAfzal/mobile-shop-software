import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

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
    opening_balance: Decimal
    opening_date: date | None
    is_default: bool
    is_active: bool
    balance: Decimal


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


class ReverseRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=200)


class OpeningBalanceRequest(BaseModel):
    amount: Decimal = Field(gt=0)
    party_owes: bool = Field(
        description="True: party owes the shop (lena hai). False: shop owes the party (dena hai)."
    )
    memo: str | None = Field(default=None, max_length=200)
