import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.pk import normalise_cnic, normalise_phone
from app.modules.parties.models import PartyKind


class PartyBase(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    name_ur: str | None = Field(default=None, max_length=200)
    phone: str
    alt_phone: str | None = None
    whatsapp: str | None = None
    cnic: str | None = None
    address: str | None = None
    city: str | None = Field(default=None, max_length=100)
    kinds: list[PartyKind] = Field(min_length=1)
    notes: str | None = None

    @field_validator("phone", "alt_phone", "whatsapp")
    @classmethod
    def _phone(cls, v: str | None) -> str | None:
        return normalise_phone(v) if v else None

    @field_validator("cnic")
    @classmethod
    def _cnic(cls, v: str | None) -> str | None:
        return normalise_cnic(v) if v else None

    @field_validator("kinds")
    @classmethod
    def _kinds(cls, v: list[PartyKind]) -> list[PartyKind]:
        return list(dict.fromkeys(v))  # dedupe, keep order


class PartyCreate(PartyBase):
    pass


class PartyUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    name_ur: str | None = None
    phone: str | None = None
    alt_phone: str | None = None
    whatsapp: str | None = None
    cnic: str | None = None
    address: str | None = None
    city: str | None = None
    kinds: list[PartyKind] | None = Field(default=None, min_length=1)
    notes: str | None = None
    is_active: bool | None = None

    @field_validator("phone", "alt_phone", "whatsapp")
    @classmethod
    def _phone(cls, v: str | None) -> str | None:
        return normalise_phone(v) if v else None

    @field_validator("cnic")
    @classmethod
    def _cnic(cls, v: str | None) -> str | None:
        return normalise_cnic(v) if v else None


class PartyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    name_ur: str | None
    phone: str
    alt_phone: str | None
    whatsapp: str | None
    cnic: str | None
    address: str | None
    city: str | None
    photo_path: str | None
    kinds: list[PartyKind]
    notes: str | None
    balance: Decimal
    is_active: bool
    created_at: datetime
    updated_at: datetime
