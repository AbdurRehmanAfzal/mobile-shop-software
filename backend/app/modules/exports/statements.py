"""Two reports a shopkeeper asked for by sending his old software's printouts (owner 2026-11-18,
ADR-103):

1. **Account ledger** — one person's khata for a period as an accountant's sheet: an opening
   balance, then every bill and payment in date order with its number, what was on it
   ("Vivo X90 Pro 12/512 — 1 @ 90,000 = 90,000"), debit, credit and the running balance, and the
   totals at the foot.
2. **Stock with cost price (item wise)** — the phones in hand grouped by brand, one line per
   model + memory, with the quantity, the average price of one and the cost; a total per brand
   and a grand total.

Both are read-only and derived: the ledger lines, the bills behind them, the phones in stock.
A bill that was deleted (its ledger group reversed) and its reversal are both left out, so the
sheet reads as the khata stands; the closing balance is still the person's real balance, because
the two cancel. Cost is for those who may see it — others get the stock sheet at asking price."""

import datetime as dt
import html
import uuid
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.clock import local_date, local_day
from app.core.errors import NotFound
from app.db.base import ZERO
from app.modules.auth import profile
from app.modules.auth.models import Shop
from app.modules.catalogue.models import Brand, Model, Storage
from app.modules.devices.models import Device
from app.modules.devices.state import DeviceStatus
from app.modules.ledger.models import LedgerEntry, LedgerGroup
from app.modules.ledger.service import money
from app.modules.parties.models import Party

# what a ledger line is, in the shopkeeper's words (en, ur)
TYPES: dict[str, tuple[str, str]] = {
    "invoice": ("Sale", "فروخت"),
    "purchase": ("Purchase", "خریداری"),
    "payment": ("Payment", "ادائیگی"),
    "lending": ("Len-den", "لین دین"),
    "sale_return": ("Return (customer)", "واپسی (گاہک)"),
    "purchase_return": ("Return to seller", "بیچنے والے کو واپسی"),
    "opening_balance": ("Opening balance", "پرانا حساب"),
    "repair": ("Repair", "مرمت"),
    "repair_bill": ("Repair", "مرمت"),
    "repair_advance": ("Repair advance", "مرمت کا ایڈوانس"),
    "repair_lab": ("Repair lab", "مرمت لیب"),
    "repair_cost": ("Repair lab", "مرمت لیب"),
    "loan": ("Loan (amanat)", "امانت"),
    "installment_plan": ("Installments", "قسطیں"),
    "exchange_refund": ("Exchange", "ایکسچینج"),
    "sale_party_change": ("Bill moved", "بل منتقل"),
    "purchase_party_change": ("Bill moved", "بل منتقل"),
    "purchase_paid_change": ("Payment corrected", "ادائیگی درست"),
    "purchase_cost_change": ("Price corrected", "قیمت درست"),
}
T = {
    "en": {
        "ledger": "Account Ledger",
        "account": "Account name",
        "phone": "Phone",
        "period": "Period",
        "all": "All dates",
        "to": "to",
        "date": "Date",
        "type": "Type",
        "no": "No.",
        "particular": "Particulars",
        "debit": "Debit",
        "credit": "Credit",
        "balance": "Balance",
        "opening": "Opening balance",
        "tot_debit": "Total debit in the period",
        "tot_credit": "Total credit in the period",
        "closing": "Closing balance",
        "owes": "{name} has to pay the shop {amount}",
        "we_owe": "The shop has to pay {name} {amount}",
        "clear": "Nothing is owed either way",
        "stock": "Stock with Cost Price (Item Wise)",
        "stock_ask": "Stock with Selling Price (Item Wise)",
        "item": "Item",
        "qty": "Quantity",
        "unit": "Unit price",
        "cost": "Cost",
        "value": "Value",
        "brand_total": "Total",
        "grand": "Grand total",
        "printed": "Printed",
        "none": "No entries in this period",
    },
    "ur": {
        "ledger": "اکاؤنٹ لیجر (کھاتہ)",
        "account": "نام",
        "phone": "فون",
        "period": "مدت",
        "all": "تمام تاریخیں",
        "to": "سے",
        "date": "تاریخ",
        "type": "قسم",
        "no": "نمبر",
        "particular": "تفصیل",
        "debit": "ڈیبٹ",
        "credit": "کریڈٹ",
        "balance": "بیلنس",
        "opening": "پرانا بیلنس",
        "tot_debit": "اس مدت کا کل ڈیبٹ",
        "tot_credit": "اس مدت کا کل کریڈٹ",
        "closing": "آخری بیلنس",
        "owes": "{name} نے دکان کو {amount} دینے ہیں",
        "we_owe": "دکان نے {name} کو {amount} دینے ہیں",
        "clear": "کسی کا کچھ باقی نہیں",
        "stock": "اسٹاک، لاگت کے ساتھ (آئٹم کے حساب سے)",
        "stock_ask": "اسٹاک، فروخت کی قیمت کے ساتھ (آئٹم کے حساب سے)",
        "item": "آئٹم",
        "qty": "تعداد",
        "unit": "ایک کی قیمت",
        "cost": "لاگت",
        "value": "مالیت",
        "brand_total": "کل",
        "grand": "کل میزان",
        "printed": "پرنٹ",
        "none": "اس مدت میں کوئی اندراج نہیں",
    },
}


