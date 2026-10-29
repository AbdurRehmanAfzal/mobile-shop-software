import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from fastapi.responses import HTMLResponse

from app.core.errors import Forbidden
from app.core.permissions import Cap
from app.core.tenancy import DB, Ctx, CurrentContext, get_current_context
from app.modules.repairs import service
from app.modules.repairs.models import RepairStatus
from app.modules.repairs.schemas import (
    FAULT_CODES,
    DeliverIn,
    PartIn,
    RepairCreate,
    RepairOut,
    RepairUpdate,
    StatusIn,
)

router = APIRouter(prefix="/api/v1/repairs", tags=["repairs"])


def _creator(ctx: Annotated[CurrentContext, Depends(get_current_context)]) -> CurrentContext:
    if not ctx.can(Cap.REPAIR_CREATE):
        raise Forbidden()
    return ctx


def _worker(ctx: Annotated[CurrentContext, Depends(get_current_context)]) -> CurrentContext:
    if not (ctx.can(Cap.REPAIR_WORK) or ctx.can(Cap.REPAIR_CREATE)):
        raise Forbidden()
    return ctx


Creator = Annotated[CurrentContext, Depends(_creator)]
Worker = Annotated[CurrentContext, Depends(_worker)]


@router.get("/fault-codes")
def fault_codes():
    return [{"code": k, "en": v[0], "ur": v[1]} for k, v in FAULT_CODES.items()]


@router.get("", response_model=list[RepairOut])
def list_jobs(
    ctx: Worker,
    db: DB,
    status: RepairStatus | None = None,
    open_only: bool = True,
    party_id: uuid.UUID | None = None,
    technician_id: uuid.UUID | None = None,
    q: str | None = Query(default=None, max_length=60),
    limit: int = Query(default=100, le=500),
):
    rows = service.list_jobs(
        db,
        ctx.shop_id,
        status=status,
        open_only=open_only,
        party_id=party_id,
        technician_id=technician_id,
        q=q,
        limit=limit,
    )
    return [service.to_out(db, j) for j in rows]


@router.post("", response_model=RepairOut, status_code=201)
def create(data: RepairCreate, ctx: Creator, db: DB):
    return service.to_out(db, service.create_job(db, ctx.shop_id, ctx.id, data))


@router.get("/{job_id}", response_model=RepairOut)
def get(job_id: uuid.UUID, ctx: Worker, db: DB):
    return service.to_out(db, service.get_job(db, ctx.shop_id, job_id))


@router.patch("/{job_id}", response_model=RepairOut)
def update(job_id: uuid.UUID, data: RepairUpdate, ctx: Worker, db: DB):
    return service.to_out(db, service.update_job(db, ctx.shop_id, ctx.id, job_id, data))


@router.put("/{job_id}/parts", response_model=RepairOut)
def parts(job_id: uuid.UUID, items: list[PartIn], ctx: Worker, db: DB):
    return service.to_out(db, service.set_parts(db, ctx.shop_id, ctx.id, job_id, items))


@router.post("/{job_id}/status", response_model=RepairOut)
def status(job_id: uuid.UUID, data: StatusIn, ctx: Worker, db: DB):
    return service.to_out(
        db, service.set_status(db, ctx.shop_id, ctx.id, job_id, data.status, data.note)
    )


@router.post("/{job_id}/deliver", response_model=RepairOut)
def deliver(job_id: uuid.UUID, data: DeliverIn, ctx: Creator, db: DB):
    return service.to_out(db, service.deliver(db, ctx.shop_id, ctx.id, job_id, data))


@router.get("/{job_id}/job-sheet", response_class=HTMLResponse)
def job_sheet(
    job_id: uuid.UUID, ctx: Ctx, db: DB, lang: str | None = Query(default=None, pattern="^(en|ur)$")
):
    return service.job_sheet_html(db, ctx.shop_id, job_id, lang)
