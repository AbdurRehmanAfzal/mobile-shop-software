import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.pk import normalise_cnic
from app.modules.devices.state import PtaStatus


class VerificationIn(BaseModel):
    seller_party_id: uuid.UUID | None = None
    cnic_no: str | None = None
    cnic_front_path: str | None = None
    cnic_back_path: str | None = None
    seller_photo_path: str | None = None
    device_photos: list[str] = Field(default_factory=list)
    egadget_result: str = Field(default="not_checked", pattern="^(clear|flagged|not_checked)$")
    egadget_ref: str | None = Field(default=None, max_length=80)
    egadget_screenshot_path: str | None = None
    pta_checked: bool = False
    pta_result: PtaStatus | None = None
    declaration_signed: bool = False
    declaration_path: str | None = None
    physical_notes: str | None = None

    @field_validator("cnic_no")
    @classmethod
    def _cnic(cls, v: str | None) -> str | None:
        return normalise_cnic(v) if v else None


class VerificationOut(VerificationIn):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    device_id: uuid.UUID
    cycle_no: int
    result: str
    missing: list[str]
    checked_by: uuid.UUID | None
    checked_at: datetime | None
    override_by: uuid.UUID | None
    override_reason: str | None
    override_at: datetime | None


class OverrideIn(BaseModel):
    reason: str = Field(min_length=5, max_length=500)
