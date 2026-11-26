"""A person's khata, the full version (owner 2026-11-25, mock-up 21): what the screen shows beside the
statement — the phones bought from them and where each one is now (in the shop / sold, with its
profit / returned), the same by brand and model, the money by channel (cash, bank, wallets, cheque),
the old balance carried over, and the next promised date of an open len-den.

Read-only and derived: the units are `party_units` (purchase and invoice lines), a sold unit's
profit is its invoice line's price less the cost on that line (as the shop audit's journey counts
it), the channels are the payments by method plus the money paid at the counter on their bills
(the ledger's cash lines in those bills' groups, by account kind), the old balance is the ledger's
opening-balance groups, the promise is the len-den due date (`lending_due`). Cost, what was paid
out and profit only for those who may see cost."""

import uuid
from collections import defaultdict
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.clock import today as shop_today
from app.core.errors import NotFound
from app.db.base import ZERO
from app.modules.catalogue.service import name_key
from app.modules.ledger.models import CashAccount, LedgerEntry
from app.modules.ledger.service import money, party_old_balances
from app.modules.parties.models import Party
from app.modules.payments.lending_due import due_by_party
from app.modules.payments.models import Payment
from app.modules.purchases.models import Purchase, PurchaseStatus
from app.modules.sales.models import Invoice, InvoiceLine, InvoiceStatus
from app.modules.units.service import party_units

IN_SHOP = ("in_stock", "faulty", "in_repair", "on_loan", "with_customer_for_approval")


def _state(row: dict) -> str:
    if row.get("returned_at"):
        return "returned"
    if row["status"] in IN_SHOP:
        return "in_shop"
    if row["status"] == "sold":
        return "sold"
    return "other"  # sent to a branch, used for parts, returned to another supplier


