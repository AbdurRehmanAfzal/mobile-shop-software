import datetime as dt
import uuid
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.modules.devices.schemas import AccessoryItemIn, DeviceIdentity
from app.modules.paymode.schemas import PaymentDetailOut, PaymentInfo
from app.modules.purchases.models import PurchaseKind, PurchaseStatus


class DeviceLineIn(BaseModel):
    device: DeviceIdentity
    cost: Decimal = Field(ge=0)
    asking_price: Decimal | None = Field(default=None, ge=0)
    accessories: list[AccessoryItemIn] = Field(default_factory=list)

    @model_validator(mode="after")
    def _asking_not_below_cost(self):
        # owner: the price you will sell at may not be lower than what you paid
        if self.asking_price is not None and self.asking_price < self.cost:
            raise ValueError("Selling price cannot be less than the buying price")
        return self


class MiscLineIn(BaseModel):
    description: str = Field(min_length=1, max_length=200)
    accessory_id: uuid.UUID | None = None
    qty: int = Field(default=1, ge=1, le=10000)
    unit_cost: Decimal = Field(ge=0)


class PurchaseCreate(BaseModel):
    due_date: dt.date | None = None  # when we promised to pay the supplier
    kind: PurchaseKind
    party_id: uuid.UUID
    date: dt.date | None = None
    # when it was actually bought; default now. Lets a busy shopkeeper enter it later.
    purchased_at: dt.datetime | None = None
    devices: list[DeviceLineIn] = Field(default_factory=list)
    misc: list[MiscLineIn] = Field(default_factory=list)
    discount: Decimal = Field(default=Decimal(0), ge=0)
    paid: Decimal = Field(default=Decimal(0), ge=0)
    cash_account_id: uuid.UUID | None = None
    payment: PaymentInfo | None = None  # how the money paid now was paid
    reference: str | None = Field(default=None, max_length=80)
    notes: str | None = None

    @model_validator(mode="after")
    def _lines(self):
        if not self.devices and not self.misc:
            raise ValueError("Add at least one device or item")
        imeis = [d.device.imei1 for d in self.devices]
        if len(imeis) != len(set(imeis)):
            raise ValueError("Duplicate IMEI in the same purchase")
        return self


class LineOut(BaseModel):
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
    unit_cost: Decimal
    discount_share: Decimal
    net_cost: Decimal
    returned_at: dt.datetime | None = None


class PurchaseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    no: str
    payment: PaymentDetailOut | None = None
    created_by_name: str | None = None
    kind: PurchaseKind
    party_id: uuid.UUID
    party_name: str | None = None
    date: dt.date
    due_date: dt.date | None = None
    purchased_at: dt.datetime | None = None
    subtotal: Decimal
    discount: Decimal
    total: Decimal
    paid: Decimal
    returned_total: Decimal
    balance_due: Decimal
    cash_account_id: uuid.UUID | None
    status: PurchaseStatus
    ledger_group_id: uuid.UUID | None
    reference: str | None
    notes: str | None
    created_by: uuid.UUID | None
    created_at: dt.datetime
    void_reason: str | None
    lines: list[LineOut] = Field(default_factory=list)


class VoidIn(BaseModel):
    reason: str = Field(min_length=3, max_length=300)
