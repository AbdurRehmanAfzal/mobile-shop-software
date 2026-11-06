"""FBR Digital Invoicing (docs/36 §4, ADR-050): the owner's settings and test, the bills' status, and
"send again". The token is write-only."""

import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.core.permissions import Cap
from app.core.tenancy import DB, Ctx, require_cap
from app.modules.fbr import service

router = APIRouter(prefix="/api/v1/fbr", tags=["fbr"])
Owner = Annotated[Ctx, Depends(require_cap(Cap.MANAGE_SETTINGS))]
Staff = Annotated[Ctx, Depends(require_cap(Cap.TRANSACT))]


class KindIn(BaseModel):
    sale_type: str | None = Field(default=None, max_length=80)
    hs_code: str | None = Field(default=None, max_length=20)
    scenario: str | None = Field(default=None, max_length=10)


class SettingsIn(BaseModel):
    enabled: bool | None = None
    env: Literal["sandbox", "production"] | None = None
    province: str | None = Field(default=None, max_length=20)
    token: str | None = Field(default=None, max_length=2000)
    clear_token: bool = False
    kinds: dict[Literal["phone", "device", "item"], KindIn] | None = None


@router.get("/settings")
def get_settings(ctx: Owner):
    return service.settings_out(ctx.shop)


@router.put("/settings")
def put_settings(data: SettingsIn, ctx: Owner, db: DB):
    raw = data.model_dump(exclude_none=True)
    if data.kinds:
        raw["kinds"] = {k: v.model_dump(exclude_none=True) for k, v in data.kinds.items()}
    return service.save_settings(db, ctx.shop, raw)


@router.post("/test")
def test(ctx: Owner, db: DB):
    return service.test_connection(db, ctx.shop)


@router.get("/submissions")
def list_submissions(ctx: Staff, db: DB, status: str | None = None):
    return service.submissions(db, ctx.shop_id, status)


@router.get("/invoice/{invoice_id}")
def invoice_status(invoice_id: uuid.UUID, ctx: Staff, db: DB):
    sub = service.for_invoice(db, invoice_id)
    if sub is None or sub.shop_id != ctx.shop_id:
        return None
    return service.sub_out(sub)


@router.post("/submissions/{sub_id}/send")
def send_again(sub_id: uuid.UUID, ctx: Staff, db: DB):
    return service.sub_out(service.retry(db, ctx.shop_id, sub_id))


@router.post("/send-pending")
def send_pending(ctx: Staff, db: DB):
    return {"tried": service.send_pending(db, shop_id=ctx.shop_id)}
