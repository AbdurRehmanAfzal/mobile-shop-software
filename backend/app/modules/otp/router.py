from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.core.pk import normalise_phone
from app.core.tenancy import DB
from app.modules.otp import service

router = APIRouter(prefix="/api/v1/auth/otp", tags=["auth"])


class SendIn(BaseModel):
    phone: str
    purpose: str = Field(pattern="^(reset|signup)$")
    lang: str = Field(default="ur", pattern="^(en|ur)$")


class VerifyIn(BaseModel):
    phone: str
    purpose: str = Field(pattern="^(reset|signup)$")
    code: str = Field(min_length=4, max_length=8)


def _phone(raw: str) -> str | None:
    try:
        return normalise_phone(raw)
    except ValueError:
        return None


@router.post("/send")
def send(data: SendIn, db: DB):
    phone = _phone(data.phone)
    if phone is None:
        return {"delivery": "unknown"}
    return service.send(db, phone, data.purpose, data.lang)


@router.post("/verify")
def verify(data: VerifyIn, db: DB):
    phone = _phone(data.phone)
    if phone is None:
        raise service.OtpInvalid()
    return {"otp_token": service.verify(db, phone, data.purpose, data.code)}
