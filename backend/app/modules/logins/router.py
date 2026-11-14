"""Login activity (owner 2026-11-14, ADR-074): the owner sees where the app is logged in, who is
online, and ends a login. Behind the "login_activity" module, which only the super admin switches on."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request

from app.core.permissions import Cap
from app.core.tenancy import DB, Ctx, require_cap
from app.modules.logins import service

router = APIRouter(prefix="/api/v1/login-activity", tags=["logins"])
Owner = Annotated[Ctx, Depends(require_cap(Cap.MANAGE_STAFF))]


def _sid(request: Request) -> str | None:
    return getattr(request.state, "sid", None)


@router.get("")
def listing(request: Request, ctx: Owner, db: DB, days: int = Query(default=30, ge=1, le=365)):
    return service.listing(db, ctx.organisation_id, days, _sid(request))


@router.post("/{session_id}/end")
def end(session_id: uuid.UUID, ctx: Owner, db: DB):
    return service.end_by_owner(db, ctx.organisation_id, ctx.id, session_id)
