"""Mock-ups 24 / 25: the bills screen and the sales screen, read-only (`billshub/service.py`), with
their sheets (Excel / CSV, and the A4 print page that is the bills / sales ledger report)."""

import datetime as dt
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query

from app.core.errors import ValidationFailed
from app.core.permissions import Cap
from app.core.tenancy import DB, Ctx, require_cap
from app.modules.billshub import service
from app.modules.exports.router import _file
from app.modules.units.router import _plain

router = APIRouter(prefix="/api/v1/bills-hub", tags=["bills-hub"])
Transact = Annotated[Ctx, Depends(require_cap(Cap.TRANSACT))]
Type = Literal["sale", "purchase", "return", "repair"]
State = Literal["due", "paid", "in_repair", "returned", "void"]
Kind = Literal["phone", "tablet", "watch", "laptop", "items"]
Mode = Literal["cash", "bank", "online", "cheque", "remittance", "udhaar"]
Deal = Literal["udhaar", "paid", "loss"]
Fmt = Literal["csv", "xlsx", "pdf"]
Lang = Annotated[str | None, Query(pattern="^(en|ur)$")]
Q = Annotated[str | None, Query(max_length=60)]


def _dates(date_from, date_to):
    if date_from and date_to and date_from > date_to:
        raise ValidationFailed(
            code="bad_date_range",
            message_en="The 'from' date must be on or before the 'to' date",
            message_ur="شروع کی تاریخ آخری تاریخ سے پہلے ہونی چاہیے",
        )


@router.get("/bills")
def bills(
    ctx: Ctx,
    db: DB,
    date_from: dt.date | None = None,
    date_to: dt.date | None = None,
    q: Q = None,
    type: Type | None = None,
    state: State | None = None,
    kind: Kind | None = None,
    mode: Mode | None = None,
    edited: bool = False,
    limit: int = Query(default=300, ge=1, le=2000),
):
    """every bill with its kinds, lines, pay mode, corrections and profit; the five figures and the
    bills per person, all over the filtered bills"""
    _dates(date_from, date_to)
    data = service.bills(
        db,
        ctx.shop_id,
        ctx,
        date_from=date_from,
        date_to=date_to,
        q=q,
        type_=type,
        state=state,
        kind=kind,
        mode=mode,
        edited=edited,
    )
    data["total_rows"] = len(data["rows"])
    data["rows"] = data["rows"][:limit]
    return _plain(data)


@router.get("/sales")
def sales(
    ctx: Transact,
    db: DB,
    date_from: dt.date | None = None,
    date_to: dt.date | None = None,
    q: Q = None,
    kind: Kind | None = None,
    brand: Annotated[str | None, Query(max_length=80)] = None,
    mode: Mode | None = None,
    deal: Deal | None = None,
):
    """the sales of the period per kind, brand, model, person and bill, with profit and loss"""
    _dates(date_from, date_to)
    return _plain(
        service.sales(
            db,
            ctx.shop_id,
            ctx,
            date_from=date_from,
            date_to=date_to,
            q=q,
            kind=kind,
            brand=brand,
            mode=mode,
            deal=deal,
        )
    )


UR = {
    "Bill": "بل",
    "Date": "تاریخ",
    "Type": "قسم",
    "Status": "حیثیت",
    "Party": "فریق",
    "Phone": "فون",
    "Items": "چیزیں",
    "IMEI / serial": "IMEI / سیریل",
    "Paid by": "ادائیگی کا طریقہ",
    "Total": "کل",
    "Paid": "ادا",
    "Remaining": "باقی",
    "Profit": "منافع",
    "Edited": "درستی",
    "Kind": "قسم",
    "Brand": "برانڈ",
    "Model": "ماڈل",
    "Qty": "تعداد",
    "Cost": "خرید قیمت",
    "Sale": "فروخت",
    "Received": "وصول",
    "Udhaar": "ادھار",
    "Bought from": "جس سے خریدا",
    "Total of the list": "فہرست کا کل",
}


def _h(header: list[str], lang: str | None) -> list[str]:
    return [UR.get(h, h) for h in header] if lang == "ur" else header