def _variant(d: Device, brand: str, model: str, storage: str | None) -> str:
    """ "Xiaomi 13T Pro 12/256" — the model with its RAM / memory, as a dealer writes it"""
    mem = (storage or "").upper().replace("GB", "").strip()
    if d.ram_gb and mem:
        spec = f"{d.ram_gb}/{mem}"
    elif mem:
        spec = storage
    else:
        spec = f"{d.ram_gb}GB RAM" if d.ram_gb else ""
    return " ".join(x for x in (brand, model, spec) if x).strip()


def _names(db: Session, devices: list[Device]) -> dict[uuid.UUID, str]:
    def by_id(model, ids):
        ids = {i for i in ids if i}
        return (
            {r.id: r.name for r in db.scalars(select(model).where(model.id.in_(ids))).all()}
            if ids
            else {}
        )

    brands = by_id(Brand, [d.brand_id for d in devices])
    models = by_id(Model, [d.model_id for d in devices])
    stores = by_id(Storage, [d.storage_id for d in devices])
    return {
        d.id: _variant(
            d, brands.get(d.brand_id, ""), models.get(d.model_id, ""), stores.get(d.storage_id)
        )
        for d in devices
    }


# ---- 1. account ledger ----------------------------------------------------------------------------


def _doc_details(db: Session, shop_id: uuid.UUID, groups: list[LedgerGroup]) -> dict:
    """group id -> (document number, item lines) for the bills behind the ledger groups"""
    from app.modules.payments.models import Payment
    from app.modules.purchases.models import Purchase
    from app.modules.returns.models import ReturnDoc
    from app.modules.sales.models import Invoice

    def load(model, kinds):
        ids = {g.document_id for g in groups if g.document_type in kinds and g.document_id}
        rows = db.scalars(select(model).where(model.id.in_(ids))).all() if ids else []
        return {r.id: r for r in rows if r.shop_id == shop_id}

    invoices = load(Invoice, {"invoice"})
    purchases = load(Purchase, {"purchase"})
    returns = load(ReturnDoc, {"sale_return", "purchase_return"})
    payments = load(Payment, {"payment", "lending"})
    device_ids = {
        ln.device_id
        for doc in [*invoices.values(), *purchases.values()]
        for ln in doc.lines
        if ln.device_id
    }
    devices = (
        list(db.scalars(select(Device).where(Device.id.in_(device_ids))).all())
        if device_ids
        else []
    )
    names = _names(db, devices)

    def line(label, qty, unit, total) -> str:
        return f"{label} — {qty} @ {unit:,.0f} = {total:,.0f}"

    out: dict[uuid.UUID, tuple[str, list[str]]] = {}
    for g in groups:
        doc_id = g.document_id
        if g.document_type == "invoice" and doc_id in invoices:
            inv = invoices[doc_id]
            items = [
                line(
                    names.get(ln.device_id) or ln.description or "",
                    ln.qty,
                    ln.unit_price,
                    ln.line_total,
                )
                for ln in inv.lines
            ]
            out[g.id] = (inv.no, items)
        elif g.document_type == "purchase" and doc_id in purchases:
            pur = purchases[doc_id]
            items = [
                line(
                    names.get(ln.device_id) or ln.description or "",
                    ln.qty,
                    ln.unit_cost,
                    ln.net_cost,
                )
                for ln in pur.lines
            ]
            out[g.id] = (pur.no, items)
        elif g.document_type in ("sale_return", "purchase_return") and doc_id in returns:
            r = returns[doc_id]
            items = [
                f"{x.get('description') or ''} ({r.document_no})".strip() for x in (r.lines or [])
            ]
            out[g.id] = (r.no, [i for i in items if i] or [r.document_no])
        elif g.document_type in ("payment", "lending") and doc_id in payments:
            p = payments[doc_id]
            bits = [p.method, p.reference, p.notes]
            out[g.id] = (p.no, [" · ".join(str(b) for b in bits if b)])
    return out


