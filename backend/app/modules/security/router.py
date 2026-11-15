"""Login security (owner 2026-11-15, ADR-080): the owner's rules, devices and "log staff out"."""

import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.permissions import Cap
from app.core.tenancy import DB, Ctx, require_cap
from app.modules.security import service

router = APIRouter(prefix="/api/v1/security", tags=["security"])
Owner = Annotated[Ctx, Depends(require_cap(Cap.MANAGE_STAFF))]


class RulesIn(BaseModel):
    device_approval: bool | None = None
    hours_on: bool | None = None
    hours_from: str | None = None
    hours_to: str | None = None


@router.get("")
def state(ctx: Owner, db: DB):
    return service.state(db, ctx.organisation_id)


@router.put("/rules")
def set_rules(data: RulesIn, ctx: Owner, db: DB):
    return service.set_rules(db, ctx.organisation_id, data.model_dump(exclude_unset=True))


@router.post("/devices/{device_id}/{action}")
def decide(
    device_id: uuid.UUID, action: Literal["approve", "reject", "revoke"], ctx: Owner, db: DB
):
    return service.decide(db, ctx.organisation_id, ctx.id, device_id, action)


@router.post("/logout-staff")
def logout_staff(ctx: Owner, db: DB):
    return service.logout_staff(db, ctx.organisation_id, ctx.id)