@router.get("/bills/sheet")
def bills_sheet(
    ctx: Ctx,
    db: DB,
    format: Fmt = "csv",
    lang: Lang = None,
    profit: bool = True,
    date_from: dt.date | None = None,
    date_to: dt.date | None = None,
    q: Q = None,
    type: Type | None = None,
    state: State | None = None,
    kind: Kind | None = None,
    mode: Mode | None = None,
    edited: bool = False,
):
    """the filtered bills as Excel / CSV or the A4 bills ledger report (format=pdf)"""
    _dates(date_from, date_to)
    data = service.bills(
        db,
        ctx.shop_id,
        ctx,
        date_from=date_from,
        date_to=date_to,
        q=q,
        type_=type,
        state=state,
        kind=kind,
        mode=mode,
        edited=edited,
    )
    show = profit and ctx.can(Cap.VIEW_COST)
    head = ["Bill", "Date", "Type", "Status", "Party", "Phone", "Items", "IMEI / serial"]
    head += ["Paid by", "Total", "Paid", "Remaining"] + (["Profit"] if show else []) + ["Edited"]
    rows = []
    for r in data["rows"]:
        rows.append(
            [
                r["no"],
                r["date"],
                r["kind"],
                r["state"],
                r["party_name"] or "",
                r["party_phone"] or "",
                " · ".join(ln.get("label") or "" for ln in r["lines"]),
                " · ".join(str(ln.get("code") or "") for ln in r["lines"]),
                r["mode"] or "",
                r["total"],
                r["paid"],
                r["due"],
            ]
            + ([r["profit"] if r["profit"] is not None else ""] if show else [])
            + [" | ".join((c.get("memo") or c["type"]) for c in r["changes"])]
        )
    f = data["figures"]
    rows.append(
        ["Total of the list", "", "", "", "", "", "", "", "", f["sales"], "", f["to_get"]]
        + ([f["profit"]] if show else [])
        + [""]
    )
    return _file(format, ctx, db, lang, "bills", _h(head, lang), rows, title="Bills ledger")


@router.get("/sales/sheet")
def sales_sheet(
    ctx: Transact,
    db: DB,
    format: Fmt = "csv",
    lang: Lang = None,
    profit: bool = True,
    date_from: dt.date | None = None,
    date_to: dt.date | None = None,
    q: Q = None,
    kind: Kind | None = None,
    brand: Annotated[str | None, Query(max_length=80)] = None,
    mode: Mode | None = None,
    deal: Deal | None = None,
):
    """every sold line as Excel / CSV or the A4 sales ledger report (format=pdf)"""
    _dates(date_from, date_to)
    data = service.sales(
        db,
        ctx.shop_id,
        ctx,
        date_from=date_from,
        date_to=date_to,
        q=q,
        kind=kind,
        brand=brand,
        mode=mode,
        deal=deal,
    )
    show = profit and ctx.can(Cap.VIEW_COST)
    head = ["Bill", "Date", "Kind", "Brand", "Model", "IMEI / serial", "Party", "Qty"]
    head += (["Cost"] if show else []) + ["Sale", "Received", "Udhaar"]
    head += (["Profit", "Bought from"] if show else []) + ["Paid by"]
    rows = []
    for ln in data["lines"]:
        rows.append(
            [ln["no"], ln["date"], ln["kind"], ln["brand"] or "", ln["model"], ln["code"] or ""]
            + [ln["party_name"] or "", ln["qty"]]
            + ([ln["cost"]] if show else [])
            + [ln["sale"], ln["received"], ln["udhaar"]]
            + ([ln["profit"], ln["bought_from"] or ""] if show else [])
            + [ln["mode"] or ""]
        )
    f = data["figures"]
    rows.append(
        ["Total of the list", "", "", "", "", "", "", f["units"]]
        + ([f["cost"]] if show else [])
        + [f["sale"], f["received"], f["udhaar"]]
        + ([f["profit"], ""] if show else [])
        + [""]
    )
    return _file(format, ctx, db, lang, "sales", _h(head, lang), rows, title="Sales ledger")
