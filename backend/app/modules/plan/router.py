"""The shopkeeper's side: reminder status for the bar / popup / lock screen, snooze, the thank-you,
redeeming a renewal code, the renewal receipt, and a full backup of the shop's data."""

import csv
import datetime as dt
import html
import io
import uuid
import zipfile
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from fastapi.responses import HTMLResponse, Response
from pydantic import BaseModel, Field

from app.core.errors import NotFound, ValidationFailed
from app.core.permissions import Cap
from app.core.tenancy import DB, Ctx, require_cap
from app.modules.admin import fees, plans
from app.modules.admin.fees import FeePayment
from app.modules.audit.service import record_audit
from app.modules.plan import reminders, renewal
from app.modules.plan.models import PlanRenewalCode

router = APIRouter(prefix="/api/v1/plan", tags=["plan"])
Money = Annotated[Ctx, Depends(require_cap(Cap.VIEW_COST))]  # owner + manager
Owner = Annotated[Ctx, Depends(require_cap(Cap.MANAGE_SETTINGS))]
Lang = Annotated[str | None, Query(pattern="^(en|ur)$")]


class SnoozeIn(BaseModel):
    option: Literal["4h", "tomorrow", "3d"]


class ThanksIn(BaseModel):
    payment_id: uuid.UUID


class RedeemIn(BaseModel):
    code: str = Field(min_length=10, max_length=400)


@router.get("/reminder")
def reminder(ctx: Ctx, db: DB, event: Literal["login", "open", "idle"] = "open"):
    """Every role may ask; staff get the short notice only (no money, no billing details)."""
    return reminders.status(db, ctx, event=event)


@router.post("/reminder/shown", status_code=204)
def shown(ctx: Money, db: DB):
    reminders.mark_shown(db, ctx)


@router.post("/reminder/snooze")
def snooze(data: SnoozeIn, ctx: Money, db: DB):
    until = reminders.snooze(db, ctx, data.option)
    return {"snoozed_until": until}


@router.post("/reminder/thanks", status_code=204)
def thanks(data: ThanksIn, ctx: Money, db: DB):
    reminders.thanks_seen(db, ctx, data.payment_id)


@router.post("/redeem")
def redeem(data: RedeemIn, ctx: Owner, db: DB):
    """A signed renewal code from the provider (works offline): extends the plan once."""
    info = renewal.parse_code(data.code)
    org = ctx.shop.organisation
    if info["org_id"] != org.id:
        raise ValidationFailed(
            code="renewal_code_other_shop",
            message_en="This renewal code was issued for a different shop",
            message_ur="یہ تجدیدی کوڈ کسی اور دکان کے لیے جاری ہوا تھا",
        )
    if db.scalar(PlanRenewalCode.__table__.select().where(PlanRenewalCode.nonce == info["nonce"])):
        raise ValidationFailed(
            code="renewal_code_used",
            message_en="This renewal code has already been used",
            message_ur="یہ تجدیدی کوڈ پہلے استعمال ہو چکا ہے",
        )
    db.add(
        PlanRenewalCode(
            organisation_id=org.id,
            nonce=info["nonce"],
            months=info["months"],
            redeemed_by=ctx.user.id,
        )
    )
    p = fees.record_manual(
        db,
        ctx.shop,
        by=ctx.user,
        amount=org.monthly_fee * info["months"],
        method="renewal_code",
        months=info["months"],
        reference=info["nonce"],
        paid_on=info["issued"],
        note="Renewal code",
    )
    record_audit(
        db,
        shop_id=ctx.shop.id,
        user_id=ctx.user.id,
        entity="organisation",
        entity_id=org.id,
        action="renewal_code",
        after={"months": info["months"], "nonce": info["nonce"], "until": str(org.plan_expires_at)},
    )
    db.commit()
    return {
        "until": org.plan_expires_at,
        "receipt_no": p.receipt_no,
        "status": plans.status_of(org),
    }


# ---- receipt ----------------------------------------------------------------------------------