def account_ledger(
    db: Session,
    shop_id: uuid.UUID,
    party_id: uuid.UUID,
    date_from: dt.date | None,
    date_to: dt.date | None,
) -> dict:
    party = db.get(Party, party_id)
    if party is None or party.shop_id != shop_id:
        raise NotFound(code="party_not_found")
    # a deleted bill and the entry that reversed it are a pair that cancels: neither is listed
    live = (
        LedgerEntry.shop_id == shop_id,
        LedgerEntry.party_id == party_id,
        LedgerGroup.reversed_by_group_id.is_(None),
        LedgerGroup.reverses_group_id.is_(None),
    )
    opening = ZERO
    if date_from:
        opening = money(
            db.scalar(
                select(func.coalesce(func.sum(LedgerEntry.debit - LedgerEntry.credit), 0))
                .join(LedgerGroup, LedgerGroup.id == LedgerEntry.group_id)
                .where(*live, local_day(LedgerEntry.at) < date_from)
            )
            or 0
        )
    stmt = (
        select(LedgerEntry, LedgerGroup)
        .join(LedgerGroup, LedgerGroup.id == LedgerEntry.group_id)
        .where(*live)
        .order_by(LedgerEntry.at, LedgerGroup.id, LedgerEntry.seq)
    )
    if date_from:
        stmt = stmt.where(local_day(LedgerEntry.at) >= date_from)
    if date_to:
        stmt = stmt.where(local_day(LedgerEntry.at) <= date_to)
    found = db.execute(stmt).all()
    details = _doc_details(db, shop_id, list({g.id: g for _e, g in found}.values()))
    running = opening
    rows, shown = [], set()
    tot_debit = tot_credit = ZERO
    for entry, group in found:
        running = money(running + entry.debit - entry.credit)
        tot_debit += entry.debit
        tot_credit += entry.credit
        no, items = details.get(group.id, ("", []))
        # the bill's items are written once, on its first line; a payment made with the bill
        # (the second line of the same group) says only what it is
        first = group.id not in shown
        shown.add(group.id)
        rows.append(
            {
                "at": entry.at,
                "date": local_date(entry.at),
                "type": group.document_type,
                "no": no,
                "items": items if first else [],
                "memo": entry.memo or group.memo or "",
                "debit": money(entry.debit),
                "credit": money(entry.credit),
                "balance": running,
            }
        )
    return {
        "party": party,
        "date_from": date_from,
        "date_to": date_to,
        "opening": opening,
        "rows": rows,
        "debit": money(tot_debit),
        "credit": money(tot_credit),
        "closing": running,
    }


