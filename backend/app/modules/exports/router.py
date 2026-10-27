"""Report downloads (FR-PLT-07, FR-RPT-02) as CSV, Excel (.xlsx) or a print-ready page for PDF.

Every route takes `?format=csv|xlsx|pdf` (default csv; the old `*.csv` paths still work).
CSV is UTF-8 with BOM so Excel shows Urdu. "pdf" returns an HTML page that opens the print
dialog ("Save as PDF"): the browser shapes Nastaliq correctly, which server PDF libraries do not.
Cost/profit columns only for roles with VIEW_COST."""

import csv
import datetime as dt
import html
import io
import uuid
from collections.abc import Iterable
from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy import select

from app.core.clock import local_date
from app.core.clock import today as shop_today
from app.core.errors import NotFound
from app.core.permissions import Cap
from app.core.tenancy import DB, Ctx, require_cap
from app.modules.catalogue.models import Brand, Colour, Model, Storage
from app.modules.devices.models import Device
from app.modules.expenses.models import Expense, ExpenseCategory
from app.modules.ledger.service import party_statement
from app.modules.parties.models import Party
from app.modules.purchases.models import Purchase
from app.modules.reports import service as rep
from app.modules.sales.models import Invoice

router = APIRouter(prefix="/api/v1/exports", tags=["exports"])
Reports = Annotated[Ctx, Depends(require_cap(Cap.REPORTS_ALL))]


Fmt = Literal["csv", "xlsx", "pdf"]


def _file(
    fmt: str, ctx, db, name: str, header: list[str], rows: Iterable[list], title: str | None = None
) -> Response:
    rows = [["" if v is None else v for v in r] for r in rows]
    stamp = shop_today().isoformat()
    if fmt == "xlsx":
        return _xlsx(name, stamp, header, rows)
    if fmt == "pdf":
        return _printable(ctx, db, title or name.replace("-", " ").title(), header, rows)
    buf = io.StringIO()
    buf.write("\ufeff")
    w = csv.writer(buf)
    w.writerow(header)
    w.writerows(rows)
    return Response(
        content=buf.getvalue().encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{name}-{stamp}.csv"'},
    )


def _xlsx(name: str, stamp: str, header: list[str], rows: list[list]) -> Response:
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill

    wb = Workbook()
    ws = wb.active
    ws.title = name[:31]
    ws.append(header)
    for cell in ws[1]:
        cell.font = Font(bold=True)
        cell.fill = PatternFill("solid", fgColor="E6E2DA")
    for r in rows:
        ws.append([float(v) if isinstance(v, Decimal) else v for v in r])
    ws.freeze_panes = "A2"
    for i, col in enumerate(zip(header, *rows, strict=False), start=1):
        width = max(len(str(v)) for v in col) + 2
        ws.column_dimensions[ws.cell(row=1, column=i).column_letter].width = min(max(width, 8), 45)
    out = io.BytesIO()
    wb.save(out)
    return Response(
        content=out.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{name}-{stamp}.xlsx"'},
    )


def _printable(ctx, db, title: str, header: list[str], rows: list[list]) -> Response:
    from app.modules.auth.models import Shop

    shop = db.get(Shop, ctx.shop_id)
    e = html.escape
    num = lambda v: isinstance(v, (int, float, Decimal))
    head = "".join(f"<th>{e(str(h))}</th>" for h in header)
    body = "".join(
        "<tr>"
        + "".join(f'<td class="{"n" if num(v) else ""}" dir="auto">{e(str(v))}</td>' for v in r)
        + "</tr>"
        for r in rows
    )
    now = dt.datetime.now().strftime("%d-%m-%Y %I:%M %p")
    page = f"""<!doctype html><html><head><meta charset="utf-8"><title>{e(title)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;700;800&family=Noto+Nastaliq+Urdu&display=swap">
<style>
@page {{ size: A4 {"landscape" if len(header) > 6 else "portrait"}; margin: 12mm; }}
body {{ font-family: Manrope, 'Noto Nastaliq Urdu', sans-serif; color: #1B1F24; margin: 0; }}
h1 {{ font-size: 20px; margin: 0; }} .meta {{ color: #5E646B; font-size: 12px; margin: 4px 0 12px; }}
table {{ width: 100%; border-collapse: collapse; font-size: 12px; }}
th {{ background: #F6F4EF; text-align: start; }} th, td {{ border: 1px solid #E6E2DA; padding: 6px 8px; }}
td.n {{ text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }}
tr:nth-child(even) td {{ background: #FBFAF7; }}
</style></head><body>
<h1>{e(shop.name if shop else "")} · {e(title)}</h1>
<div class="meta">{e(now)} · {len(rows)} rows</div>
<table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table>
</body></html>"""
    return Response(content=page, media_type="text/html; charset=utf-8")


