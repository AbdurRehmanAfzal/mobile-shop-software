"""Staff access requests (owner 2026-11-14, ADR-077). Staff ask; only the owner answers."""

import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Depends

from app.core.permissions import Cap
from app.core.tenancy import DB, Ctx, require_cap
from app.modules.staffaccess import service

router = APIRouter(prefix="/api/v1/staff-access", tags=["staff-access"])
Owner = Annotated[Ctx, Depends(require_cap(Cap.MANAGE_STAFF))]
Kind = Literal["stock_tally"]


@router.get("/{kind}")
def state(kind: Kind, ctx: Ctx, db: DB):
    """owner / manager: allowed (and the owner gets the requests); staff: their own request"""
    if ctx.can(Cap.REPORTS_ALL):
        return {
            "allowed": True,
            "status": None,
            "requests": service.listing(db, ctx.shop_id, kind)
            if ctx.can(Cap.MANAGE_STAFF)
            else None,
        }
    return {**service.mine(db, ctx.shop_id, ctx.id, kind), "requests": None}


@router.post("/{kind}/request")
def ask(kind: Kind, ctx: Ctx, db: DB):
    return service.ask(db, ctx.shop_id, ctx.id, kind)


@router.post("/requests/{request_id}/{action}")
def decide(
    request_id: uuid.UUID, action: Literal["approve", "reject", "revoke"], ctx: Owner, db: DB
):
    return service.decide(db, ctx.shop_id, ctx.id, request_id, action)
