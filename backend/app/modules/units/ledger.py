"""One unit's own ledger (owner 2026-11-25, mock-up 20 "Item Ledger Sheet"): every rupee that went out
on this phone (its purchase or what it came in at, a refund when a customer returned it) and every
rupee that came in on it (its sale, the cost back when it went back to the seller), in order, with
the net after each line — and the payments on its bills beside them, which move cash but not the
net. Printable as an A4 sheet and downloadable as CSV.

Read-only and derived: it is drawn from `device_money`'s timeline (purchase and invoice lines,
payments, return documents, the device's events), so it always agrees with the phone's money page.
Only for those who may see cost (every line is a cost or a margin)."""

import csv
import datetime as dt
import html
import io
import uuid
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.clock import today as shop_today
from app.db.base import ZERO
from app.modules.auth import profile
from app.modules.auth.models import Shop
from app.modules.ledger.service import money

UTC = dt.UTC


def _kept_share(r: dict) -> Decimal:
    """this unit's part of what the shop kept on a return (in proportion to its line)"""
    amount, line, kept = (
        money(r.get("amount") or 0),
        money(r.get("line_amount") or 0),
        money(r.get("kept") or 0),
    )
    if amount <= ZERO or line >= amount:
        return kept
    return money(kept * line / amount)


def item_ledger(
    timeline: list[dict], summary: dict, device, costs: list[dict] | None = None
) -> dict:
    rows: list[dict] = []
    net = out_t = in_t = paid = received = ZERO

    def add(r: dict, kind: str, out=None, inn=None, cash=None, note=None) -> None:
        nonlocal net, out_t, in_t, paid, received
        if out is not None:
            out_t += out
            net -= out
        if inn is not None:
            in_t += inn
            net += inn
        if cash is not None:
            if kind == "payment_out":
                paid += cash
            else:
                received += cash
        rows.append(
            {
                "kind": kind,
                "at": r.get("at"),
                "date": r.get("date"),
                "no": r.get("no"),
                "doc_no": r.get("doc_no"),
                "party_name": r.get("party_name"),
                "method": r.get("method"),
                "note": note,
                "upfront": r.get("upfront"),
                "out": money(out) if out is not None else None,
                "in": money(inn) if inn is not None else None,
                "cash": money(cash) if cash is not None else None,
                "net_after": money(net),
            }
        )

    has_purchase = any(r["kind"] == "purchase" for r in timeline)
    if (
        not has_purchase
        and summary.get("source") == "opening_stock"
        and summary.get("cost") is not None
    ):
        at = (
            device.first_seen_at
            if device.first_seen_at.tzinfo
            else device.first_seen_at.replace(tzinfo=UTC)
        )
        add({"at": at, "date": at.date()}, "opening", out=money(summary["cost"]))

    # the costs added after the purchase (expenses, repairs) take their place in time
    extra = [
        {
            "kind": "added_cost",
            "at": c["at"],
            "date": c["at"].date(),
            "amount": c["amount"],
            "source": c["source"],
            "note": c.get("note"),
        }
        for c in (costs or [])
        if not c["undone"]
    ]
    timeline = sorted(
        [*timeline, *extra],
        key=lambda r: r["at"] if r["at"].tzinfo else r["at"].replace(tzinfo=UTC),
    )
    for r in timeline:
        k = r["kind"]
        if k == "purchase" and r.get("amount") is not None:
            add(r, k, out=money(r["amount"]))
        elif k == "added_cost":
            add(r, k, out=money(r["amount"]), note=r.get("note"))
        elif k == "sale" and r.get("amount") is not None:
            add(r, k, inn=money(r["amount"]))
        elif k in ("payment_out", "payment_in") and r.get("amount") is not None:
            add(r, k, cash=money(r["amount"]))
        elif k == "return_sale" and r.get("status", "posted") == "posted":
            # the sale is undone; what the shop kept of it stays as income (ADR-101)
            add(r, k, out=money(r["line_amount"]) - _kept_share(r), note=r.get("reason"))
        elif k == "return_purchase" and r.get("status", "posted") == "posted":
            add(r, k, inn=money(r["line_amount"]) - _kept_share(r), note=r.get("reason"))
        elif k == "event" and r.get("event") == "transferred_in" and r.get("amount") is not None:
            add(r, "transferred_in", out=money(r["amount"]))
        elif k == "event" and r.get("event") == "transferred_out" and r.get("amount") is not None:
            add(r, "transferred_out", inn=money(r["amount"]))
        elif (
            k == "event"
            and r.get("event") == "corrected"
            and (r.get("data") or {}).get("field") == "cost"
        ):
            data = r.get("data") or {}
            # the purchase line above already carries the corrected price; this line only says so
            add(r, "cost_corrected", note=f"{data.get('from', '')} → {data.get('to', '')}")

    sold = summary.get("status") == "sold" and summary.get("margin") is not None
    asking = summary.get("asking_price")
    # the unit's whole cost: the purchase price and what was added to it since
    net_cost = (
        summary.get("net_cost") if summary.get("net_cost") is not None else summary.get("cost")
    )
    return {
        "rows": rows,
        "out": money(out_t),
        "in": money(in_t),
        "net": money(net),
        "paid": money(paid),
        "received": money(received),
        "cost": summary.get("cost"),
        "added": summary.get("added"),
        "net_cost": net_cost,
        "sold_for": summary.get("sold_for"),
        # a sold unit's real profit is its margin; one still here shows what the asking price would make
        "profit": (
            summary["true_margin"]
            if summary.get("true_margin") is not None
            else summary.get("margin")
        )
        if sold
        else None,
        "expected": money(Decimal(asking) - Decimal(net_cost))
        if not sold and asking is not None and net_cost is not None
        else None,
    }


