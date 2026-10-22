import uuid
from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import HTMLResponse

from app.core.errors import NotFound
from app.core.permissions import Cap
from app.core.tenancy import DB, Ctx, require_cap
from app.modules.devices.service import get_device
from app.modules.verification import service
from app.modules.verification.schemas import OverrideIn, VerificationIn, VerificationOut

router = APIRouter(prefix="/api/v1/devices/{device_id}/verification", tags=["verification"])
Transact = Annotated[Ctx, Depends(require_cap(Cap.TRANSACT))]


@router.get("", response_model=VerificationOut)
def get_verification(device_id: uuid.UUID, ctx: Ctx, db: DB):
    device = get_device(db, ctx.shop_id, device_id)
    v = service.latest(db, ctx.shop_id, device)
    if v is None:
        raise NotFound(
            code="verification_not_found",
            message_en="Not verified yet",
            message_ur="ابھی تصدیق نہیں ہوئی",
        )
    return v


@router.put("", response_model=VerificationOut)
def put_verification(device_id: uuid.UUID, data: VerificationIn, ctx: Transact, db: DB):
    return service.upsert(db, ctx.shop_id, ctx.id, device_id, data)


@router.post("/override", response_model=VerificationOut)
def override(device_id: uuid.UUID, data: OverrideIn, ctx: Ctx, db: DB):
    return service.override(db, ctx.shop_id, ctx, device_id, data.reason)


@router.get("/declaration", response_class=HTMLResponse)
def declaration(device_id: uuid.UUID, ctx: Ctx, db: DB):
    return service.declaration_html(db, ctx.shop_id, device_id)
