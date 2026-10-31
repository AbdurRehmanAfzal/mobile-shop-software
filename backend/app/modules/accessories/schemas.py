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


class SupplierSkuIn(BaseModel):
    party_id: uuid.UUID | None = None
    sku: str = Field(min_length=1, max_length=60)


class AccessoryDetails(BaseModel):
    """The optional product card (owner addendum 5): everything under "More details"."""

    brand: str | None = Field(default=None, max_length=80)
    compatible: str | None = Field(default=None, max_length=200)
    compatible_model_ids: list[uuid.UUID] | None = None
    grade: str | None = Field(default=None, max_length=20)
    color: str | None = Field(default=None, max_length=40)
    size: str | None = Field(default=None, max_length=40)
    capacity: str | None = Field(default=None, max_length=40)
    connector: str | None = Field(default=None, max_length=40)
    wattage: str | None = Field(default=None, max_length=20)
    warranty_days: int | None = Field(default=None, ge=0, le=3660)
    warranty_terms: str | None = Field(default=None, max_length=300)
    warranty_by: str | None = Field(default=None, pattern="^(shop|supplier)$")
    unit: str | None = Field(default=None, max_length=12)
    pack_units: dict[str, int] | None = None
    wholesale_price: Decimal | None = Field(default=None, ge=0)
    min_price: Decimal | None = Field(default=None, ge=0)
    promo_price: Decimal | None = Field(default=None, ge=0)
    promo_from: dt.date | None = None
    promo_to: dt.date | None = None
    pricing_mode: str | None = Field(default=None, pattern="^(fixed|markup)$")
    markup_pct: Decimal | None = Field(default=None, ge=0, le=1000)
    tax_rate: Decimal | None = Field(default=None, ge=0, le=100)
    tax_inclusive: bool | None = None
    max_stock: int | None = Field(default=None, ge=0)
    location: str | None = Field(default=None, max_length=60)
    show_in_sale: bool | None = None
    image_path: str | None = Field(default=None, max_length=500)
    description: str | None = Field(default=None, max_length=2000)
    supplier_skus: list[SupplierSkuIn] | None = None


class AccessoryCreate(AccessoryDetails):
    sku: str | None = Field(default=None, max_length=40)
    barcode: str | None = Field(default=None, max_length=64)
    barcode_type: str | None = Field(default=None, max_length=12)
    manufacturer_code: str | None = Field(default=None, max_length=64)
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


class AccessoryUpdate(AccessoryDetails):
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
    # owner addendum 5: a reason is required (damage / lost / count correction …)
    note: str = Field(min_length=2, max_length=200)

    @field_validator("qty_delta")
    @classmethod
    def _nz(cls, v: int) -> int:
        if v == 0:
            raise ValueError("qty_delta cannot be 0")
        return v


class BulkPriceIn(BaseModel):
    field: str = Field(default="price", pattern="^(price|wholesale_price|min_price)$")
    pct: Decimal | None = Field(default=None, ge=-90, le=1000)
    amount: Decimal | None = Field(default=None)
    category: str | None = None
    brand: str | None = None
    ids: list[uuid.UUID] | None = None


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
    barcode: str | None = None
    barcode_type: str | None = None
    manufacturer_code: str | None = None
    brand: str | None = None
    compatible: str | None = None
    compatible_model_ids: list[uuid.UUID] | None = None
    grade: str = "unspecified"
    color: str | None = None
    size: str | None = None
    capacity: str | None = None
    connector: str | None = None
    wattage: str | None = None
    warranty_days: int = 0
    warranty_terms: str | None = None
    warranty_by: str | None = None
    unit: str = "piece"
    pack_units: dict | None = None
    wholesale_price: Decimal | None = None
    min_price: Decimal | None = None
    promo_price: Decimal | None = None
    promo_from: dt.date | None = None
    promo_to: dt.date | None = None
    pricing_mode: str = "fixed"
    markup_pct: Decimal | None = None
    tax_rate: Decimal | None = None
    tax_inclusive: bool | None = None
    max_stock: int | None = None
    location: str | None = None
    show_in_sale: bool = True
    image_path: str | None = None
    description: str | None = None
    profit: Decimal | None = None
    margin_pct: Decimal | None = None
    stock_value: Decimal | None = None
    supplier_skus: list[dict] = []
    units: dict[str, int] = {}


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
