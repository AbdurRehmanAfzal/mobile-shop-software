import re
import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.core.pk import latin_digits
from app.modules.devices.state import (
    DeviceCondition,
    DeviceStatus,
    EventType,
    PtaStatus,
    VerificationStatus,
)


def clean_imei(value: str) -> str:
    digits = re.sub(r"\D", "", latin_digits(value))
    if len(digits) != 15:
        raise ValueError("IMEI must be 15 digits")
    return digits


# stylus and keyboard come with tablets, strap with watches (owner 2026-10-28)
ACCESSORY_KINDS = {
    "box",
    "charger",
    "cable",
    "earphones",
    "airpods",
    "stylus",
    "keyboard",
    "strap",
    "other",
}


class AccessoryItemIn(BaseModel):
    kind: str
    label: str | None = Field(default=None, max_length=80)
    came_with: bool = True
    condition: str | None = Field(default=None, max_length=40)
    pending_from: str = Field(default="none", pattern="^(none|vendor|shop)$")
    expected_at: date | None = None
    delivered_at: date | None = None
    given_at_sale: bool | None = None
    promised_to_customer_at: date | None = None
    notes: str | None = Field(default=None, max_length=200)

    @field_validator("kind")
    @classmethod
    def _kind(cls, v: str) -> str:
        if v not in ACCESSORY_KINDS:
            raise ValueError(f"kind must be one of {sorted(ACCESSORY_KINDS)}")
        return v


class AccessoryItemOut(AccessoryItemIn):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID


def clean_serial(value: str) -> str:
    v = re.sub(r"[\s\-]", "", latin_digits(value)).upper()
    if not re.fullmatch(r"[A-Z0-9]{4,20}", v):
        raise ValueError("Serial number: 4 to 20 letters or digits")
    return v


class DeviceIdentity(BaseModel):
    # phone | tablet | watch. A phone needs its IMEI; a Wi-Fi tablet or a smart watch may have only a
    # serial number, which then also identifies it (stored in imei1, unique per shop).
    category: Literal["phone", "tablet", "watch"] = "phone"
    # tablet / watch only: True = takes a SIM (Wi-Fi + SIM tablet, cellular watch)
    cellular: bool | None = None
    size_mm: int | None = Field(default=None, ge=20, le=60)  # a watch's case
    battery_health: int | None = Field(default=None, ge=1, le=100)
    imei1: str | None = None
    imei2: str | None = None
    serial: str | None = Field(default=None, max_length=60)
    brand_id: uuid.UUID
    model_id: uuid.UUID
    storage_id: uuid.UUID | None = None
    colour_id: uuid.UUID | None = None
    condition: DeviceCondition = DeviceCondition.USED
    pta_status: PtaStatus = PtaStatus.UNKNOWN
    sim_time_months: int | None = Field(default=None, ge=0, le=60)
    warranty_months: int = Field(default=0, ge=0, le=60)
    warranty_start: date | None = None
    patch_details: str | None = None
    notes: str | None = None
    photos: list[str] = Field(default_factory=list)

    @field_validator("imei1", "imei2")
    @classmethod
    def _imei(cls, v: str | None) -> str | None:
        return clean_imei(v) if v else None

    @field_validator("serial")
    @classmethod
    def _serial(cls, v: str | None) -> str | None:
        return clean_serial(v) if v else None

    @model_validator(mode="after")
    def _by_category(self):
        # what each kind of device has (owner 2026-10-28: a watch has no storage, IMEI 2 or JV)
        if self.category == "phone":
            self.cellular = None
            self.size_mm = None
        else:
            if self.cellular is None and self.imei1:
                self.cellular = True  # an IMEI means it takes a SIM (older apps did not say)
            if self.condition == DeviceCondition.PATCHED:
                raise ValueError("Patched is only for phones")
            if self.cellular and not self.imei1:
                raise ValueError("A device that takes a SIM needs its IMEI")
            if not self.cellular:
                # no SIM: no PTA, no SIM time
                self.pta_status = PtaStatus.UNKNOWN
                self.sim_time_months = None
            if self.category == "watch":
                self.storage_id = None
                self.imei2 = None
            else:
                self.size_mm = None
        return self

    @model_validator(mode="after")
    def _identity(self):
        if self.imei1 is None:
            if self.category == "phone":
                raise ValueError("IMEI is required for a phone")
            if not self.serial:
                raise ValueError("Write the IMEI or the serial number")
            self.imei1 = self.serial
        return self

    @model_validator(mode="after")
    def _sim_time(self):
        if self.pta_status in (PtaStatus.NON_PTA, PtaStatus.JV) and self.sim_time_months is None:
            raise ValueError("sim_time_months is required for Non-PTA and JV devices")
        if self.condition == DeviceCondition.PATCHED and not self.patch_details:
            raise ValueError("patch_details is required for patched devices")
        return self


