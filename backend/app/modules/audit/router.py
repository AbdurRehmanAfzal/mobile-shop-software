import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select

from app.core.permissions import Cap
from app.core.tenancy import DB, Ctx, require_cap
from app.modules.audit.models import AuditLog

router = APIRouter(prefix="/api/v1/audit", tags=["audit"])


class AuditOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID | None
    entity: str
    entity_id: uuid.UUID | None
    action: str
    before: dict | None
    after: dict | None
    at: datetime


@router.get("", response_model=list[AuditOut])
def list_audit(
    ctx: Annotated[Ctx, Depends(require_cap(Cap.MANAGE_SETTINGS))],
    db: DB,
    entity: str | None = None,
    limit: int = Query(default=100, le=500),
):
    stmt = (
        select(AuditLog)
        .where(AuditLog.shop_id == ctx.shop_id)
        .order_by(AuditLog.at.desc())
        .limit(limit)
    )
    if entity:
        stmt = stmt.where(AuditLog.entity == entity)
    return db.scalars(stmt).all()