T = {
    "title": ("Item ledger", "آئٹم کا لیجر"),
    "identity": ("Device", "سیٹ"),
    "source": ("Bought from", "خریدا"),
    "voucher": ("Purchase bill", "خریداری کا بل"),
    "status": ("Status now", "اب حالت"),
    "cost": ("Buying price", "خرید قیمت"),
    "sold": ("Sold for", "بکا"),
    "asking": ("Asking price", "مانگی گئی قیمت"),
    "net": ("Net on this unit", "اس سیٹ پر خالص"),
    "added": ("Added since (expenses, repairs)", "بعد میں خرچ (اخراجات، مرمت)"),
    "netCost": ("True net cost", "اصل کل لاگت"),
    "profit": ("Profit", "منافع"),
    "expected": ("Expected profit", "متوقع منافع"),
    "table": ("Every entry on this unit", "اس سیٹ کی ہر لائن"),
    "date": ("Date", "تاریخ"),
    "ref": ("Voucher", "واؤچر"),
    "what": ("What happened", "کیا ہوا"),
    "out": ("Out (−)", "گیا (−)"),
    "in": ("In (+)", "آیا (+)"),
    "running": ("Net after", "بعد میں خالص"),
    "cashNote": (
        "Payments move cash on the bill, not the net of the unit.",
        "ادائیگیاں بل کی رقم بدلتی ہیں، سیٹ کا خالص نہیں۔",
    ),
    "made": ("Made on", "بنایا"),
    "paidNow": ("Paid at purchase", "خریدتے وقت دیے"),
    "gotNow": ("Received at sale", "بیچتے وقت ملے"),
    "sign": ("Signature", "دستخط"),
    "none": ("No entries yet.", "ابھی کوئی لائن نہیں۔"),
    "s.in_stock": ("In stock", "اسٹاک میں"),
    "s.sold": ("Sold", "بک گیا"),
    "s.on_loan": ("On amanat", "امانت پر"),
    "s.in_repair": ("In repair", "مرمت میں"),
    "s.faulty": ("Faulty", "خراب"),
    "s.with_customer_for_approval": ("With customer", "گاہک کے پاس"),
    "s.returned_to_supplier": ("Returned to supplier", "سپلائر کو واپس"),
    "s.transferred": ("Sent to a branch", "برانچ کو بھیجا"),
    "s.used_for_parts": ("Used for parts", "پرزوں میں"),
    "m.cash": ("Cash", "نقد"),
    "m.bank": ("Bank", "بینک"),
    "m.easypaisa": ("Easypaisa", "ایزی پیسہ"),
    "m.jazzcash": ("JazzCash", "جاز کیش"),
    "m.card": ("Card", "کارڈ"),
    "m.online": ("Online", "آن لائن"),
    "m.cheque": ("Cheque", "چیک"),
    "m.remittance": ("From abroad", "بیرون ملک سے"),
    "m.other": ("Other", "دیگر"),
    "k.opening": ("Entered as old stock", "پرانے اسٹاک میں درج"),
    "k.purchase": ("Bought", "خریدا"),
    "k.sale": ("Sold", "بیچا"),
    "k.payment_out": ("Paid to seller", "بیچنے والے کو دیے"),
    "k.payment_in": ("Received from customer", "گاہک سے ملے"),
    "k.return_sale": ("Customer returned it", "گاہک نے واپس کیا"),
    "k.return_purchase": ("Returned to the seller", "بیچنے والے کو واپس"),
    "k.transferred_in": ("Came from a branch", "برانچ سے آیا"),
    "k.transferred_out": ("Sent to a branch", "برانچ کو بھیجا"),
    "k.added_cost": ("Spent on the unit", "سیٹ پر خرچ"),
    "k.cost_corrected": ("Purchase price corrected", "خرید قیمت درست کی"),
}
CSV_HEAD = ["date", "voucher", "what", "party", "method", "out", "in", "cash", "net_after"]