@router.get("/stock.csv")
@router.get("/stock")
def stock(ctx: Ctx, db: DB, format: Fmt = "csv", status: str | None = "in_stock"):
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
    return _file(format, ctx, db, "stock", header, rows)


@router.get("/parties.csv")
@router.get("/parties")
def parties(ctx: Ctx, db: DB, format: Fmt = "csv"):
    rows = db.scalars(select(Party).where(Party.shop_id == ctx.shop_id).order_by(Party.name)).all()
    return _file(
        format,
        ctx,
        db,
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
@router.get("/parties/{party_id}/statement")
def statement(
    party_id: uuid.UUID,
    ctx: Ctx,
    db: DB,
    format: Fmt = "csv",
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
            local_date(r["at"]).isoformat(),
            r["memo"] or r["document_type"],
            r["document_type"],
            r["debit"],
            r["credit"],
            r["balance"],
        ]
        for r in st["rows"]
        if not r["reversed"]
    ]
    return _file(
        format,
        ctx,
        db,
        f"statement-{party.phone}",
        ["Date", "Details", "Type", "Debit (they owe)", "Credit (paid)", "Balance"],
        rows,
    )


@router.get("/sales.csv")
@router.get("/sales")
def sales(
    ctx: Reports,
    db: DB,
    format: Fmt = "csv",
    date_from: dt.date | None = None,
    date_to: dt.date | None = None,
):
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
    return _file(
        format,
        ctx,
        db,
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
@router.get("/purchases")
def purchases(
    ctx: Reports,
    db: DB,
    format: Fmt = "csv",
    date_from: dt.date | None = None,
    date_to: dt.date | None = None,
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
    return _file(
        format,
        ctx,
        db,
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
@router.get("/expenses")
def expenses(
    ctx: Reports,
    db: DB,
    format: Fmt = "csv",
    date_from: dt.date | None = None,
    date_to: dt.date | None = None,
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
    return _file(
        format,
        ctx,
        db,
        "expenses",
        ["No", "Date", "Category", "Amount", "Details", "Status"],
        ([e.no, e.date, n, e.amount, e.description, e.status] for e, n in rows),
    )


# ---- the counter reports (same numbers as the screens) -------------------------------------------
def _range(date_from: dt.date | None, date_to: dt.date | None) -> tuple[dt.date, dt.date]:
    today = shop_today()
    return date_from or today.replace(day=1), date_to or today


@router.get("/profit-loss")
def profit_loss(
    ctx: Reports,
    db: DB,
    format: Fmt = "csv",
    date_from: dt.date | None = None,
    date_to: dt.date | None = None,
):
    d_from, d_to = _range(date_from, date_to)
    p = rep.profit_and_loss(db, ctx.shop_id, d_from, d_to)
    rows = [
        ["Sold", p["sales"]],
        ["Buying price of what was sold", -p["cogs"]],
        ["Profit on sales", p["gross_profit"]],
        ["Repair income", p["repair_income"]],
        ["Other income", p["other_income"]],
        *[[f"Expense: {k}", -v] for k, v in p["expenses"].items()],
        ["Real profit (after expenses)", p["net_profit"]],
        ["Tax collected", p["tax_collected"]],
        ["Owner took out", p["owner_drawing"]],
    ]
    return _file(
        format,
        ctx,
        db,
        "profit-loss",
        ["Item", "Amount"],
        rows,
        f"Profit & loss {d_from} to {d_to}",
    )


@router.get("/top-sellers")
def top_sellers(
    ctx: Reports,
    db: DB,
    format: Fmt = "csv",
    date_from: dt.date | None = None,
    date_to: dt.date | None = None,
):
    d_from, d_to = _range(date_from, date_to)
    cost = ctx.can(Cap.VIEW_COST)
    items = rep.top_sellers(db, ctx.shop_id, d_from, d_to, cost, limit=200)
    header = ["#", "Item", "Sold", "Amount"] + (["Profit"] if cost else [])
    rows = [
        [i, t["name"], t["qty"], t["amount"]] + ([t["profit"]] if cost else [])
        for i, t in enumerate(items, start=1)
    ]
    return _file(format, ctx, db, "best-sellers", header, rows, f"Best sellers {d_from} to {d_to}")


@router.get("/day")
def day(
    ctx: Ctx,
    db: DB,
    format: Fmt = "csv",
    date: dt.date | None = None,
    date_from: dt.date | None = None,
    date_to: dt.date | None = None,
):
    d_from = date_from or date or shop_today()
    d = rep.day_report(db, ctx.shop_id, d_from, ctx.can(Cap.VIEW_COST), date_to or d_from)
    rows = [
        [
            it["invoice_no"],
            it["name"],
            it["qty"],
            it["party_name"] or "Customer",
            "returned" if it["returned"] else it["how"],
            it["sold_by"],
            it["amount"],
        ]
        for it in d["items"]
    ]
    rows += [
        ["", "Total sold", "", "", "", "", d["sales_total"]],
        ["", "Cash received", "", "", "", "", d["received"]["cash"]],
        [
            "",
            "Easypaisa / JazzCash / bank",
            "",
            "",
            "",
            "",
            d["received"]["easypaisa"] + d["received"]["jazzcash"] + d["received"]["bank"],
        ],
        ["", "Given on udhaar", "", "", "", "", d["udhaar_given"]],
        ["", "Udhaar received", "", "", "", "", d["udhaar_received"]],
        ["", "Given back on returns", "", "", "", "", d["returns_refunded"]],
        ["", "Cut on returns", "", "", "", "", d["returns_kept"]],
        ["", "Money came in", "", "", "", "", d["money_in"]],
        *[
            ["", f"  in: {k.replace('_', ' ')}", "", "", "", "", v]
            for k, v in d["came_in"].items()
            if v
        ],
        ["", "Money went out", "", "", "", "", d["money_out"]],
        *[
            ["", f"  out: {k.replace('_', ' ')}", "", "", "", "", v]
            for k, v in d["went_out"].items()
            if v
        ],
        ["", "Left in hand today", "", "", "", "", d["cash_net"]],
        ["", "Expense", "", "", "", "", d["expenses"]],
    ]
    if d["profit"] is not None:
        rows.append(["", "Profit", "", "", "", "", d["profit"]])
    header = ["Bill", "Item", "Qty", "Customer", "Paid by", "Sold by", "Amount"]
    span = (
        str(d["date_from"])
        if d["date_from"] == d["date_to"]
        else f"{d['date_from']}-to-{d['date_to']}"
    )
    return _file(
        format, ctx, db, f"hisaab-{span}", header, rows, f"Hisaab {span.replace('-to-', ' to ')}"
    )


@router.get("/stock-summary")
def stock_summary(ctx: Ctx, db: DB, format: Fmt = "csv"):
    s = rep.stock_summary(db, ctx.shop_id, ctx.can(Cap.VIEW_COST))
    rows = [
        [b["name"], m["name"], m["count"], m["value"]] for b in s["brands"] for m in b["models"]
    ]
    rows.append(["Total", "", s["count"], s["value"]])
    value = "Value (buying price)" if s["basis"] == "cost" else "Value (selling price)"
    return _file(
        format, ctx, db, "stock-worth", ["Brand", "Model", "Phones", value], rows, "Stock worth"
    )


@router.get("/khata")
def khata(ctx: Ctx, db: DB, format: Fmt = "csv"):
    parties = db.scalars(
        select(Party)
        .where(Party.shop_id == ctx.shop_id, Party.is_active.is_(True), Party.balance != 0)
        .order_by(Party.balance.desc())
    ).all()
    rows = [
        [p.name, p.phone, p.balance if p.balance > 0 else "", -p.balance if p.balance < 0 else ""]
        for p in parties
    ]
    rows.append(
        [
            "Total",
            "",
            sum((p.balance for p in parties if p.balance > 0), Decimal(0)),
            -sum((p.balance for p in parties if p.balance < 0), Decimal(0)),
        ]
    )
    header = ["Name", "Phone", "I will get", "I have to give"]
    return _file(format, ctx, db, "udhaar-khata", header, rows, "Udhaar khata")


@router.get("/forecast")
def forecast(ctx: Reports, db: DB, format: Fmt = "csv"):
    f = rep.forecast(db, ctx.shop_id, shop_today())
    advice = {"buy_more": "Buy more", "slow": "Not selling", "ok": "OK"}
    rows = [
        [
            m["name"],
            m["sold_30_days"],
            m["in_stock"],
            "" if m["days_left"] is None else m["days_left"],
            advice[m["advice"]],
        ]
        for m in f["models"]
    ]
    rows += [[f"Expected {d['date']}", "", "", "", d["expected"]] for d in f["next_7_days"]]
    header = ["Phone", "Sold in 30 days", "In stock", "Days left", "Advice / expected sale"]
    return _file(
        format, ctx, db, "estimate", header, rows, "Sales estimate (a guess, not a promise)"
    )


@router.get("/stock-ageing")
def stock_ageing(ctx: Reports, db: DB, format: Fmt = "csv"):
    cost = ctx.can(Cap.VIEW_COST)
    rows = [
        [f"{b['bucket']} days", b["count"]] + ([b["value"]] if cost else [])
        for b in rep.stock_ageing(db, ctx.shop_id, cost)
    ]
    header = ["Days in stock", "Phones"] + (["Value"] if cost else [])
    return _file(format, ctx, db, "old-stock", header, rows, "Old stock")
