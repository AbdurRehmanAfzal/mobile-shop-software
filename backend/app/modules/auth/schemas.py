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
    otp_token: str | None = None  # required when SIGNUP_OTP is on

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
    # docs/30: the app shows the logo and writes money with the shop's currency label
    logo_path: str | None = None
    currency: dict | None = None


class ShopSettingsOut(ShopOut):
    """Everything the settings screen shows, so saved values are visible when it opens."""

    ntn: str | None = None
    strn: str | None = None
    tax_rate: Decimal = Decimal(0)
    tax_inclusive: bool = True
    receipt_footer: str | None = None
    receipt_footer_ur: str | None = None
    invoice_prefix: str = "INV"
    fingerprint_staff: bool = False
    label_code_word: str | None = None
    label_prefs: dict | None = None
    sale_rules: dict | None = None
    audit_prefs: dict | None = None
    item_prefs: dict | None = None
    device_prefs: dict | None = None
    address: str | None = None
    whatsapp: str | None = None
    legal_name: str | None = None
    tagline: str | None = None
    tagline_ur: str | None = None
    business_type: str | None = None
    registration_no: str | None = None
    established_year: int | None = None
    province: str | None = None
    email: str | None = None
    website: str | None = None
    social: dict | None = None
    opening_hours: str | None = None
    owner_name: str | None = None
    owner_cnic: str | None = None
    fbr_pos_id: str | None = None
    bank_details: dict | None = None
    terms: str | None = None
    terms_ur: str | None = None
    print_prefs: dict | None = None


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


class PlanOut(BaseModel):
    modules: list[str] = []
    modules_custom: bool = False
    plan: str
    expires_at: datetime | None
    days_left: int | None
    monthly_fee: Decimal
    status: str  # unlimited | ok | due_soon | expired | locked
    grace_days: int
    started_at: datetime | None = None
    pending_payment_id: str | None = None


class MeOut(BaseModel):
    user: UserOut
    shops: list[ShopOut]
    active_shop_id: uuid.UUID | None
    plan: PlanOut | None = None


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
    fingerprint_staff: bool | None = None
    default_locale: str | None = Field(default=None, pattern="^(en|ur)$")
    label_code_word: str | None = Field(default=None, min_length=10, max_length=10)
    label_prefs: dict | None = None
    sale_rules: dict | None = None
    audit_prefs: dict | None = None
    item_prefs: dict | None = None
    device_prefs: dict | None = None
    # business profile (docs/30)
    legal_name: str | None = Field(default=None, max_length=200)
    tagline: str | None = Field(default=None, max_length=120)
    tagline_ur: str | None = Field(default=None, max_length=120)
    business_type: str | None = Field(default=None, pattern="^(sole|partnership|company|aop|other)$")
    registration_no: str | None = Field(default=None, max_length=40)
    established_year: int | None = Field(default=None, ge=1900, le=2100)
    province: str | None = Field(default=None, pattern="^(punjab|sindh|kpk|balochistan|islamabad|gb|ajk)$")
    email: str | None = Field(default=None, max_length=120)
    website: str | None = Field(default=None, max_length=160)
    social: dict | None = None
    opening_hours: str | None = Field(default=None, max_length=120)
    owner_name: str | None = Field(default=None, max_length=120)
    owner_cnic: str | None = None
    fbr_pos_id: str | None = Field(default=None, max_length=40)
    bank_details: dict | None = None
    terms: str | None = Field(default=None, max_length=1000)
    terms_ur: str | None = Field(default=None, max_length=1000)
    currency: dict | None = None
    print_prefs: dict | None = None

    @field_validator("ntn")
    @classmethod
    def _ntn(cls, v: str | None) -> str | None:
        from app.modules.auth.profile import clean_ntn

        return clean_ntn(v)

    @field_validator("strn")
    @classmethod
    def _strn(cls, v: str | None) -> str | None:
        from app.modules.auth.profile import clean_strn

        return clean_strn(v)

    @field_validator("owner_cnic")
    @classmethod
    def _cnic(cls, v: str | None) -> str | None:
        from app.core.pk import normalise_cnic

        return normalise_cnic(v) if v and v.strip() else None

    @field_validator("email")
    @classmethod
    def _email(cls, v: str | None) -> str | None:
        if not v or not v.strip():
            return None
        v = v.strip()
        if "@" not in v or "." not in v.split("@")[-1]:
            raise ValueError("Email looks wrong")
        return v

    @field_validator("currency")
    @classmethod
    def _currency(cls, v: dict | None) -> dict | None:
        from app.modules.auth.profile import clean_currency

        return clean_currency(v)

    @field_validator("print_prefs")
    @classmethod
    def _print(cls, v: dict | None) -> dict | None:
        from app.modules.auth.profile import clean_print_prefs

        return clean_print_prefs(v)

    @field_validator("social")
    @classmethod
    def _social(cls, v: dict | None) -> dict | None:
        from app.modules.auth.profile import clean_social

        return clean_social(v)

    @field_validator("bank_details")
    @classmethod
    def _bank(cls, v: dict | None) -> dict | None:
        from app.modules.auth.profile import clean_bank

        return clean_bank(v)

    @field_validator("device_prefs")
    @classmethod
    def _device_prefs(cls, v: dict | None) -> dict | None:
        from app.modules.devices.types import clean_prefs

        return clean_prefs(v)

    @field_validator("item_prefs")
    @classmethod
    def _item_prefs(cls, v: dict | None) -> dict | None:
        from app.modules.accessories.stock import clean_prefs

        return clean_prefs(v)

    @field_validator("sale_rules")
    @classmethod
    def _rules(cls, v: dict | None) -> dict | None:
        from app.modules.sales.approval import clean_rules

        return clean_rules(v)

    @field_validator("audit_prefs")
    @classmethod
    def _audit_prefs(cls, v: dict | None) -> dict | None:
        from app.modules.shopaudit.prefs import clean_prefs

        return clean_prefs(v)

    @field_validator("label_code_word")
    @classmethod
    def _code_word(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.upper()
        if not v.isalpha() or len(set(v)) != 10:
            raise ValueError("10 different letters")
        return v