class OpeningStockIn(DeviceIdentity):
    """Existing stock entered at onboarding: device + purchased event + Dr inventory / Cr equity."""

    cost_price: Decimal = Field(ge=0)
    asking_price: Decimal | None = Field(default=None, ge=0)
    accessories: list[AccessoryItemIn] = Field(default_factory=list)

    @model_validator(mode="after")
    def _asking_not_below_cost(self):
        # owner: the price you will sell at may not be lower than what you paid
        if self.asking_price is not None and self.asking_price < self.cost_price:
            raise ValueError("Selling price cannot be less than the buying price")
        return self


class DeviceUpdate(BaseModel):
    # owner 2026-10-30: a reason for an asking-price change, and the owner's PIN when the rule asks
    asking_reason: str | None = Field(default=None, max_length=300)
    approval_pin: str | None = Field(default=None, max_length=8)
    cellular: bool | None = None
    size_mm: int | None = Field(default=None, ge=20, le=60)
    battery_health: int | None = Field(default=None, ge=1, le=100)
    brand_id: uuid.UUID | None = None
    model_id: uuid.UUID | None = None
    imei2: str | None = None
    serial: str | None = None
    storage_id: uuid.UUID | None = None
    colour_id: uuid.UUID | None = None
    condition: DeviceCondition | None = None
    pta_status: PtaStatus | None = None
    sim_time_months: int | None = Field(default=None, ge=0, le=60)
    warranty_months: int | None = Field(default=None, ge=0, le=60)
    warranty_start: date | None = None
    patch_details: str | None = None
    notes: str | None = None
    photos: list[str] | None = None
    asking_price: Decimal | None = Field(default=None, ge=0)

    @field_validator("imei2")
    @classmethod
    def _imei(cls, v: str | None) -> str | None:
        return clean_imei(v) if v else None


class EventIn(BaseModel):
    type: EventType
    party_id: uuid.UUID | None = None
    note: str | None = Field(default=None, max_length=500)
    expected_back_at: date | None = None
    data: dict | None = None


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    seq: int
    type: EventType
    status_after: DeviceStatus
    party_id: uuid.UUID | None
    party_name: str | None = None
    amount: Decimal | None
    ledger_group_id: uuid.UUID | None
    document_type: str | None
    document_id: uuid.UUID | None
    data: dict | None
    user_id: uuid.UUID | None
    user_name: str | None = None
    at: datetime


class DeviceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    imei1: str
    imei2: str | None
    serial: str | None
    category: str = "phone"
    cellular: bool | None = None
    size_mm: int | None = None
    battery_health: int | None = None
    brand_id: uuid.UUID
    brand_name: str
    model_id: uuid.UUID
    model_name: str
    storage_id: uuid.UUID | None
    storage_name: str | None
    colour_id: uuid.UUID | None
    colour_name: str | None
    condition: DeviceCondition
    pta_status: PtaStatus
    sim_time_months: int | None
    warranty_months: int
    warranty_start: date | None
    patch_details: str | None
    notes: str | None
    photos: list[str]
    status: DeviceStatus
    current_party_id: uuid.UUID | None
    current_party_name: str | None
    verification_status: VerificationStatus
    cost_price: Decimal | None
    asking_price: Decimal | None
    cycle_no: int
    first_seen_at: datetime
    last_event_at: datetime
    event_count: int
    imei_luhn_ok: bool


class DeviceDetailOut(DeviceOut):
    accessories: list[AccessoryItemOut]
    recent_events: list[EventOut]


class ImeiLookupOut(BaseModel):
    found: bool
    device: DeviceOut | None = None
    seen_before: bool = False
    times_bought: int = 0
    luhn_ok: bool