def ledger_flat(led: dict, ur: bool) -> tuple[list[str], list[list]]:
    """for Excel / CSV: one row per ledger line, the items joined into the particulars cell"""
    t = T["ur" if ur else "en"]
    head = [t["date"], t["type"], t["no"], t["particular"], t["debit"], t["credit"], t["balance"]]
    rows: list[list] = [["", t["opening"], "", "", "", "", led["opening"]]]
    for r in led["rows"]:
        typ = TYPES.get(r["type"], (r["type"].replace("_", " ").title(),) * 2)[1 if ur else 0]
        rows.append(
            [
                r["date"].isoformat(),
                typ,
                r["no"],
                "; ".join(r["items"]) or r["memo"],
                r["debit"] or "",
                r["credit"] or "",
                r["balance"],
            ]
        )
    rows.append(["", t["tot_debit"], "", "", led["debit"], "", ""])
    rows.append(["", t["tot_credit"], "", "", "", led["credit"], ""])
    rows.append(["", t["closing"], "", "", "", "", led["closing"]])
    return head, rows


def _amount(v: Decimal) -> str:
    """Latin digits; a negative figure with a real minus sign, never brackets"""
    return f"−{abs(v):,.0f}" if v < 0 else f"{v:,.0f}"


def _page(shop: Shop, ur: bool, title: str, body: str) -> str:
    e = html.escape
    now = dt.datetime.now().strftime("%d-%m-%Y %I:%M %p")
    t = T["ur" if ur else "en"]
    font = "'Noto Nastaliq Urdu', Manrope" if ur else "Manrope, 'Noto Nastaliq Urdu'"
    return f"""<!doctype html><html lang="{"ur" if ur else "en"}" dir="{"rtl" if ur else "ltr"}"><head><meta charset="utf-8"><title>{e(title)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;700;800&family=Noto+Nastaliq+Urdu&display=swap">
<style>
@page {{ size: A4 portrait; margin: 10mm; }}
body {{ font-family: {font}, sans-serif; color: #1B1F24; margin: 0; {"line-height: 1.9;" if ur else ""} }}
.ph h1 {{ font-size: 20px; margin: 0; }} .ph {{ margin-bottom: 6px; }}
h2 {{ font-size: 16px; margin: 6px 0 2px; text-align: center; }}
.meta {{ display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 16px; font-size: 12px; margin: 6px 0 8px; padding: 6px 0; border-top: 1px solid #1B1F24; border-bottom: 1px solid #E6E2DA; }}
.meta b {{ font-weight: 800; }}
table {{ width: 100%; border-collapse: collapse; font-size: 11px; }}
thead {{ display: table-header-group; }} tr {{ break-inside: avoid; }}
th {{ background: #F6F4EF; text-align: start; font-weight: 800; }}
th, td {{ border: 1px solid #E6E2DA; padding: 4px 6px; vertical-align: top; overflow-wrap: anywhere; }}
.n {{ font-family: Manrope, sans-serif; text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; direction: ltr; }}
.d {{ white-space: nowrap; font-family: Manrope, sans-serif; direction: ltr; }}
.it {{ display: block; }} .mu {{ color: #5E646B; }}
tr.grp td {{ background: #F6F4EF; font-weight: 800; font-size: 12px; }}
tr.sub td {{ font-weight: 800; background: #FBFAF7; }}
tr.grand td {{ font-weight: 800; font-size: 13px; border-top: 2px solid #1B1F24; }}
.neg {{ color: #A1352B; }}
.foot {{ margin-top: 10px; border: 1px solid #1B1F24; padding: 8px 10px; font-size: 12px; display: flex; flex-wrap: wrap; gap: 4px 18px; justify-content: space-between; }}
.foot b {{ font-family: Manrope, sans-serif; }} .say {{ margin-top: 6px; font-size: 13px; font-weight: 800; }}
.stamp {{ margin-top: 8px; font-size: 10px; color: #5E646B; text-align: end; }}
</style></head><body>
{profile.header_html(shop, ur)}
<h2>{e(title)}</h2>
{body}
<div class="stamp">{e(t["printed"])}: <span class="d">{e(now)}</span></div>
{profile.footer_html(shop, ur)}
</body></html>"""


