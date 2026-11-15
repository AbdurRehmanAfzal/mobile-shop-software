"""Change my password; the password / PIN history (ADR-088). The owner sees the whole shop's; anyone
else sees their own. The values themselves are never stored or shown."""

from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.core.permissions import Cap
from app.core.tenancy import DB, Ctx, CurrentUser, get_current_user
from app.modules.credentials import service

router = APIRouter(prefix="/api/v1", tags=["credentials"])


class PasswordChangeIn(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=6, max_length=128)


@router.put("/me/password", status_code=204)
def change_password(
    data: PasswordChangeIn, current: Annotated[CurrentUser, Depends(get_current_user)], db: DB
):
    service.change_own_password(db, current.user, data.current_password, data.new_password)


@router.get("/credentials/history")
def history(ctx: Ctx, db: DB):
    """the owner: every staff member's changes; anyone else: their own"""
    if ctx.can(Cap.MANAGE_STAFF):
        return service.history(db, ctx.organisation_id)
    return service.history(db, ctx.organisation_id, ctx.id)
