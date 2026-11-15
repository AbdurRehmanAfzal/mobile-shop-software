"""Business overview as a detailed A4 report (owner 2026-11-15, ADR-084): every figure of the
overview for the chosen period, with the full lists (everyone who paid or was paid, everyone who owes
or is owed, all models sold and bought, recent activity), on A4 for print / PDF, or as Excel."""

import datetime as dt

from sqlalchemy.orm import Session

from app.db.refs import user_name
from app.modules.auth.models import Shop
from app.modules.exports import a4
from app.modules.reports.overview import overview

W = {
    "title": ("Business overview", "کاروبار کا خلاصہ"),
    "sales": ("Sales", "فروخت"),
    "bills": ("Sale bills", "فروخت کے بل"),
    "phones_sold": ("Phones sold", "بکے موبائل"),
    "paid": ("Paid", "ادا ہوا"),
    "udhaar": ("On udhaar", "ادھار"),
    "profit": ("Profit", "منافع"),
    "purchases": ("Purchases", "خریداری"),
    "phones_bought": ("Phones bought", "خریدے موبائل"),
    "expenses": ("Expenses", "اخراجات"),
    "received": ("Money received", "وصول رقم"),
    "paid_out": ("Money paid out", "ادا رقم"),
    "udhaar_given": ("Udhaar given", "ادھار دیا"),
    "udhaar_collected": ("Udhaar collected", "ادھار وصول"),
    "to_get": ("To get (lena)", "لینا ہے"),
    "to_give": ("To give (dena)", "دینا ہے"),
    "trade": ("Sales and purchases", "فروخت اور خریداری"),
    "kind": ("", ""),
    "count": ("Bills", "بل"),
    "number": ("Count", "تعداد"),
    "phones": ("Phones", "موبائل"),
    "total": ("Total", "کل"),
    "returns_s": ("Sale returns", "فروخت کی واپسی"),
    "returns_p": ("Purchase returns", "خریداری کی واپسی"),
    "month": ("This month", "اس مہینے"),
    "item": ("", ""),
    "amount": ("Amount", "رقم"),
    "from": ("Money received from", "کس سے وصول ہوا"),
    "to": ("Money paid to", "کس کو ادا کیا"),
    "name": ("Name", "نام"),
    "phone": ("Phone", "فون"),
    "payments": ("Payments", "ادائیگیاں"),
    "get_list": ("Who owes the shop", "جنہوں نے دکان کو دینا ہے"),
    "give_list": ("Whom the shop owes", "جن کو دکان نے دینا ہے"),
    "top_sold": ("Models sold", "بکنے والے ماڈل"),
    "top_bought": ("Models bought", "خریدے گئے ماڈل"),
    "model": ("Model", "ماڈل"),
    "qty": ("Qty", "تعداد"),
    "alerts": ("Stock now", "اسٹاک ابھی"),
    "people": ("Customers and dealers", "گاہک اور ڈیلر"),
    "all": ("All", "کل"),
    "new": ("New in the period", "اس عرصے میں نئے"),
    "customers": ("Customers", "گاہک"),
    "dealers": ("Dealers", "ڈیلر"),
    "modules": ("Totals by module (all time)", "ہر حصے کی کل تعداد"),
    "recent": ("Recent activity", "حالیہ کام"),
    "when": ("When", "کب"),
    "who": ("Who", "کس نے"),
    "what": ("What", "کیا"),
    "action": ("Action", "کام"),
    "ref": ("No.", "نمبر"),
    "walk_in": ("Walk-in customers", "واک اِن گاہک"),
    "on_hand": ("Phones on hand", "موجود موبائل"),
    "available": ("For sale", "بکنے کو"),
    "faulty": ("Faulty", "خراب"),
    "inspection": ("ID check pending", "شناخت باقی"),
    "in_repair": ("In repair", "مرمت میں"),
    "old_60d": ("Older than 60 days", "60 دن سے پرانے"),
    "reserved": ("Reserved", "ریزرو"),
    "items_low": ("Items running low", "کم ہوتے آئٹمز"),
    "items_out": ("Items finished", "ختم آئٹمز"),
    "sales_m": ("Sales", "فروخت"),
    "transfers": ("Transfers", "منتقلی"),
    "returns": ("Returns", "واپسی"),
    "days": ("days", "دن"),
}


def _period(d_from: dt.date, d_to: dt.date, ur: bool) -> str:
    f = lambda d: d.strftime("%d-%m-%Y")
    if d_from == d_to:
        return f(d_from)
    n = (d_to - d_from).days + 1
    return f"{f(d_from)} → {f(d_to)} ({n} {W['days'][1 if ur else 0]})"


