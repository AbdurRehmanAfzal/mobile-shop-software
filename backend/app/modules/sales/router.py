import datetime as dt
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from fastapi.responses import HTMLResponse

from app.core.idempotency import IdemKey
from app.core.idempotency import run as idempotent
from app.core.permissions import Cap
from app.core.tenancy import DB, Ctx, require_cap
from app.modules.sales import service
from app.modules.sales.models import InvoiceStatus
from app.modules.sales.schemas import HeldSaleIn, HeldSaleOut, SaleCreate, SaleOut, VoidIn

router = APIRouter(prefix="/api/v1/sales", tags=["sales"])
Transact = Annotated[Ctx, Depends(require_cap(Cap.TRANSACT))]


@router.post("", response_model=SaleOut, status_code=201)
def create(data: SaleCreate, ctx: Transact, db: DB, idem: IdemKey = None):
    # the same Idempotency-Key (a phone's offline queue sending again) returns the first bill
    def make():
        inv = service.create_sale(db, ctx.shop_id, ctx, data)
        return service.to_out(db, inv, ctx.can(Cap.VIEW_COST))

    return idempotent(db, ctx.shop_id, idem, "sales", make)


# held sales come before /{invoice_id}, which would otherwise take "held" for an id
@router.get("/held", response_model=list[HeldSaleOut])
def list_held(ctx: Transact, db: DB):
    return [service.held_out(db, h) for h in service.list_held(db, ctx.shop_id)]


@router.post("/held", response_model=HeldSaleOut, status_code=201)
def hold(data: HeldSaleIn, ctx: Transact, db: DB):
    return service.held_out(db, service.hold_sale(db, ctx.shop_id, ctx.id, data))


@router.delete("/held/{held_id}", status_code=204)
def drop_held(held_id: uuid.UUID, ctx: Transact, db: DB):
    service.drop_held(db, ctx.shop_id, held_id)


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
