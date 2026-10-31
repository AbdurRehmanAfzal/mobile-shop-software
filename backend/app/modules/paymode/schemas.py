import datetime as dt
import uuid
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.modules.paymode.models import PayMethod


class PaymentInfo(BaseModel):
    """How the money paid now was paid. Only what the shopkeeper needs to find it again later."""

    method: PayMethod = PayMethod.CASH
    bank: str | None = Field(default=None, max_length=80)  # bank / wallet / cheque's bank
    reference: str | None = Field(default=None, max_length=80)  # TID, cheque no, MTCN
    cheque_date: dt.date | None = None
    sender_name: str | None = Field(default=None, max_length=120)
    country: str | None = Field(default=None, max_length=60)
    currency: str | None = Field(default=None, pattern=r"^[A-Z]{3}$")
    foreign_amount: Decimal | None = Field(default=None, gt=0)
    rate: Decimal | None = Field(default=None, gt=0)
    service: str | None = Field(default=None, max_length=60)
    fee: Decimal | None = Field(default=None, ge=0)
    status: str | None = Field(default=None, pattern=r"^(pending|received|settled)$")

    @model_validator(mode="after")
    def _needed(self):
        m = self.method
        if m == PayMethod.ONLINE and not self.bank:
            raise ValueError("Choose the bank or wallet")
        if m == PayMethod.CHEQUE and not (self.bank and self.reference):
            raise ValueError("Cheque needs the bank and the cheque number")
        if m == PayMethod.REMITTANCE and not (
            self.currency and self.foreign_amount and self.rate and self.sender_name
        ):
            raise ValueError("Remittance needs the currency, amount, rate and sender's name")
        return self


class PaymentDetailOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    method: str
    amount: Decimal
    bank: str | None
    reference: str | None
    cheque_date: dt.date | None
    sender_name: str | None
    country: str | None
    currency: str | None
    foreign_amount: Decimal | None
    rate: Decimal | None
    service: str | None
    fee: Decimal | None = None
    status: str | None = None
