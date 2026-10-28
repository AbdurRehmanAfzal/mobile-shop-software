import datetime as dt
import uuid
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.modules.accessories.models import CATEGORIES


def clean_category(v: str) -> str:
    """A known kind (charger, watch, ...) or the shop's own word for a new kind, e.g. "Ring light"
    (owner, 2026-10-28: "speaker bhi purchase karte hain ... new item add ka option")."""
    v = " ".join(v.split())
    if not v:
        raise ValueError("Write what kind of item it is")
    if len(v) > 20:
        raise ValueError("Kind of item: at most 20 letters")
    return v.lower() if v.lower() in CATEGORIES else v


class AccessoryCreate(BaseModel):
    sku: str | None = Field(default=None, max_length=40)
    name: str = Field(min_length=1, max_length=150)
    name_ur: str | None = Field(default=None, max_length=150)
    category: str = "other"
    price: Decimal = Field(default=Decimal(0), ge=0)
    reorder_level: int = Field(default=5, ge=0)
    opening_qty: int = Field(default=0, ge=0)
    opening_cost: Decimal = Field(
        default=Decimal(0), ge=0, description="unit cost of the opening quantity"
    )

    @field_validator("category")
    @classmethod
    def _cat(cls, v: str) -> str:
        return clean_category(v)


class AccessoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    name_ur: str | None = None
    category: str | None = None
    price: Decimal | None = Field(default=None, ge=0)
    reorder_level: int | None = Field(default=None, ge=0)
    is_active: bool | None = None

    @field_validator("category")
    @classmethod
    def _cat(cls, v: str | None) -> str | None:
        return None if v is None else clean_category(v)


class AdjustIn(BaseModel):
    qty_delta: int = Field(description="positive = found/add, negative = lost/damaged")
    unit_cost: Decimal | None = Field(default=None, ge=0)
    note: str | None = Field(default=None, max_length=200)

    @field_validator("qty_delta")
    @classmethod
    def _nz(cls, v: int) -> int:
        if v == 0:
            raise ValueError("qty_delta cannot be 0")
        return v


class AccessoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    sku: str
    name: str
    name_ur: str | None
    category: str
    qty: int
    avg_cost: Decimal | None
    price: Decimal
    reorder_level: int
    is_active: bool
    low_stock: bool = False


class MovementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    qty_delta: int
    qty_after: int
    reason: str
    unit_cost: Decimal
    document_type: str | None
    document_id: uuid.UUID | None
    note: str | None
    at: dt.datetime


class PendingItemOut(BaseModel):
    item_id: uuid.UUID
    device_id: uuid.UUID
    imei1: str
    device_label: str
    kind: str
    label: str | None
    pending_from: str
    expected_at: dt.date | None
    promised_to_customer_at: dt.date | None
    party_id: uuid.UUID | None
    party_name: str | None
    party_phone: str | None
    overdue: bool
