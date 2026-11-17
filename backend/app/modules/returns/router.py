import datetime as dt
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.idempotency import IdemKey
from app.core.idempotency import run as idempotent
from app.core.permissions import Cap
from app.core.tenancy import DB, Ctx, require_cap
from app.modules.returns import service
from app.modules.returns.models import ReturnKind
from app.modules.returns.schemas import (
    PurchaseReturnIn,
    ReturnDetailsIn,
    ReturnOut,
    ReturnReplaceIn,
    SaleReturnIn,
)
from app.modules.sales.schemas import VoidIn

router = APIRouter(prefix="/api/v1/returns", tags=["returns"])
Transact = Annotated[Ctx, Depends(require_cap(Cap.TRANSACT))]


@router.post("/sale", response_model=ReturnOut, status_code=201)
def sale_return(data: SaleReturnIn, ctx: Transact, db: DB, idem: IdemKey = None):
    # owner 2026-11-10: a double tap or a retry never posts it twice
    return idempotent(
        db,
        ctx.shop_id,
        idem,
        "returns",
        lambda: service.to_out(db, service.sale_return(db, ctx.shop_id, ctx.id, data)),
    )


@router.post("/purchase", response_model=ReturnOut, status_code=201)
def purchase_return(data: PurchaseReturnIn, ctx: Transact, db: DB, idem: IdemKey = None):
    # ADR-101: like a customer's return, a double tap or a retry never posts it twice
    return idempotent(
        db,
        ctx.shop_id,
        idem,
        "returns",
        lambda: service.to_out(db, service.purchase_return(db, ctx.shop_id, ctx.id, data)),
    )


@router.get("", response_model=list[ReturnOut])
def list_returns(
    ctx: Ctx,
    db: DB,
    kind: ReturnKind | None = None,
    party_id: uuid.UUID | None = None,
    limit: int = Query(default=100, le=500),
):
    return [
        service.to_out(db, r)
        for r in service.list_returns(db, ctx.shop_id, kind=kind, party_id=party_id, limit=limit)
    ]


@router.get("/report")
def report(ctx: Ctx, db: DB, date_from: dt.date | None = None, date_to: dt.date | None = None):
    """owner 2026-11-18 (ADR-097): every return of the period with all its details and the
    totals — customers' returns and returns to suppliers (default: this month)"""
    from app.core.clock import today as shop_today
    from app.core.errors import ValidationFailed
    from app.modules.returns import report as rep
    from app.modules.shopaudit.router import plain

    d_to = date_to or shop_today()
    d_from = date_from or d_to.replace(day=1)
    if d_from > d_to or (d_to - d_from).days > 3700:
        raise ValidationFailed(
            code="bad_period", message_en="Check the dates", message_ur="تاریخیں دیکھیں"
        )
    return plain(rep.report(db, ctx.shop_id, d_from, d_to, ctx.can(Cap.VIEW_COST)))


@router.get("/{return_id}", response_model=ReturnOut)
def get(return_id: uuid.UUID, ctx: Ctx, db: DB):
    return service.to_out(db, service.get_return(db, ctx.shop_id, return_id))


@router.post("/{return_id}/void", response_model=ReturnOut)
def void(return_id: uuid.UUID, data: VoidIn, ctx: Ctx, db: DB):
    """owner 2026-11-15 (ADR-090): undo a return entered by mistake"""
    return service.to_out(db, service.void_return(db, ctx.shop_id, ctx, return_id, data.reason))


@router.patch("/{return_id}", response_model=ReturnOut)
def edit_details(return_id: uuid.UUID, data: ReturnDetailsIn, ctx: Ctx, db: DB):
    """ADR-101: correct the reason / note of a return (owner or manager); nothing else moves"""
    return service.to_out(db, service.edit_details(db, ctx.shop_id, ctx, return_id, data))


@router.post("/{return_id}/replace", response_model=ReturnOut, status_code=201)
def replace(return_id: uuid.UUID, data: ReturnReplaceIn, ctx: Ctx, db: DB, idem: IdemKey = None):
    """ADR-101: undo a wrong return and enter the right one in one step (owner or manager)"""
    return idempotent(
        db,
        ctx.shop_id,
        idem,
        "returns",
        lambda: service.to_out(db, service.replace_return(db, ctx.shop_id, ctx, return_id, data)),
    )
