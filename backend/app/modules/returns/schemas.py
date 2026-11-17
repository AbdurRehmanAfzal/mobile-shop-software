import datetime as dt
import uuid
from decimal import Decimal
from typing import Literal

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
    reason_code: (
        Literal[
            "changed_mind", "fault", "not_as_told", "price", "another_phone", "not_selling", "other"
        ]
        | None
    ) = None
    date: dt.date | None = None
    # ADR-101: how it came back — a damaged phone goes to Faulty instead of normal stock
    item_condition: Literal["ok", "damaged"] | None = None
    # ADR-101: the return entered by mistake (already undone) that this one corrects
    replaces_id: uuid.UUID | None = None
    # ADR-102: the fingerprint the preview handed out; a confirm that carries it is refused
    # (`preview_stale`) when something changed since the preview
    preview_token: str | None = Field(default=None, max_length=64)


class PurchaseReturnIn(BaseModel):
    purchase_id: uuid.UUID
    line_ids: list[uuid.UUID] = Field(min_length=1)
    refund_amount: Decimal = Field(
        default=Decimal(0), ge=0, description="cash the supplier hands back now"
    )
    # owner 2026-11-15 (ADR-081): the seller takes it back for less (a cut) — the shop's loss
    cut_amount: Decimal = Field(
        default=Decimal(0), ge=0, description="the seller takes the phone back for this much less"
    )
    cash_account_id: uuid.UUID | None = None
    reason: str | None = Field(default=None, max_length=300)
    reason_code: (
        Literal[
            "changed_mind", "fault", "not_as_told", "price", "another_phone", "not_selling", "other"
        ]
        | None
    ) = None
    date: dt.date | None = None
    replaces_id: uuid.UUID | None = None  # ADR-101
    # ADR-102: the fingerprint the preview handed out; a confirm that carries it is refused
    # (`preview_stale`) when something changed since the preview
    preview_token: str | None = Field(default=None, max_length=64)


class ReturnDetailsIn(BaseModel):
    """ADR-101: what may be corrected on a return without touching money or stock"""

    reason: str | None = Field(default=None, max_length=300)
    reason_code: (
        Literal[
            "changed_mind", "fault", "not_as_told", "price", "another_phone", "not_selling", "other"
        ]
        | None
    ) = None


class ReturnReplaceIn(BaseModel):
    """ADR-101: a return corrected in one step — the old one is undone and the right one
    entered, both or neither. Give `sale` or `purchase`, whichever the right return is."""

    reason: str = Field(min_length=2, max_length=300)
    # ADR-102: the fingerprint the preview handed out; a confirm that carries it is refused
    # (`preview_stale`) when something changed since the preview
    preview_token: str | None = Field(default=None, max_length=64)
    sale: SaleReturnIn | None = None
    purchase: PurchaseReturnIn | None = None


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
    reason_code: str | None = None
    status: str = "posted"  # ADR-090: posted | voided
    void_reason: str | None = None
    voided_at: dt.datetime | None = None
    voided_by: uuid.UUID | None = None
    item_condition: str | None = None
    replaces_id: uuid.UUID | None = None
    replaces_no: str | None = None
    replaced_by_no: str | None = None
    lines: list[dict]
    ledger_group_id: uuid.UUID | None
    created_by: uuid.UUID | None
    created_at: dt.datetime
