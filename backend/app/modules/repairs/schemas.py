import datetime as dt
import uuid
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.modules.repairs.models import RepairStatus

FAULT_CODES = {
    "screen": ("Screen / display", "اسکرین"),
    "battery": ("Battery", "بیٹری"),
    "charging": ("Charging port", "چارجنگ پورٹ"),
    "mic": ("Microphone", "مائیک"),
    "speaker": ("Speaker", "اسپیکر"),
    "camera": ("Camera", "کیمرہ"),
    "network": ("Network / signal", "نیٹ ورک"),
    "software": ("Software / flashing", "سافٹ ویئر"),
    "water": ("Water damage", "پانی کا نقصان"),
    "dead": ("Dead / not powering on", "بند / آن نہیں ہوتا"),
    "buttons": ("Buttons", "بٹن"),
    "back_glass": ("Back glass / body", "پچھلا شیشہ / باڈی"),
    "other": ("Other", "دیگر"),
}
RECEIVED_ACCESSORIES = {"sim", "memory_card", "cover", "charger", "box", "earphones"}


class RepairCreate(BaseModel):
    party_id: uuid.UUID | None = None
    device_id: uuid.UUID | None = None
    device_desc: str | None = Field(default=None, max_length=200)
    imei: str | None = Field(default=None, max_length=20)
    fault_codes: list[str] = Field(default_factory=list)
    fault_text: str | None = None
    received_accessories: list[str] = Field(default_factory=list)
    condition_photos: list[str] = Field(default_factory=list)
    condition_notes: str | None = None
    estimate: Decimal = Field(default=Decimal(0), ge=0)
    advance: Decimal = Field(default=Decimal(0), ge=0)
    cash_account_id: uuid.UUID | None = None
    promised_at: dt.date | None = None
    technician_id: uuid.UUID | None = None
    outside_party_id: uuid.UUID | None = None
    notes: str | None = None

    @model_validator(mode="after")
    def _check(self):
        if not self.party_id and not self.device_id:
            raise ValueError("Select a customer or a stock device")
        if self.party_id and not self.device_id and not self.device_desc:
            raise ValueError("Describe the device")
        bad = [c for c in self.fault_codes if c not in FAULT_CODES]
        if bad:
            raise ValueError(f"Unknown fault code: {bad[0]}")
        bad = [a for a in self.received_accessories if a not in RECEIVED_ACCESSORIES]
        if bad:
            raise ValueError(f"Unknown accessory: {bad[0]}")
        if self.advance > self.estimate and self.estimate > 0:
            raise ValueError("Advance exceeds estimate")
        return self


class RepairUpdate(BaseModel):
    fault_codes: list[str] | None = None
    fault_text: str | None = None
    condition_notes: str | None = None
    estimate: Decimal | None = Field(default=None, ge=0)
    promised_at: dt.date | None = None
    technician_id: uuid.UUID | None = None
    outside_party_id: uuid.UUID | None = None
    labour: Decimal | None = Field(default=None, ge=0)
    discount: Decimal | None = Field(default=None, ge=0)
    warranty_days: int | None = Field(default=None, ge=0, le=365)
    notes: str | None = None


class PartIn(BaseModel):
    description: str = Field(min_length=1, max_length=200)
    accessory_id: uuid.UUID | None = None
    qty: int = Field(default=1, ge=1, le=100)
    unit_cost: Decimal = Field(default=Decimal(0), ge=0)
    unit_price: Decimal = Field(default=Decimal(0), ge=0)


class PartOut(PartIn):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID


class StatusIn(BaseModel):
    status: RepairStatus
    note: str | None = Field(default=None, max_length=500)


class DeliverIn(BaseModel):
    paid: Decimal = Field(default=Decimal(0), ge=0)
    cash_account_id: uuid.UUID | None = None
    labour: Decimal | None = Field(default=None, ge=0)
    discount: Decimal | None = Field(default=None, ge=0)
    warranty_days: int | None = Field(default=None, ge=0, le=365)
    outside_cost: Decimal | None = Field(
        default=None, ge=0, description="For stock devices: what the outside technician charged"
    )
    note: str | None = None


class StatusLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    from_status: str | None
    to_status: str
    note: str | None
    user_id: uuid.UUID | None
    user_name: str | None = None
    at: dt.datetime


class RepairOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    no: str
    party_id: uuid.UUID | None
    party_name: str | None = None
    party_phone: str | None = None
    device_id: uuid.UUID | None
    device_desc: str
    imei: str | None
    fault_codes: list[str]
    fault_text: str | None
    received_accessories: list[str]
    condition_photos: list[str]
    condition_notes: str | None
    estimate: Decimal
    advance: Decimal
    promised_at: dt.date | None
    overdue: bool = False
    technician_id: uuid.UUID | None
    technician_name: str | None = None
    outside_party_id: uuid.UUID | None
    outside_party_name: str | None = None
    outside_cost: Decimal
    status: RepairStatus
    parts_total: Decimal
    labour: Decimal
    discount: Decimal
    total: Decimal
    paid: Decimal
    balance_due: Decimal
    warranty_days: int
    delivered_at: dt.datetime | None
    notes: str | None
    advance_group_id: uuid.UUID | None
    bill_group_id: uuid.UUID | None
    created_at: dt.datetime
    parts: list[PartOut] = Field(default_factory=list)
    status_log: list[StatusLogOut] = Field(default_factory=list)
