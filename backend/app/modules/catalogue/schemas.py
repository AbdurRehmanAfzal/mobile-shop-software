import uuid
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class BrandOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    name_ur: str | None
    is_global: bool = Field(description="True when part of the shared catalogue")
    model_count: int = 0


class BrandCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    name_ur: str | None = Field(default=None, max_length=100)


class ModelOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    brand_id: uuid.UUID
    name: str
    name_ur: str | None
    reference_price: Decimal | None
    is_feature_phone: bool
    is_global: bool


class ModelCreate(BaseModel):
    brand_id: uuid.UUID
    name: str = Field(min_length=1, max_length=150)
    name_ur: str | None = Field(default=None, max_length=150)
    reference_price: Decimal | None = Field(default=None, ge=0)
    is_feature_phone: bool = False


class StorageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    name_ur: str | None
    gigabytes: int
    is_global: bool = False


class ColourOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    name_ur: str | None
    hex: str | None
    is_global: bool = False


class SimpleCreate(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    name_ur: str | None = Field(default=None, max_length=50)


class StorageCreate(SimpleCreate):
    gigabytes: int = Field(ge=1, le=4096)


class ColourCreate(SimpleCreate):
    hex: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")


class CatalogueUpdate(BaseModel):
    """Rename a shop-own catalogue row (one name, any language). Storage may also change size."""

    name: str = Field(min_length=1, max_length=100)
    gigabytes: int | None = Field(default=None, ge=1, le=4096)
