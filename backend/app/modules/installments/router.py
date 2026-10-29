import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.permissions import Cap
from app.core.tenancy import DB, Ctx, require_cap
from app.modules.installments import service
from app.modules.installments.schemas import CollectIn, PlanDetailOut, PlanRowOut
from app.modules.notifications.schemas import MessageOut

router = APIRouter(prefix="/api/v1/installments", tags=["installments"])
Transact = Annotated[Ctx, Depends(require_cap(Cap.TRANSACT))]


@router.get("", response_model=list[PlanRowOut])
def list_plans(
    ctx: Transact,
    db: DB,
    view: str = Query(default="active", pattern="^(today|overdue|active|closed|all)$"),
    q: str | None = Query(default=None, max_length=60),
):
    return service.list_plans(db, ctx.shop_id, view, q)


@router.get("/{plan_id}", response_model=PlanDetailOut)
def get_plan(plan_id: uuid.UUID, ctx: Transact, db: DB):
    return service.get_plan(db, ctx.shop_id, plan_id)


@router.post("/{plan_id}/collect", response_model=PlanDetailOut)
def collect(plan_id: uuid.UUID, data: CollectIn, ctx: Transact, db: DB):
    return service.collect(db, ctx.shop_id, ctx.id, plan_id, data)


@router.post("/{plan_id}/remind", response_model=MessageOut)
def remind(plan_id: uuid.UUID, ctx: Transact, db: DB):
    return service.remind(db, ctx.shop, plan_id)