def party_khata(db: Session, shop_id: uuid.UUID, party_id: uuid.UUID, *, can_cost: bool) -> dict:
    party = db.get(Party, party_id)
    if party is None or party.shop_id != shop_id:
        raise NotFound(code="party_not_found")
    pu = party_units(db, shop_id, party_id, can_cost=True)
    today = shop_today()

    # where each phone bought from them is now; a sold one with its price and profit
    bought = [r for r in pu["rows"] if r["role"] == "bought_from"]
    ids = [r["device_id"] for r in bought]
    sale_of: dict = {}
    if ids:
        for ln, inv in db.execute(
            select(InvoiceLine, Invoice)
            .join(Invoice, Invoice.id == InvoiceLine.invoice_id)
            .where(
                Invoice.shop_id == shop_id,
                Invoice.status != InvoiceStatus.VOID,
                InvoiceLine.device_id.in_(ids),
                InvoiceLine.returned_at.is_(None),
            )
            .order_by(Invoice.date, Invoice.created_at)
        ).all():
            sale_of[ln.device_id] = (ln, inv)
    units = []
    for r in bought:
        st = _state(r)
        sale = sale_of.get(r["device_id"]) if st == "sold" else None
        sold_for = money(sale[0].line_total) if sale else None
        profit = (
            money(sale[0].line_total - sale[0].cost) if sale and sale[0].cost is not None else None
        )
        units.append(
            {
                "role": "bought_from",
                "state": st,
                "device_id": r["device_id"],
                "label": r["label"],
                "brand_name": r["brand_name"],
                "model_name": r["model_name"],
                "storage_name": r["storage_name"],
                "colour_name": r["colour_name"],
                "imei1": r["imei1"],
                "status": r["status"],
                "doc_id": r["doc_id"],
                "no": r["no"],
                "date": r["date"],
                "days_in_shop": (today - r["date"]).days if st == "in_shop" else None,
                "cost": r["agreed"] if can_cost else None,
                "sold_for": sold_for,
                "sold_no": sale[1].no if sale else None,
                "sold_id": sale[1].id if sale else None,
                "profit": profit if can_cost else None,
            }
        )
    for r in pu["rows"]:
        if r["role"] != "sold_to":
            continue
        units.append(
            {
                "role": "sold_to",
                "state": "returned" if r.get("returned_at") else "sold_to",
                "device_id": r["device_id"],
                "label": r["label"],
                "brand_name": r["brand_name"],
                "model_name": r["model_name"],
                "storage_name": r["storage_name"],
                "colour_name": r["colour_name"],
                "imei1": r["imei1"],
                "status": r["status"],
                "doc_id": r["doc_id"],
                "no": r["no"],
                "date": r["date"],
                "days_in_shop": None,
                "cost": None,
                "sold_for": r["agreed"],
                "sold_no": r["no"],
                "sold_id": r["doc_id"],
                "profit": None,
                "remaining": r["remaining"],
            }
        )

    def pile(state: str) -> dict:
        rows = [u for u in units if u["role"] == "bought_from" and u["state"] == state]
        return {
            "count": len(rows),
            "cost": money(sum((Decimal(u["cost"]) for u in rows if u["cost"] is not None), ZERO))
            if can_cost
            else None,
        }

    in_shop = [u for u in units if u["role"] == "bought_from" and u["state"] == "in_shop"]
    dearest = (
        max(in_shop, key=lambda u: Decimal(u["cost"] or 0), default=None) if can_cost else None
    )
    sold_rows = [u for u in units if u["role"] == "bought_from" and u["state"] == "sold"]
    stock = {
        "bought": len(bought),
        "in_shop": pile("in_shop"),
        "sold": {
            **pile("sold"),
            "value": money(sum((Decimal(u["sold_for"] or 0) for u in sold_rows), ZERO)),
            "profit": money(sum((Decimal(u["profit"] or 0) for u in sold_rows), ZERO))
            if can_cost
            else None,
        },
        "returned": pile("returned"),
        "other": pile("other"),
        "dearest": {
            "label": dearest["label"],
            "cost": dearest["cost"],
            "device_id": dearest["device_id"],
        }
        if dearest
        else None,
        "sold_to": sum(1 for u in units if u["role"] == "sold_to" and u["state"] == "sold_to"),
    }

    # the same by brand and model (one model, one name — ADR-125)
    groups: dict = {}
    for u in units:
        key = (u["brand_name"] or "", name_key(u["model_name"] or ""))
        g = groups.setdefault(
            key,
            {
                "brand_name": u["brand_name"],
                "model_name": u["model_name"],
                "bought": 0,
                "in_shop": 0,
                "sold": 0,
                "returned": 0,
                "sold_to": 0,
                "highest_cost": ZERO,
                "total_cost": ZERO,
            },
        )
        if u["role"] == "sold_to":
            g["sold_to"] += 1 if u["state"] == "sold_to" else 0
            continue
        g["bought"] += 1
        if u["state"] in ("in_shop", "sold", "returned"):
            g[u["state"]] += 1
        c = Decimal(u["cost"] or 0)
        g["highest_cost"] = max(g["highest_cost"], c)
        g["total_cost"] = money(g["total_cost"] + c)
    models = sorted(
        groups.values(),
        key=lambda g: (-(g["bought"] + g["sold_to"]), g["brand_name"] or "", g["model_name"] or ""),
    )
    if not can_cost:
        for g in models:
            g["highest_cost"] = g["total_cost"] = None

    # money by channel: payments by method, and what was paid at the counter on their bills
    chan: dict = defaultdict(lambda: {"in": ZERO, "out": ZERO, "count": 0})
    pays = db.scalars(
        select(Payment).where(
            Payment.shop_id == shop_id, Payment.party_id == party_id, Payment.status == "posted"
        )
    ).all()
    log = []
    for p in pays:
        c = chan[str(p.method)]
        c["in" if p.direction == "in" else "out"] += p.amount
        c["count"] += 1
        log.append(
            {
                "id": p.id,
                "no": p.no,
                "date": p.date,
                "direction": p.direction,
                "method": str(p.method),
                "amount": p.amount if (p.direction == "in" or can_cost) else None,
                "purpose": p.purpose,
                "reference": p.reference,
                "notes": p.notes,
            }
        )
    for model, side in ((Invoice, "in"), (Purchase, "out")):
        docs = db.scalars(
            select(model.ledger_group_id).where(
                model.shop_id == shop_id,
                model.party_id == party_id,
                model.ledger_group_id.is_not(None),
                (model.status != InvoiceStatus.VOID)
                if model is Invoice
                else (model.status == PurchaseStatus.POSTED),
            )
        ).all()
        if not docs:
            continue
        col = LedgerEntry.debit if side == "in" else LedgerEntry.credit
        for kind, total, n in db.execute(
            select(CashAccount.kind, func.coalesce(func.sum(col), 0), func.count(LedgerEntry.id))
            .join(CashAccount, CashAccount.id == LedgerEntry.cash_account_id)
            .where(LedgerEntry.shop_id == shop_id, LedgerEntry.group_id.in_(docs), col > 0)
            .group_by(CashAccount.kind)
        ).all():
            c = chan[str(kind)]
            c[side] += money(total)
            c["count"] += n
    channels = [
        {
            "method": m,
            "in": money(v["in"]),
            "out": money(v["out"]) if can_cost else None,
            "count": v["count"],
        }
        for m, v in sorted(chan.items(), key=lambda kv: -(kv[1]["in"] + kv[1]["out"]))
    ]
    log.sort(key=lambda r: (r["date"], r["no"]), reverse=True)

    olds = party_old_balances(db, shop_id, party_id)
    old_net = money(
        sum(
            ((o["amount"] if o["party_owes"] else -o["amount"]) for o in olds if not o["deleted"]),
            ZERO,
        )
    )
    due = due_by_party(db, shop_id, [party_id]).get(party_id)

    return {
        "party_id": party.id,
        "created_at": party.created_at,
        "balance": money(party.balance),
        "old_balance": old_net if can_cost else None,
        "promise": {"date": due["due_date"], "side": due["side"], "entries": due["entries"]}
        if due
        else None,
        "stock": stock,
        "units": units,
        "models": models,
        "channels": channels,
        "money_in": money(sum((v["in"] for v in chan.values()), ZERO)),
        "money_out": money(sum((v["out"] for v in chan.values()), ZERO)) if can_cost else None,
        "payments": log,
    }


