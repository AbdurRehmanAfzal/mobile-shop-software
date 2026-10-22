"""CSV exports (FR-PLT-07, FR-RPT-02). UTF-8 with BOM so Excel shows Urdu correctly.
Cost/profit columns only for roles with VIEW_COST."""

import csv
import datetime as dt
import io
import uuid
from collections.abc import Iterable
from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy import select

from app.core.errors import NotFound
from app.core.permissions import Cap
from app.core.tenancy import DB, Ctx, require_cap
from app.modules.catalogue.models import Brand, Colour, Model, Storage
from app.modules.devices.models import Device
from app.modules.expenses.models import Expense, ExpenseCategory
from app.modules.ledger.service import party_statement
from app.modules.parties.models import Party
from app.modules.purchases.models import Purchase
from app.modules.sales.models import Invoice

router = APIRouter(prefix="/api/v1/exports", tags=["exports"])
Reports = Annotated[Ctx, Depends(require_cap(Cap.REPORTS_ALL))]


def _csv(name: str, header: list[str], rows: Iterable[list]) -> Response:
    buf = io.StringIO()
    buf.write("﻿")
    w = csv.writer(buf)
    w.writerow(header)
    for r in rows:
        w.writerow(["" if v is None else v for v in r])
    stamp = dt.date.today().isoformat()
    return Response(
        content=buf.getvalue().encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{name}-{stamp}.csv"'},
    )


@router.get("/stock.csv")
def stock(ctx: Ctx, db: DB, status: str | None = "in_stock"):
    cost = ctx.can(Cap.VIEW_COST)
    stmt = (
        select(Device, Brand.name, Model.name, Storage.name, Colour.name)
        .join(Brand, Brand.id == Device.brand_id)
        .join(Model, Model.id == Device.model_id)
        .outerjoin(Storage, Storage.id == Device.storage_id)
        .outerjoin(Colour, Colour.id == Device.colour_id)
        .where(Device.shop_id == ctx.shop_id)
        .order_by(Brand.name, Model.name)
    )
    if status and status != "all":
        stmt = stmt.where(Device.status == status)
    header = [
        "IMEI",
        "IMEI 2",
        "Brand",
        "Model",
        "Storage",
        "Colour",
        "Condition",
        "PTA",
        "SIM time (months)",
        "Status",
        "Verification",
        "Asking price",
    ]
    if cost:
        header.append("Cost")
    rows = []
    for d, b, m, s, c in db.execute(stmt).all():
        r = [
            d.imei1,
            d.imei2,
            b,
            m,
            s,
            c,
            d.condition,
            d.pta_status,
            d.sim_time_months,
            d.status,
            d.verification_status,
            d.asking_price,
        ]
        if cost:
            r.append(d.cost_price)
        rows.append(r)
    return _csv("stock", header, rows)


@router.get("/parties.csv")
def parties(ctx: Ctx, db: DB):
    rows = db.scalars(select(Party).where(Party.shop_id == ctx.shop_id).order_by(Party.name)).all()
    return _csv(
        "parties",
        [
            "Name",
            "Name (Urdu)",
            "Phone",
            "WhatsApp",
            "CNIC",
            "City",
            "Type",
            "Balance (+ they owe / − we owe)",
            "Active",
        ],
        (
            [
                p.name,
                p.name_ur,
                p.phone,
                p.whatsapp,
                p.cnic,
                p.city,
                "/".join(p.kinds),
                p.balance,
                p.is_active,
            ]
            for p in rows
        ),
    )


@router.get("/parties/{party_id}/statement.csv")
def statement(
    party_id: uuid.UUID,
    ctx: Ctx,
    db: DB,
    date_from: dt.date | None = None,
    date_to: dt.date | None = None,
):
    st = party_statement(db, ctx.shop_id, party_id, date_from, date_to)
    party = db.get(Party, party_id)
    if party is None:
        raise NotFound()
    rows = [["", "Opening balance", "", "", "", st["opening_balance"]]]
    rows += [
        [
            r["at"].date().isoformat(),
            r["memo"] or r["document_type"],
            r["document_type"],
            r["debit"],
            r["credit"],
            r["balance"],
        ]
        for r in st["rows"]
        if not r["reversed"]
    ]
    return _csv(
        f"statement-{party.phone}",
        ["Date", "Details", "Type", "Debit (they owe)", "Credit (paid)", "Balance"],
        rows,
    )


@router.get("/sales.csv")
def sales(ctx: Reports, db: DB, date_from: dt.date | None = None, date_to: dt.date | None = None):
    stmt = (
        select(Invoice, Party.name)
        .outerjoin(Party, Party.id == Invoice.party_id)
        .where(Invoice.shop_id == ctx.shop_id)
    )
    if date_from:
        stmt = stmt.where(Invoice.date >= date_from)
    if date_to:
        stmt = stmt.where(Invoice.date <= date_to)
    rows = db.execute(stmt.order_by(Invoice.date, Invoice.no)).all()
    return _csv(
        "sales",
        [
            "Invoice",
            "Date",
            "Customer",
            "Subtotal",
            "Discount",
            "Tax",
            "Total",
            "Paid",
            "Returned",
            "Cost",
            "Profit",
            "Status",
        ],
        (
            [
                i.no,
                i.date,
                n or "Cash",
                i.subtotal,
                i.discount,
                i.tax_amount,
                i.total,
                i.paid,
                i.returned_total,
                i.cost_total,
                i.total - i.tax_amount - i.cost_total,
                i.status,
            ]
            for i, n in rows
        ),
    )


@router.get("/purchases.csv")
def purchases(
    ctx: Reports, db: DB, date_from: dt.date | None = None, date_to: dt.date | None = None
):
    stmt = (
        select(Purchase, Party.name)
        .join(Party, Party.id == Purchase.party_id)
        .where(Purchase.shop_id == ctx.shop_id)
    )
    if date_from:
        stmt = stmt.where(Purchase.date >= date_from)
    if date_to:
        stmt = stmt.where(Purchase.date <= date_to)
    rows = db.execute(stmt.order_by(Purchase.date, Purchase.no)).all()
    return _csv(
        "purchases",
        [
            "Purchase",
            "Date",
            "Type",
            "Party",
            "Subtotal",
            "Discount",
            "Total",
            "Paid",
            "Returned",
            "Status",
            "Reference",
        ],
        (
            [
                p.no,
                p.date,
                p.kind,
                n,
                p.subtotal,
                p.discount,
                p.total,
                p.paid,
                p.returned_total,
                p.status,
                p.reference,
            ]
            for p, n in rows
        ),
    )


@router.get("/expenses.csv")
def expenses(
    ctx: Reports, db: DB, date_from: dt.date | None = None, date_to: dt.date | None = None
):
    stmt = (
        select(Expense, ExpenseCategory.name)
        .join(ExpenseCategory, ExpenseCategory.id == Expense.category_id)
        .where(Expense.shop_id == ctx.shop_id)
    )
    if date_from:
        stmt = stmt.where(Expense.date >= date_from)
    if date_to:
        stmt = stmt.where(Expense.date <= date_to)
    rows = db.execute(stmt.order_by(Expense.date, Expense.no)).all()
    return _csv(
        "expenses",
        ["No", "Date", "Category", "Amount", "Details", "Status"],
        ([e.no, e.date, n, e.amount, e.description, e.status] for e, n in rows),
    )
