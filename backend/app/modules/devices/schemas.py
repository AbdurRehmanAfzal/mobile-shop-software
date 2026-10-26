import re
import uuid
from datetime import date, datetime
from decimal import Decimal

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


ACCESSORY_KINDS = {"box", "charger", "cable", "earphones", "airpods", "other"}


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


class DeviceIdentity(BaseModel):
    imei1: str
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


class DeviceUpdate(BaseModel):
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