# ---- the full ledger report (A4) -------------------------------------------------------------

SECTIONS = ("channels", "models", "units", "ledger")
T = {
    "title": ("Khata statement", "کھاتہ اسٹیٹمنٹ"),
    "period": ("Period", "مدت"),
    "all": ("All dates", "تمام تاریخیں"),
    "made": ("Made on", "بنایا"),
    "phone": ("Phone", "فون"),
    "since": ("Account opened", "کھاتہ کھلا"),
    "owes": ("They have to give", "انہوں نے دینے ہیں"),
    "weOwe": ("We have to give", "ہم نے دینے ہیں"),
    "clear": ("Settled", "صاف"),
    "old": ("Old balance (before the software)", "پرانا حساب (سافٹ ویئر سے پہلے)"),
    "opening": ("Balance at the start of the period", "مدت کے شروع میں"),
    "closing": ("Balance at the end of the period", "مدت کے آخر میں"),
    "debit": ("They owe more (debit)", "ان کے ذمے (ڈیبٹ)"),
    "credit": ("They owe less (credit)", "ہمارے ذمے (کریڈٹ)"),
    "channels": ("Money by channel", "رقم کس ذریعے سے"),
    "method": ("Channel", "ذریعہ"),
    "in": ("Received", "ملے"),
    "out": ("Paid", "دیے"),
    "models": ("Phones by brand and model", "برانڈ اور ماڈل"),
    "bought": ("Bought", "خریدے"),
    "inShop": ("In shop", "دکان میں"),
    "sold": ("Sold", "بکے"),
    "returned": ("Returned", "واپس"),
    "soldTo": ("Sold to them", "انہیں بیچے"),
    "cost": ("Cost", "لاگت"),
    "units": ("Every phone, where it is now", "ہر فون، اب کہاں ہے"),
    "unit": ("Phone", "فون"),
    "bill": ("Bill", "بل"),
    "state": ("Now", "اب"),
    "soldFor": ("Sold for", "بکا"),
    "profit": ("Profit", "منافع"),
    "ledger": ("Every entry", "ہر لائن"),
    "date": ("Date", "تاریخ"),
    "what": ("Details", "تفصیل"),
    "running": ("Balance", "بقایا"),
    "none": ("Nothing in this period.", "اس مدت میں کچھ نہیں۔"),
    "sign": ("Signature", "دستخط"),
    "s.in_shop": ("In shop", "دکان میں"),
    "s.sold": ("Sold", "بک گیا"),
    "s.returned": ("Returned", "واپس"),
    "s.other": ("Moved", "منتقل"),
    "s.sold_to": ("Sold to them", "انہیں بیچا"),
}
METHOD = {
    "cash": ("Cash", "نقد"),
    "bank": ("Bank", "بینک"),
    "easypaisa": ("Easypaisa", "ایزی پیسہ"),
    "jazzcash": ("JazzCash", "جاز کیش"),
    "card": ("Card", "کارڈ"),
    "online": ("Online", "آن لائن"),
    "cheque": ("Cheque", "چیک"),
    "remittance": ("From abroad", "بیرون ملک سے"),
    "other": ("Other", "دیگر"),
}
DOC = {
    "invoice": ("Sale", "فروخت"),
    "purchase": ("Purchase", "خریداری"),
    "payment": ("Payment", "ادائیگی"),
    "lending": ("Len-den", "لین دین"),
    "opening_balance": ("Old balance", "پرانا حساب"),
    "sale_return": ("Sale return", "فروخت کی واپسی"),
    "purchase_return": ("Return to seller", "خریداری کی واپسی"),
    "repair": ("Repair", "مرمت"),
}


