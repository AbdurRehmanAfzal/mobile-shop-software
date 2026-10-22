import datetime as dt
import uuid

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.core.pk import normalise_phone


class NotificationSettings(BaseModel):
    """Stored as JSON on the shop. Everything optional and off by default."""

    owner_whatsapp: str | None = None
    owner_email: EmailStr | None = None
    owner_on_sale_whatsapp: bool = False
    owner_on_sale_email: bool = False
    owner_on_purchase_whatsapp: bool = False
    owner_on_purchase_email: bool = False
    customer_on_sale_whatsapp: bool = False
    customer_on_sale_email: bool = False
    seller_on_purchase_whatsapp: bool = False
    seller_on_purchase_email: bool = False
    customer_on_payment_whatsapp: bool = False
    language: str | None = Field(
        default=None, pattern="^(en|ur)$", description="None = shop default language"
    )

    @field_validator("owner_whatsapp")
    @classmethod
    def _phone(cls, v: str | None) -> str | None:
        return normalise_phone(v) if v else None


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    channel: str
    audience: str
    recipient: str
    party_id: uuid.UUID | None
    template_key: str
    lang: str
    subject: str | None
    body: str
    link: str | None
    event_type: str
    document_type: str | None
    document_id: uuid.UUID | None
    status: str
    provider: str | None
    error: str | None
    created_at: dt.datetime
    sent_at: dt.datetime | None
