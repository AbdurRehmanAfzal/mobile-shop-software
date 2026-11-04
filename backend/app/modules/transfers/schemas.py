import uuid

from pydantic import BaseModel, Field


class TransferItemIn(BaseModel):
    id: uuid.UUID
    qty: int = Field(gt=0, le=100_000)


class TransferIn(BaseModel):
    to_shop_id: uuid.UUID
    devices: list[uuid.UUID] = Field(default_factory=list, max_length=500)
    items: list[TransferItemIn] = Field(default_factory=list, max_length=500)
    note: str | None = Field(default=None, max_length=500)
