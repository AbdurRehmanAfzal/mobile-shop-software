import datetime as dt
import uuid
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.modules.returns.models import ReturnKind, Settlement


class SaleReturnIn(BaseModel):
    invoice_id: uuid.UUID
    party_id: uuid.UUID | None = Field(
        default=None,
        description="walk-in sale only: who brought it back (the return must then be settled in full)",
    )
    line_ids: list[uuid.UUID] = Field(min_length=1)
    settlement: Settlement = Settlement.CREDIT
    refund_amount: Decimal | None = Field(
        default=None,
        ge=0,
        description="cash handed back (default = excess paid; may go with kept_amount)",
    )
    kept_amount: Decimal | None = Field(
        default=None,
        ge=0,
        description="amount the shop cuts and keeps as income (default = excess paid for income)",
    )
    cash_account_id: uuid.UUID | None = None
    reason: str | None = Field(default=None, max_length=300)
    date: dt.date | None = None


class PurchaseReturnIn(BaseModel):
    purchase_id: uuid.UUID
    line_ids: list[uuid.UUID] = Field(min_length=1)
    refund_amount: Decimal = Field(
        default=Decimal(0), ge=0, description="cash the supplier hands back now"
    )
    cash_account_id: uuid.UUID | None = None
    reason: str | None = Field(default=None, max_length=300)
    date: dt.date | None = None


class ReturnOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    no: str
    kind: ReturnKind
    document_id: uuid.UUID
    document_no: str
    party_id: uuid.UUID
    party_name: str | None = None
    party_balance_after: Decimal | None = None
    date: dt.date
    amount: Decimal
    settlement: Settlement
    refund_amount: Decimal
    kept_amount: Decimal
    cash_account_id: uuid.UUID | None
    reason: str | None
    lines: list[dict]
    ledger_group_id: uuid.UUID | None
    created_by: uuid.UUID | None
    created_at: dt.datetime
