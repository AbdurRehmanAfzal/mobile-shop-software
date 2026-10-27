import datetime as dt
import uuid
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.modules.purchases.schemas import DeviceLineIn
from app.modules.sales.schemas import DeviceSaleLineIn, MiscSaleLineIn


class ExchangeCreate(BaseModel):
    party_id: uuid.UUID
    trade_in: list[DeviceLineIn] = Field(
        min_length=1, description="Old device(s) the customer hands in; cost = trade-in value"
    )
    devices: list[DeviceSaleLineIn] = Field(default_factory=list)
    misc: list[MiscSaleLineIn] = Field(default_factory=list)
    discount: Decimal = Field(default=Decimal(0), ge=0)
    paid: Decimal = Field(
        default=Decimal(0), ge=0, description="Cash the customer pays now (after trade-in credit)"
    )
    refund: Decimal = Field(
        default=Decimal(0),
        ge=0,
        description="Cash the shop pays out when trade-in exceeds the new price",
    )
    cash_account_id: uuid.UUID | None = None
    override_reason: str | None = Field(default=None, max_length=500)
    notes: str | None = None


class ExchangeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    no: str
    party_id: uuid.UUID
    party_name: str | None = None
    date: dt.date
    purchase_id: uuid.UUID
    purchase_no: str | None = None
    invoice_id: uuid.UUID
    invoice_no: str | None = None
    trade_in_value: Decimal
    new_total: Decimal
    previous_balance: Decimal
    paid: Decimal
    new_balance: Decimal
    notes: str | None
    created_at: dt.datetime
