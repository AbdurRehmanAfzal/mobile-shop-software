import datetime as dt
import uuid
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.modules.sales.models import InvoiceStatus


class PendingAccessoryIn(BaseModel):
    kind: str = Field(pattern="^(box|charger|cable|earphones|airpods|other)$")
    label: str | None = Field(default=None, max_length=80)
    promised_at: dt.date | None = None


class DeviceSaleLineIn(BaseModel):
    device_id: uuid.UUID
    price: Decimal = Field(ge=0)
    warranty_days: int = Field(default=0, ge=0, le=3660)
    accessories_given: list[str] = Field(default_factory=list)
    accessories_pending: list[PendingAccessoryIn] = Field(default_factory=list)


class MiscSaleLineIn(BaseModel):
    description: str = Field(min_length=1, max_length=200)
    accessory_id: uuid.UUID | None = None
    qty: int = Field(default=1, ge=1, le=10000)
    unit_price: Decimal = Field(ge=0)
    cost: Decimal = Field(default=Decimal(0), ge=0)


class SaleCreate(BaseModel):
    party_id: uuid.UUID | None = None
    date: dt.date | None = None
    devices: list[DeviceSaleLineIn] = Field(default_factory=list)
    misc: list[MiscSaleLineIn] = Field(default_factory=list)
    discount: Decimal = Field(default=Decimal(0), ge=0)
    paid: Decimal = Field(default=Decimal(0), ge=0)
    cash_account_id: uuid.UUID | None = None
    notes: str | None = None
    override_reason: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def _lines(self):
        if not self.devices and not self.misc:
            raise ValueError("Add at least one device or item")
        ids = [d.device_id for d in self.devices]
        if len(ids) != len(set(ids)):
            raise ValueError("Duplicate device in the same sale")
        return self


class SaleLineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    line_no: int
    kind: str
    device_id: uuid.UUID | None
    accessory_id: uuid.UUID | None = None
    imei1: str | None = None
    device_label: str | None = None
    description: str | None
    qty: int
    unit_price: Decimal
    discount_share: Decimal
    tax_share: Decimal
    line_total: Decimal
    cost: Decimal | None
    profit: Decimal | None = None
    warranty_days: int
    accessories_given: list[str]
    accessories_pending: list[dict]
    returned_at: dt.datetime | None = None


class SaleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    no: str
    party_id: uuid.UUID | None
    party_name: str | None = None
    created_by_name: str | None = None
    party_balance_after: Decimal | None = None
    date: dt.date
    subtotal: Decimal
    discount: Decimal
    tax_rate: Decimal
    tax_inclusive: bool
    tax_amount: Decimal
    total: Decimal
    paid: Decimal
    balance_due: Decimal
    cost_total: Decimal | None
    returned_total: Decimal
    profit: Decimal | None
    cash_account_id: uuid.UUID | None
    status: InvoiceStatus
    ledger_group_id: uuid.UUID | None
    loan_id: uuid.UUID | None
    notes: str | None
    created_by: uuid.UUID | None
    created_at: dt.datetime
    void_reason: str | None
    lines: list[SaleLineOut] = Field(default_factory=list)


class VoidIn(BaseModel):
    reason: str = Field(min_length=3, max_length=300)