def report_html(
    db: Session,
    shop_id: uuid.UUID,
    party_id: uuid.UUID,
    *,
    date_from=None,
    date_to=None,
    sections: str | None = None,
    profit: bool = False,
    lang: str | None = None,
    can_cost: bool = False,
) -> str:
    import html

    from app.modules.auth import profile
    from app.modules.auth.models import Shop
    from app.modules.exports import frame
    from app.modules.ledger.service import party_statement

    shop = db.get(Shop, shop_id)
    party = db.get(Party, party_id)
    lang = lang if lang in ("en", "ur") else (shop.default_locale or "ur")
    ur = lang == "ur"
    i = 1 if ur else 0
    e = html.escape
    want = [s for s in (sections or ",".join(SECTIONS)).split(",") if s in SECTIONS]
    k = party_khata(db, shop_id, party_id, can_cost=can_cost)
    st = party_statement(db, shop_id, party_id, date_from, date_to)
    rs = lambda v: "—" if v is None else e(profile.money(shop, abs(Decimal(v))))
    ltr = lambda v: f'<span class="l">{e(str(v))}</span>'
    show_profit = profit and can_cost

    def bal_text(v) -> str:
        v = Decimal(v or 0)
        word = T["owes" if v > 0 else "weOwe" if v < 0 else "clear"][i]
        return f"{rs(v)} <small>({e(word)})</small>" if v else e(word)

    parts = []
    if "channels" in want and k["channels"]:
        rows = "".join(
            f"<tr><td>{e(METHOD.get(c['method'], (c['method'],) * 2)[i])}</td><td class='n'>{rs(c['in'])}</td><td class='n'>{rs(c['out'])}</td></tr>"
            for c in k["channels"]
        )
        parts.append(
            f"<h2>{e(T['channels'][i])}</h2><table><thead><tr><th>{e(T['method'][i])}</th><th class='n'>{e(T['in'][i])}</th><th class='n'>{e(T['out'][i])}</th></tr></thead><tbody>{rows}</tbody></table>"
        )
    if "models" in want and k["models"]:
        rows = "".join(
            f"<tr><td>{e(m['brand_name'] or '')} {e(m['model_name'] or '')}</td><td class='n'>{m['bought']}</td><td class='n'>{m['in_shop']}</td><td class='n'>{m['sold']}</td><td class='n'>{m['returned']}</td><td class='n'>{m['sold_to']}</td>"
            + (f"<td class='n'>{rs(m['total_cost'])}</td>" if can_cost else "")
            + "</tr>"
            for m in k["models"]
        )
        head = "".join(
            f"<th class='n'>{e(T[x][i])}</th>"
            for x in ("bought", "inShop", "sold", "returned", "soldTo")
        )
        parts.append(
            f"<h2>{e(T['models'][i])}</h2><table><thead><tr><th>{e(T['unit'][i])}</th>{head}"
            + (f"<th class='n'>{e(T['cost'][i])}</th>" if can_cost else "")
            + f"</tr></thead><tbody>{rows}</tbody></table>"
        )
    if "units" in want and k["units"]:
        rows = "".join(
            f"<tr><td><b>{e(u['label'])}</b><br><small>{ltr(u['imei1'] or '')}</small></td><td>{ltr(u['no'])}<br><small>{ltr(u['date'])}</small></td>"
            f"<td>{e(T['s.' + u['state']][i])}</td>"
            + (f"<td class='n'>{rs(u['cost'])}</td>" if can_cost else "")
            + f"<td class='n'>{rs(u['sold_for'])}</td>"
            + (f"<td class='n'>{rs(u['profit'])}</td>" if show_profit else "")
            + "</tr>"
            for u in k["units"]
        )
        parts.append(
            f"<h2>{e(T['units'][i])}</h2><table><thead><tr><th>{e(T['unit'][i])}</th><th>{e(T['bill'][i])}</th><th>{e(T['state'][i])}</th>"
            + (f"<th class='n'>{e(T['cost'][i])}</th>" if can_cost else "")
            + f"<th class='n'>{e(T['soldFor'][i])}</th>"
            + (f"<th class='n'>{e(T['profit'][i])}</th>" if show_profit else "")
            + f"</tr></thead><tbody>{rows}</tbody></table>"
        )
    if "ledger" in want:
        # a deleted entry and its reversal cancel out: neither is printed (the balance is the server's)
        live = [
            r
            for r in st["rows"]
            if not r["reversed"] and not str(r["document_type"]).startswith("reversal:")
        ]
        rows = (
            "".join(
                f"<tr><td>{ltr(r['at'].date() if hasattr(r['at'], 'date') else r['at'])}</td><td><b>{e(DOC.get(r['document_type'], (r['document_type'],) * 2)[i])}</b><br><small>{e(r['memo'] or '')}</small></td>"
                f"<td class='n o'>{rs(r['debit']) if Decimal(r['debit']) else '—'}</td><td class='n g'>{rs(r['credit']) if Decimal(r['credit']) else '—'}</td><td class='n'><b>{bal_text(r['balance'])}</b></td></tr>"
                for r in live
            )
            or f"<tr><td colspan='5'>{e(T['none'][i])}</td></tr>"
        )
        parts.append(
            f"<h2>{e(T['ledger'][i])}</h2><table><thead><tr><th>{e(T['date'][i])}</th><th>{e(T['what'][i])}</th><th class='n'>{e(T['debit'][i])}</th><th class='n'>{e(T['credit'][i])}</th><th class='n'>{e(T['running'][i])}</th></tr></thead><tbody>{rows}</tbody></table>"
        )
    period = (
        f"{ltr(date_from or '…')} → {ltr(date_to or shop_today())}"
        if (date_from or date_to)
        else e(T["all"][i])
    )
    name = party.name_ur if ur and party.name_ur else party.name
    font = (
        '<link href="https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@400;700&display=swap" rel="stylesheet">'
        if ur
        else ""
    )
    side, other = ("right", "left") if ur else ("left", "right")
    old = (
        f"<div><small>{e(T['old'][i])}</small> <b>{bal_text(k['old_balance'])}</b></div>"
        if k["old_balance"] is not None and Decimal(k["old_balance"])
        else ""
    )
    return f"""<!doctype html><html lang="{lang}" dir="{"rtl" if ur else "ltr"}"><head><meta charset="utf-8"><title>{e(name)} — {e(T["title"][i])}</title>
{font}
<style>
@page {{ size: A4; margin: 12mm; }}
* {{ box-sizing: border-box; }}
body {{ width: 186mm; margin: 0 auto; font-family: {"'Noto Nastaliq Urdu', serif" if ur else "Arial, sans-serif"}; font-size: 12px; color: #111; background: #fff; {"line-height: 1.9;" if ur else ""} }}
h2 {{ font-size: 13px; letter-spacing: .05em; text-transform: uppercase; margin: 16px 0 6px; color: #333; }}
.top {{ display: flex; justify-content: space-between; gap: 12px; border-bottom: 2px solid #111; padding-bottom: 8px; margin-top: 8px; }}
.top .r {{ text-align: {other}; }}
.grid {{ display: grid; grid-template-columns: 1.3fr 1fr; gap: 10px; margin-top: 10px; }}
.card {{ border: 1px solid #ccc; border-radius: 6px; padding: 8px 10px; }}
.big {{ font-size: 18px; font-weight: 800; }}
.dark {{ background: #111; color: #fff; }} .dark small {{ color: #ccc; }}
table {{ width: 100%; border-collapse: collapse; }}
th, td {{ border: 1px solid #ccc; padding: 5px 6px; text-align: {side}; vertical-align: top; }}
th {{ background: #f1f1f1; font-size: 11px; }}
td.n, th.n {{ text-align: {other}; white-space: nowrap; }} .o {{ color: #b42318; }} .g {{ color: #067647; }}
.l {{ direction: ltr; unicode-bidi: isolate; display: inline-block; }}
small {{ color: #555; }}
.foot {{ display: flex; justify-content: space-between; margin-top: 18px; font-size: 11px; color: #444; }}
{frame.PRINT_SAFE}
</style></head><body>
{profile.header_html(shop, ur)}
<div class="top"><div><b>{e(T["title"][i])}</b><br><small>{e(T["period"][i])}:</small> {period}</div><div class="r">{e(T["made"][i])}: {ltr(shop_today().isoformat())}</div></div>
<div class="grid">
<div class="card"><div class="big">{e(name)}</div><div><small>{e(T["phone"][i])}</small> {ltr(party.phone or "—")}</div><div><small>{e(T["since"][i])}</small> {ltr(party.created_at.date() if party.created_at else "—")}</div>{old}</div>
<div class="card dark"><small>{e(T["closing"][i])}</small><div class="big">{bal_text(st["closing_balance"])}</div><small>{e(T["opening"][i])}: {bal_text(st["opening_balance"])}</small></div>
</div>
{"".join(parts)}
<div class="foot"><div>{e(shop.name)}</div><div>{e(T["sign"][i])}: ____________________</div></div>
{profile.footer_html(shop, ur)}
</body></html>"""
