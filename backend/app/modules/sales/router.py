import datetime as dt
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from fastapi.responses import HTMLResponse

from app.core.permissions import Cap
from app.core.tenancy import DB, Ctx, require_cap
from app.modules.sales import service
from app.modules.sales.models import InvoiceStatus
from app.modules.sales.schemas import SaleCreate, SaleOut, VoidIn

router = APIRouter(prefix="/api/v1/sales", tags=["sales"])
Transact = Annotated[Ctx, Depends(require_cap(Cap.TRANSACT))]


@router.post("", response_model=SaleOut, status_code=201)
def create(data: SaleCreate, ctx: Transact, db: DB):
    inv = service.create_sale(db, ctx.shop_id, ctx, data)
    return service.to_out(db, inv, ctx.can(Cap.VIEW_COST))


@router.get("", response_model=list[SaleOut])
def list_sales(
    ctx: Transact,
    db: DB,
    party_id: uuid.UUID | None = None,
    date_from: dt.date | None = None,
    date_to: dt.date | None = None,
    status: InvoiceStatus | None = None,
    limit: int = Query(default=100, le=500),
):
    rows = service.list_invoices(
        db,
        ctx.shop_id,
        party_id=party_id,
        date_from=date_from,
        date_to=date_to,
        status=status,
        limit=limit,
    )
    return [service.to_out(db, i, ctx.can(Cap.VIEW_COST)) for i in rows]


@router.get("/{invoice_id}", response_model=SaleOut)
def get(invoice_id: uuid.UUID, ctx: Ctx, db: DB):
    return service.to_out(
        db, service.get_invoice(db, ctx.shop_id, invoice_id), ctx.can(Cap.VIEW_COST)
    )


@router.post("/{invoice_id}/void", response_model=SaleOut)
def void(invoice_id: uuid.UUID, data: VoidIn, ctx: Ctx, db: DB):
    return service.to_out(
        db,
        service.void_invoice(db, ctx.shop_id, ctx, invoice_id, data.reason),
        ctx.can(Cap.VIEW_COST),
    )


@router.get("/{invoice_id}/receipt", response_class=HTMLResponse)
def receipt(
    invoice_id: uuid.UUID,
    ctx: Ctx,
    db: DB,
    format: str = Query(default="thermal", pattern="^(thermal|a4)$"),
    lang: str | None = Query(default=None, pattern="^(en|ur)$"),
):
    return service.receipt_html(db, ctx.shop_id, invoice_id, format, lang)