def _name(dev: dict) -> str:
    return " ".join(
        x for x in (dev.get("brand_name"), dev.get("model_name"), dev.get("storage_name")) if x
    )


def sheet_html(
    db: Session, shop_id: uuid.UUID, device_id: uuid.UUID, lang: str | None = None
) -> str:
    from app.modules.units.service import device_money

    shop = db.get(Shop, shop_id)
    lang = lang if lang in ("en", "ur") else (shop.default_locale or "ur")
    ur = lang == "ur"
    i = 1 if ur else 0
    e = html.escape
    m = device_money(db, shop_id, device_id, can_cost=True)
    led, dev = m["ledger"], m["device"]
    rs = lambda v: "—" if v is None else e(profile.money(shop, v))
    signed = lambda v: (
        "—"
        if v is None
        else ("−" if Decimal(v) < 0 else "+") + e(profile.money(shop, abs(Decimal(v))))
    )
    ltr = lambda v: f'<span class="l">{e(str(v))}</span>'
    rows = []
    for r in led["rows"]:
        what = T.get(f"k.{r['kind']}", (r["kind"], r["kind"]))[i]
        method = (
            T.get(f"m.{r.get('method')}", (r.get("method"),) * 2)[i] if r.get("method") else None
        )
        sub = " · ".join(str(x) for x in (r.get("party_name"), method, r.get("note")) if x)
        if r.get("upfront") and Decimal(r["upfront"]) > 0:
            label = T["paidNow" if r["kind"] == "purchase" else "gotNow"][i]
            sub = (sub + " · " if sub else "") + f"{label}: {profile.money(shop, r['upfront'])}"
        if r.get("cash") is not None:
            sub = (sub + " · " if sub else "") + profile.money(shop, r["cash"])
        rows.append(
            f"<tr><td>{ltr(r['date'])}</td><td>{ltr(r.get('no') or r.get('doc_no') or '')}</td>"
            f"<td><b>{e(what)}</b><br><small>{e(sub)}</small></td>"
            f'<td class="n o">{rs(r["out"]) if r["out"] is not None else "—"}</td>'
            f'<td class="n g">{rs(r["in"]) if r["in"] is not None else "—"}</td>'
            f'<td class="n"><b>{signed(r["net_after"])}</b></td></tr>'
        )
    body = "".join(rows) or f'<tr><td colspan="6">{e(T["none"][i])}</td></tr>'
    purchase = m.get("purchase") or {}
    sold = led["profit"] is not None
    ids = " | ".join(x for x in (dev.get("imei1"), dev.get("imei2"), dev.get("serial")) if x)
    status_key = T.get(
        f"s.{dev.get('status')}", (dev.get("status") or "", dev.get("status") or "")
    )[i]
    font = (
        '<link href="https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@400;700&display=swap" rel="stylesheet">'
        if ur
        else ""
    )
    side = "right" if ur else "left"
    other = "left" if ur else "right"
    box = lambda k, v, cls="": (
        f'<div class="box {cls}"><small>{e(T[k][i])}</small><div>{v}</div></div>'
    )
    return f"""<!doctype html><html lang="{lang}" dir="{"rtl" if ur else "ltr"}"><head><meta charset="utf-8"><title>{e(_name(dev))} — {e(T["title"][i])}</title>
{font}
<style>
@page {{ size: A4; margin: 12mm; }}
* {{ box-sizing: border-box; }}
body {{ width: 186mm; margin: 0 auto; font-family: {"'Noto Nastaliq Urdu', serif" if ur else "Arial, sans-serif"}; font-size: 12px; color: #111; background: #fff; {"line-height: 1.9;" if ur else ""} }}
h2 {{ font-size: 13px; letter-spacing: .06em; text-transform: uppercase; margin: 14px 0 6px; color: #333; }}
.top {{ display: flex; justify-content: space-between; gap: 12px; border-bottom: 2px solid #111; padding-bottom: 8px; margin-top: 8px; }}
.top .r {{ text-align: {other}; }}
.grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }}
.card {{ border: 1px solid #ccc; border-radius: 6px; padding: 8px 10px; }}
.card .big {{ font-size: 16px; font-weight: 800; }}
.boxes {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 10px; }}
.box {{ border: 1px solid #ccc; border-radius: 6px; padding: 8px; }} .box div {{ font-size: 15px; font-weight: 800; margin-top: 2px; }}
.box.dark {{ background: #111; color: #fff; }} .box.dark small {{ color: #ccc; }}
table {{ width: 100%; border-collapse: collapse; }}
th, td {{ border: 1px solid #ccc; padding: 5px 6px; text-align: {side}; vertical-align: top; }}
th {{ background: #f1f1f1; font-size: 11px; }}
td.n, th.n {{ text-align: {other}; white-space: nowrap; }} .o {{ color: #b42318; }} .g {{ color: #067647; }}
.l {{ direction: ltr; unicode-bidi: isolate; display: inline-block; }}
small {{ color: #555; }}
.foot {{ display: flex; justify-content: space-between; margin-top: 18px; font-size: 11px; color: #444; }}
</style></head><body>
{profile.header_html(shop, ur)}
<div class="top"><div><b>{e(T["title"][i])}</b></div><div class="r">{e(T["made"][i])}: {ltr(shop_today().isoformat())}<br>{ltr(dev.get("barcode") or "")}</div></div>
<div class="grid">
<div class="card"><small>{e(T["identity"][i])}</small><div class="big">{e(_name(dev))}</div><div>{ltr(ids)}</div></div>
<div class="card"><small>{e(T["source"][i])}</small> <b>{e(purchase.get("party_name") or "—")}</b><br><small>{e(T["voucher"][i])}</small> {ltr(purchase.get("no") or "—")}<br><small>{e(T["status"][i])}</small> <b>{e(status_key)}</b></div>
</div>
<div class="boxes">
{box("cost", rs(led["cost"]))}
{box("added", rs(led["added"]))}
{box("netCost", rs(led["net_cost"]), "dark")}
{box("profit" if sold else "expected", signed(led["profit"] if sold else led["expected"]))}
</div>
<h2>{e(T["table"][i])}</h2>
<table><thead><tr><th>{e(T["date"][i])}</th><th>{e(T["ref"][i])}</th><th>{e(T["what"][i])}</th><th class="n">{e(T["out"][i])}</th><th class="n">{e(T["in"][i])}</th><th class="n">{e(T["running"][i])}</th></tr></thead>
<tbody>{body}</tbody></table>
<p><small>{e(T["cashNote"][i])}</small></p>
<div class="foot"><div>{e(shop.name)}</div><div>{e(T["sign"][i])}: ____________________</div></div>
{profile.footer_html(shop, ur)}
</body></html>"""


def sheet_csv(db: Session, shop_id: uuid.UUID, device_id: uuid.UUID) -> str:
    from app.modules.units.service import device_money

    led = device_money(db, shop_id, device_id, can_cost=True)["ledger"]
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(CSV_HEAD)
    for r in led["rows"]:
        w.writerow(
            [
                r["date"].isoformat() if r.get("date") else "",
                r.get("no") or r.get("doc_no") or "",
                T.get(f"k.{r['kind']}", (r["kind"],))[0],
                r.get("party_name") or "",
                r.get("method") or "",
                r["out"] if r["out"] is not None else "",
                r["in"] if r["in"] is not None else "",
                r["cash"] if r["cash"] is not None else "",
                r["net_after"],
            ]
        )
    return "﻿" + buf.getvalue()