def ledger_html(db: Session, shop_id: uuid.UUID, led: dict, ur: bool) -> str:
    shop = db.get(Shop, shop_id)
    t = T["ur" if ur else "en"]
    e = html.escape
    p: Party = led["party"]
    period = (
        f"{led['date_from']:%d-%m-%Y} {t['to']} {(led['date_to'] or dt.date.today()):%d-%m-%Y}"
        if led["date_from"]
        else (f"… {t['to']} {led['date_to']:%d-%m-%Y}" if led["date_to"] else t["all"])
    )

    def bal(v: Decimal) -> str:
        return f'<td class="n{" neg" if v < 0 else ""}">{_amount(v)}</td>'

    trs = [
        f'<tr class="sub"><td></td><td colspan="5">{e(t["opening"])}</td>{bal(led["opening"])}</tr>'
    ]
    for r in led["rows"]:
        typ = TYPES.get(r["type"], (r["type"].replace("_", " ").title(),) * 2)[1 if ur else 0]
        part = "".join(f'<span class="it">{e(i)}</span>' for i in r["items"]) or (
            f'<span class="it mu">{e(r["memo"])}</span>' if r["memo"] else ""
        )
        trs.append(
            "<tr>"
            f'<td class="d">{r["date"]:%d-%m-%Y}<br><span class="mu">{local_time(r["at"])}</span></td>'
            f"<td>{e(typ)}</td>"
            f'<td class="d">{e(r["no"])}</td>'
            f'<td dir="auto">{part}</td>'
            f'<td class="n">{_amount(r["debit"]) if r["debit"] else ""}</td>'
            f'<td class="n">{_amount(r["credit"]) if r["credit"] else ""}</td>'
            f"{bal(r['balance'])}"
            "</tr>"
        )
    if not led["rows"]:
        trs.append(f'<tr><td colspan="7" class="mu">{e(t["none"])}</td></tr>')
    closing = led["closing"]
    name = p.name
    say = (
        t["owes"].format(name=name, amount=profile.money(shop, closing))
        if closing > 0
        else t["we_owe"].format(name=name, amount=profile.money(shop, -closing))
        if closing < 0
        else t["clear"]
    )
    body = f"""
<div class="meta"><span>{e(t["account"])}: <b>{e(name)}</b></span><span>{e(t["phone"])}: <b class="d">{e(p.phone or "—")}</b></span><span>{e(t["period"])}: <b class="d">{e(period)}</b></span></div>
<table><thead><tr><th>{e(t["date"])}</th><th>{e(t["type"])}</th><th>{e(t["no"])}</th><th>{e(t["particular"])}</th><th class="n">{e(t["debit"])}</th><th class="n">{e(t["credit"])}</th><th class="n">{e(t["balance"])}</th></tr></thead>
<tbody>{"".join(trs)}</tbody></table>
<div class="foot"><span>{e(t["tot_debit"])}: <b>{_amount(led["debit"])}</b></span><span>{e(t["tot_credit"])}: <b>{_amount(led["credit"])}</b></span><span>{e(t["closing"])}: <b class="{"neg" if closing < 0 else ""}">{_amount(closing)}</b></span></div>
<div class="say" dir="auto">{e(say)}</div>"""
    return _page(shop, ur, t["ledger"], body)


def local_time(at: dt.datetime) -> str:
    from app.core.clock import shop_tz

    v = at if at.tzinfo else at.replace(tzinfo=dt.UTC)
    return v.astimezone(shop_tz()).strftime("%I:%M %p")


# ---- 2. stock with cost price, item wise ----------------------------------------------------------

HELD = (
    DeviceStatus.IN_STOCK,
    DeviceStatus.FAULTY,
    DeviceStatus.IN_REPAIR,
    DeviceStatus.WITH_CUSTOMER_FOR_APPROVAL,
    DeviceStatus.ON_LOAN,
)