def build(db: Session, ctx, d_from: dt.date, d_to: dt.date, show_cost: bool, ur: bool):
    w = lambda k: W[k][1 if ur else 0]
    o = overview(db, ctx.shop_id, d_from, d_to, show_cost, full=True)
    s, pu, r = o["sales"], o["purchases"], o["returns"]
    stats: list[tuple[str, object]] = [
        (w("sales"), s["total"]),
        (w("bills"), s["count"]),
        (w("phones_sold"), s["phones"]),
    ]
    if show_cost:
        stats.append((w("profit"), s["profit"]))
    stats += [
        (w("purchases"), pu["total"]),
        (w("phones_bought"), pu["phones"]),
        (w("expenses"), o["expenses"]),
        (w("received"), o["payments"]["in"]["total"]),
        (w("paid_out"), o["payments"]["out"]["total"]),
        (w("udhaar_given"), o["udhaar_given"]),
        (w("udhaar_collected"), o["udhaar_collected"]),
        (w("to_get"), o["dues"]["to_get"]),
        (w("to_give"), o["dues"]["to_give"]),
    ]
    name = lambda x: x["name"] or w("walk_in")
    sections = [
        {
            "title": w("trade"),
            "header": [w("kind"), w("count"), w("phones"), w("total"), w("paid"), w("udhaar")],
            "rows": [
                [w("sales"), s["count"], s["phones"], s["total"], s["paid"], s["credit"]],
                [w("purchases"), pu["count"], pu["phones"], pu["total"], pu["paid"], pu["credit"]],
                [w("returns_s"), r["sale"]["count"], None, r["sale"]["amount"], None, None],
                [w("returns_p"), r["purchase"]["count"], None, r["purchase"]["amount"], None, None],
            ],
        },
        {
            "title": f"{w('month')} ({o['month']['from'].strftime('%d-%m-%Y')} →)",
            "header": [w("item"), w("amount")],
            "rows": [[w("sales_m"), o["month"]["sales"]], [w("expenses"), o["month"]["expenses"]]]
            + ([[w("profit"), o["month"]["profit"]]] if show_cost else []),
        },
    ]
    for key, d in (("from", "in"), ("to", "out")):
        rows = [[name(x), x["count"], x["amount"]] for x in o["payments"][d]["people"]]
        sections.append(
            {
                "title": w(key),
                "count": len(rows),
                "header": [w("name"), w("payments"), w("amount")],
                "rows": rows,
            }
        )
    for key, lst in (("get_list", "to_get_list"), ("give_list", "to_give_list")):
        rows = [[x["name"], x.get("phone"), x["amount"]] for x in o["dues"][lst]]
        sections.append(
            {
                "title": w(key),
                "count": len(rows),
                "header": [w("name"), w("phone"), w("amount")],
                "rows": rows,
            }
        )
    sections.append(
        {
            "title": w("top_sold"),
            "count": len(o["top_sold"]),
            "header": [w("model"), w("qty"), w("amount")] + ([w("profit")] if show_cost else []),
            "rows": [
                [x["name"], x["qty"], x["amount"]] + ([x["profit"]] if show_cost else [])
                for x in o["top_sold"]
            ],
        }
    )
    sections.append(
        {
            "title": w("top_bought"),
            "count": len(pu["top"]),
            "header": [w("model"), w("qty"), w("amount")],
            "rows": [[x["name"], x["qty"], x["amount"]] for x in pu["top"]],
        }
    )
    al = o["alerts"]
    sections.append(
        {
            "title": w("alerts"),
            "header": [w("item"), w("number")],
            "rows": [
                [w(k), al[k]]
                for k in (
                    "on_hand",
                    "available",
                    "faulty",
                    "inspection",
                    "in_repair",
                    "old_60d",
                    "reserved",
                    "items_low",
                    "items_out",
                )
            ],
        }
    )
    pe = o["people"]
    sections.append(
        {
            "title": w("people"),
            "header": [w("item"), w("all"), w("new")],
            "rows": [
                [w("customers"), pe["customers"], pe["new_customers"]],
                [w("dealers"), pe["dealers"], pe["new_dealers"]],
            ],
        }
    )
    c = o["counts"]
    sections.append(
        {
            "title": w("modules"),
            "header": [w("item"), w("number")],
            "rows": [
                [w("sales"), c["sales"]],
                [w("purchases"), c["purchases"]],
                [w("returns"), c["returns"]],
                [w("transfers"), c["transfers"]],
                [w("payments"), c["payments"]],
                [w("customers"), pe["customers"]],
                [w("dealers"), pe["dealers"]],
            ],
        }
    )
    sections.append(
        {
            "title": w("recent"),
            "count": len(o["recent"]),
            "header": [w("when"), w("who"), w("what"), w("action"), w("ref")],
            "rows": [
                [
                    x["at"],
                    x["who"],
                    str(x["entity"]).replace("_", " "),
                    str(x["action"]).replace("_", " "),
                    x["ref"],
                ]
                for x in o["recent"]
            ],
        }
    )
    return w("title"), _period(d_from, d_to, ur), stats, sections


def render(db: Session, ctx, d_from: dt.date, d_to: dt.date, show_cost: bool, fmt: str, ur: bool):
    title, period, stats, sections = build(db, ctx, d_from, d_to, show_cost, ur)
    if fmt == "xlsx":
        return a4.workbook(
            f"business-overview-{d_from.isoformat()}-{d_to.isoformat()}",
            title,
            period,
            stats,
            sections,
        )
    return a4.page(
        shop=db.get(Shop, ctx.shop_id),
        title=title,
        period=period,
        who=user_name(db, ctx.id),
        stats=stats,
        sections=sections,
        ur=ur,
    )
