import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.core.permissions import Role
from app.core.pk import normalise_phone


class SignupRequest(BaseModel):
    shop_name: str = Field(min_length=2, max_length=200)
    shop_name_ur: str | None = Field(default=None, max_length=200)
    city: str | None = Field(default=None, max_length=100)
    owner_name: str = Field(min_length=2, max_length=200)
    phone: str
    email: EmailStr | None = None
    password: str = Field(min_length=6, max_length=128)
    locale: str = Field(default="ur", pattern="^(en|ur)$")

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str) -> str:
        return normalise_phone(v)


class LoginRequest(BaseModel):
    phone: str
    password: str

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str) -> str:
        return normalise_phone(v)


class PinLoginRequest(BaseModel):
    phone: str
    pin: str = Field(pattern=r"^\d{4,6}$")

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str) -> str:
        return normalise_phone(v)


class SetPinRequest(BaseModel):
    password: str
    pin: str | None = Field(default=None, pattern=r"^\d{4,6}$")


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class ShopOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    name_ur: str | None
    city: str | None
    phone: str | None
    default_locale: str
    tax_enabled: bool
    is_active: bool


class ShopSettingsOut(ShopOut):
    """Everything the settings screen shows, so saved values are visible when it opens."""

    ntn: str | None = None
    strn: str | None = None
    tax_rate: Decimal = Decimal(0)
    tax_inclusive: bool = True
    receipt_footer: str | None = None
    receipt_footer_ur: str | None = None
    invoice_prefix: str = "INV"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    organisation_id: uuid.UUID
    name: str
    phone: str
    email: str | None
    role: Role
    locale: str
    is_active: bool
    last_login_at: datetime | None
    has_pin: bool = False
    is_superuser: bool = False


class MeOut(BaseModel):
    user: UserOut
    shops: list[ShopOut]
    active_shop_id: uuid.UUID | None


class AuthResponse(BaseModel):
    tokens: TokenPair
    me: MeOut


class StaffCreate(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    phone: str
    password: str = Field(min_length=6, max_length=128)
    pin: str | None = Field(default=None, pattern=r"^\d{4,6}$")
    role: Role
    shop_ids: list[uuid.UUID] = Field(default_factory=list)
    locale: str = Field(default="ur", pattern="^(en|ur)$")

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str) -> str:
        return normalise_phone(v)

    @field_validator("role")
    @classmethod
    def _not_owner(cls, v: Role) -> Role:
        if v == Role.OWNER:
            raise ValueError("Use shop transfer to add another owner")
        return v


class StaffUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    role: Role | None = None
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=6, max_length=128)
    pin: str | None = Field(default=None, pattern=r"^\d{4,6}$")
    shop_ids: list[uuid.UUID] | None = None
    locale: str | None = Field(default=None, pattern="^(en|ur)$")


class ShopCreate(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    name_ur: str | None = Field(default=None, max_length=200)
    city: str | None = Field(default=None, max_length=100)
    phone: str | None = None
    address: str | None = None


class ShopUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    name_ur: str | None = None
    city: str | None = None
    phone: str | None = None
    whatsapp: str | None = None
    address: str | None = None
    ntn: str | None = None
    strn: str | None = None
    tax_enabled: bool | None = None
    tax_rate: float | None = Field(default=None, ge=0, le=100)
    tax_inclusive: bool | None = None
    receipt_footer: str | None = None
    receipt_footer_ur: str | None = None
    invoice_prefix: str | None = Field(default=None, min_length=1, max_length=10)
    default_locale: str | None = Field(default=None, pattern="^(en|ur)$")