def stock_items(db: Session, shop_id: uuid.UUID, show_cost: bool) -> dict:
    """The phones the shop holds (the stock screen's own rule, as the stock-worth report), grouped
    by brand and then by model + memory. Value at cost, or at asking price for those who may not
    see cost (`basis` says which)."""
    devices = list(
        db.scalars(select(Device).where(Device.shop_id == shop_id, Device.status.in_(HELD))).all()
    )
    names = _names(db, devices)
    brand_names = {
        b.id: b.name
        for b in db.scalars(
            select(Brand).where(Brand.id.in_({d.brand_id for d in devices} or {uuid.uuid4()}))
        ).all()
    }
    brands: dict[str, dict] = {}
    for d in devices:
        value = (d.cost_price if show_cost else d.asking_price) or ZERO
        b = brands.setdefault(
            brand_names.get(d.brand_id, ""),
            {"name": brand_names.get(d.brand_id, ""), "qty": 0, "value": ZERO, "items": {}},
        )
        it = b["items"].setdefault(names[d.id], {"name": names[d.id], "qty": 0, "value": ZERO})
        for x in (b, it):
            x["qty"] += 1
            x["value"] = money(x["value"] + value)
    out = []
    for b in sorted(brands.values(), key=lambda x: x["name"].lower()):
        items = sorted(b["items"].values(), key=lambda x: x["name"].lower())
        for it in items:
            it["unit"] = money(it["value"] / it["qty"]) if it["qty"] else ZERO
        out.append({**b, "items": items})
    return {
        "basis": "cost" if show_cost else "asking",
        "brands": out,
        "qty": len(devices),
        "value": money(sum((b["value"] for b in out), ZERO)),
    }


def stock_flat(s: dict, ur: bool) -> tuple[list[str], list[list]]:
    t = T["ur" if ur else "en"]
    last = t["cost"] if s["basis"] == "cost" else t["value"]
    head = [t["item"], t["qty"], t["unit"], last]
    rows: list[list] = []
    for b in s["brands"]:
        rows.append([b["name"].upper(), "", "", ""])
        rows += [[it["name"], it["qty"], it["unit"], it["value"]] for it in b["items"]]
        rows.append([f"{b['name']} — {t['brand_total']}", b["qty"], "", b["value"]])
    rows.append([t["grand"], s["qty"], "", s["value"]])
    return head, rows


def stock_html(db: Session, shop_id: uuid.UUID, s: dict, ur: bool) -> str:
    shop = db.get(Shop, shop_id)
    t = T["ur" if ur else "en"]
    e = html.escape
    last = t["cost"] if s["basis"] == "cost" else t["value"]
    trs = []
    for b in s["brands"]:
        trs.append(f'<tr class="grp"><td colspan="4">{e(b["name"])}</td></tr>')
        for it in b["items"]:
            trs.append(
                f'<tr><td dir="auto">{e(it["name"])}</td><td class="n">{it["qty"]}</td>'
                f'<td class="n">{_amount(it["unit"])}</td><td class="n">{_amount(it["value"])}</td></tr>'
            )
        trs.append(
            f'<tr class="sub"><td>{e(b["name"])} — {e(t["brand_total"])}</td>'
            f'<td class="n">{b["qty"]}</td><td></td><td class="n">{_amount(b["value"])}</td></tr>'
        )
    if not s["brands"]:
        trs.append(f'<tr><td colspan="4" class="mu">{e(t["none"])}</td></tr>')
    trs.append(
        f'<tr class="grand"><td>{e(t["grand"])}</td><td class="n">{s["qty"]}</td><td></td>'
        f'<td class="n">{e(profile.money(shop, s["value"]))}</td></tr>'
    )
    body = f"""<table><thead><tr><th>{e(t["item"])}</th><th class="n">{e(t["qty"])}</th><th class="n">{e(t["unit"])}</th><th class="n">{e(last)}</th></tr></thead>
<tbody>{"".join(trs)}</tbody></table>"""
    return _page(shop, ur, t["stock"] if s["basis"] == "cost" else t["stock_ask"], body)