@router.get("/receipts/{payment_id}", response_class=HTMLResponse)
def receipt(payment_id: uuid.UUID, ctx: Money, db: DB, lang: Lang = None):
    """A print-ready renewal receipt (SUB-0001 …) for an approved payment of this shop."""
    p = db.get(FeePayment, payment_id)
    if p is None or p.organisation_id != ctx.shop.organisation_id or p.status != fees.APPROVED:
        raise NotFound(code="receipt_not_found")
    org = ctx.shop.organisation
    ur = lang == "ur"
    e = html.escape
    until = org.plan_expires_at.strftime("%d-%m-%Y") if org.plan_expires_at else "-"
    paid_on = (p.paid_on or (p.handled_at or p.created_at).date()).strftime("%d-%m-%Y")
    t = {
        "title": "تجدید کی رسید" if ur else "Renewal receipt",
        "shop": "دکان" if ur else "Shop",
        "plan": "پلان" if ur else "Plan",
        "amount": "رقم" if ur else "Amount",
        "method": "ذریعہ" if ur else "Paid through",
        "ref": "حوالہ" if ur else "Reference",
        "date": "تاریخ" if ur else "Date",
        "months": "مہینے" if ur else "Months",
        "until": "ادا شدہ تک" if ur else "Paid until",
        "thanks": "شکریہ! آپ کا پلان تجدید ہو گیا۔" if ur else "Thank you! Your plan is renewed.",
    }
    rows = [
        (t["shop"], ctx.shop.name),
        (t["plan"], org.plan),
        (t["amount"], f"Rs. {p.amount:,.0f}"),
        (t["method"], p.method),
        (t["ref"], p.reference or "-"),
        (t["date"], paid_on),
        (t["months"], str(p.months)),
        (t["until"], until),
    ]
    body = "".join(f"<tr><th>{e(k)}</th><td>{e(v)}</td></tr>" for k, v in rows)
    page = f"""<!doctype html><html lang="{"ur" if ur else "en"}" dir="{"rtl" if ur else "ltr"}"><head><meta charset="utf-8"><title>{e(p.receipt_no or t["title"])}</title>
<style>body{{font-family:{"'Noto Nastaliq Urdu',serif" if ur else "system-ui,sans-serif"};max-width:560px;margin:32px auto;padding:0 20px;color:#0f172a}}h1{{font-size:22px;margin:0 0 4px}}.no{{font-size:28px;font-weight:800;margin:0 0 16px}}table{{width:100%;border-collapse:collapse}}th,td{{text-align:{"right" if ur else "left"};padding:8px 6px;border-bottom:1px solid #e2e8f0}}th{{font-weight:600;color:#475569;width:42%}}td{{font-family:system-ui,sans-serif;direction:ltr;text-align:{"right" if ur else "left"}}}.ok{{margin-top:18px;padding:12px 14px;border-radius:12px;background:#ecfdf5;color:#065f46;font-weight:600}}@media print{{button{{display:none}}}}</style></head>
<body><h1>{e(t["title"])} · Mobile Shop</h1><p class="no">{e(p.receipt_no or "")}</p><table>{body}</table><p class="ok">{e(t["thanks"])}</p><button onclick="print()">Print</button></body></html>"""
    return HTMLResponse(page)


# ---- backup -----------------------------------------------------------------------------------


@router.get("/backup")
def backup(ctx: Money, db: DB, lang: Lang = None):
    """Everything the shop would want to keep, as CSV files in one zip: works while soft-locked."""
    from app.modules.exports import router as ex

    parts: dict[str, Response] = {
        "stock-all.csv": ex.stock(ctx, db, "csv", lang, status=None),
        "people.csv": ex.parties(ctx, db, "csv", lang),
        "udhaar-khata.csv": ex.khata(ctx, db, "csv", lang),
    }
    if ctx.can(Cap.REPORTS_ALL):
        far = dt.date(2000, 1, 1)
        today = dt.date.today() + dt.timedelta(days=1)
        parts["sales.csv"] = ex.sales(ctx, db, "csv", lang, far, today)
        parts["purchases.csv"] = ex.purchases(ctx, db, "csv", lang, far, today)
        parts["expenses.csv"] = ex.expenses(ctx, db, "csv", lang, far, today)
    # accessories straight from the table (no export route of their own)
    from sqlalchemy import select

    from app.modules.accessories.models import Accessory

    buf = io.StringIO()
    buf.write("﻿")
    w = csv.writer(buf)
    w.writerow(["SKU", "Name", "Category", "Qty", "Avg cost", "Price", "Reorder at"])
    for a in db.scalars(select(Accessory).where(Accessory.shop_id == ctx.shop_id)).all():
        w.writerow([a.sku, a.name, a.category, a.qty, a.avg_cost, a.price, a.reorder_level])
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for name, resp in parts.items():
            z.writestr(name, resp.body)
        z.writestr("accessories.csv", buf.getvalue().encode("utf-8"))
        z.writestr(
            "README.txt",
            f"Mobile Shop backup of {ctx.shop.name} taken {dt.datetime.now():%d-%m-%Y %H:%M}.\n"
            "CSV files open in Excel. Your data on the server is never deleted; this copy is yours to keep.\n",
        )
    record_audit(
        db,
        shop_id=ctx.shop_id,
        user_id=ctx.user.id,
        entity="shop",
        entity_id=ctx.shop_id,
        action="backup",
        after={"files": sorted(parts) + ["accessories.csv"]},
    )
    db.commit()
    stamp = dt.date.today().isoformat()
    return Response(
        content=out.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="mobileshop-backup-{stamp}.zip"'},
    )
