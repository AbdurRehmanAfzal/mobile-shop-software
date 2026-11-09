"""The software fee invoice (owner 2026-11-09, ADR-053): what the shop owes the provider for
packages given on credit — each one's period, amount, paid and left — and where to pay. The shop
opens it from More → Software fees; the provider prints or sends the same page. Never shows the
provider's own notes, and never the word "credit": only paid, part paid or unpaid."""

import html

from sqlalchemy.orm import Session

from app.core.clock import today as shop_today
from app.modules.admin import fees
from app.modules.auth.models import Shop
from app.modules.auth.profile import money
from app.modules.plan import billing

T = {
    "en": {
        "title": "Software fee invoice",
        "date": "Date",
        "shop": "Shop",
        "plan": "Plan",
        "until": "Package valid until",
        "monthly": "Monthly fee",
        "no": "Invoice",
        "period": "Period",
        "months": "Months",
        "amount": "Amount",
        "paid": "Paid",
        "left": "Left",
        "status": "Status",
        "total": "Total",
        "promised": "To pay by",
        "st": {"unpaid": "Not paid", "partial": "Part paid", "paid": "Paid"},
        "owe": "Fee still to pay: {x}",
        "clear": "All fees are paid. Thank you!",
        "none": "No fee is due on this account.",
        "pay": "Pay into",
        "after": "After paying, send the transaction ID in More → Software fees → I have paid.",
        "help": "Questions: WhatsApp {x}",
        "print": "Print",
    },
    "ur": {
        "title": "سافٹ ویئر فیس کا بل",
        "date": "تاریخ",
        "shop": "دکان",
        "plan": "پلان",
        "until": "پیکج کب تک",
        "monthly": "ماہانہ فیس",
        "no": "بل نمبر",
        "period": "مدت",
        "months": "مہینے",
        "amount": "رقم",
        "paid": "ادا",
        "left": "باقی",
        "status": "حالت",
        "total": "کل",
        "promised": "ادائیگی کی تاریخ",
        "st": {"unpaid": "ادا نہیں ہوئی", "partial": "کچھ ادا ہوئی", "paid": "ادا ہو گئی"},
        "owe": "ابھی ادا کرنی ہے: {x}",
        "clear": "ساری فیس ادا ہو چکی ہے۔ شکریہ!",
        "none": "اس اکاؤنٹ پر کوئی فیس باقی نہیں۔",
        "pay": "یہاں ادا کریں",
        "after": "ادائیگی کے بعد مزید ← سافٹ ویئر فیس ← میں نے ادا کر دیا میں ٹرانزیکشن آئی ڈی بھیجیں۔",
        "help": "سوال ہو تو واٹس ایپ: {x}",
        "print": "پرنٹ",
    },
}


def _d(v) -> str:
    return v.strftime("%d-%m-%Y") if v else "-"


def fee_invoice_html(db: Session, shop: Shop, *, ur: bool) -> str:
    t = T["ur" if ur else "en"]
    e = html.escape
    org = shop.organisation
    d = fees.dues(db, org.id, for_provider=False)
    m = lambda v: money(shop, v)
    head = [
        (t["date"], _d(shop_today())),
        (t["shop"], shop.name),
        (t["plan"], org.plan),
        (t["until"], _d(org.plan_expires_at)),
    ]
    if org.monthly_fee:
        head.append((t["monthly"], m(org.monthly_fee)))
    info = "".join(f"<tr><th>{e(k)}</th><td class='n'>{e(v)}</td></tr>" for k, v in head)
    rows = ""
    for r in d["rows"]:
        promised = (
            f"<br><small>{e(t['promised'])}: {_d(r['due_on'])}</small>"
            if r["due_on"] and r["status"] != "paid"
            else ""
        )
        rows += (
            f"<tr class='{r['status']}'><td class='n'>{e(r['invoice_no'])}</td>"
            f"<td class='n'>{_d(r['period_from'])} – {_d(r['period_to'])}{promised}</td>"
            f"<td class='n'>{r['months']}</td><td class='n'>{e(m(r['amount']))}</td>"
            f"<td class='n'>{e(m(r['paid']))}</td><td class='n'>{e(m(r['left']))}</td>"
            f"<td><span class='chip'>{e(t['st'][r['status']])}</span></td></tr>"
        )
    table = ""
    if d["rows"]:
        table = (
            f"<table class='list'><thead><tr><th>{e(t['no'])}</th><th>{e(t['period'])}</th>"
            f"<th>{e(t['months'])}</th><th>{e(t['amount'])}</th><th>{e(t['paid'])}</th>"
            f"<th>{e(t['left'])}</th><th>{e(t['status'])}</th></tr></thead><tbody>{rows}</tbody>"
            f"<tfoot><tr><th colspan='3'>{e(t['total'])}</th><td class='n'>{e(m(d['total']))}</td>"
            f"<td class='n'>{e(m(d['paid']))}</td><td class='n'>{e(m(d['left']))}</td><td></td></tr></tfoot></table>"
        )
    if d["left"] > 0:
        banner = f"<p class='owe'>{e(t['owe'].format(x=m(d['left'])))}</p>"
    elif d["rows"]:
        banner = f"<p class='ok'>{e(t['clear'])}</p>"
    else:
        banner = f"<p class='ok'>{e(t['none'])}</p>"
    pay = ""
    if d["left"] > 0:
        b = billing.for_shopkeeper(db)
        lines = []
        if b["bank"]:
            bk = b["bank"]
            lines.append(
                " · ".join(
                    x
                    for x in (
                        bk.get("bank_name"),
                        bk.get("account_title"),
                        bk.get("account_number"),
                        bk.get("iban"),
                    )
                    if x
                )
            )
        for w in b["wallets"]:
            lines.append(
                " · ".join(x for x in (w.get("label"), w.get("account_name"), w.get("number")) if x)
            )
        if lines:
            pay = (
                f"<h2>{e(t['pay'])}</h2><ul>"
                + "".join(f"<li class='n'>{e(x)}</li>" for x in lines)
                + f"</ul><p class='muted'>{e(t['after'])}</p>"
            )
        wa = (b.get("support") or {}).get("whatsapp")
        if wa:
            pay += f"<p class='muted'>{e(t['help'].format(x=wa))}</p>"
    al = "right" if ur else "left"
    font = "'Noto Nastaliq Urdu',serif" if ur else "system-ui,sans-serif"
    return f"""<!doctype html><html lang="{"ur" if ur else "en"}" dir="{"rtl" if ur else "ltr"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{e(t["title"])} · {e(shop.name)}</title>
<style>body{{font-family:{font};max-width:760px;margin:28px auto;padding:0 18px;color:#0f172a}}h1{{font-size:22px;margin:0 0 12px}}h2{{font-size:16px;margin:20px 0 6px}}table{{width:100%;border-collapse:collapse}}th,td{{text-align:{al};padding:7px 6px;border-bottom:1px solid #e2e8f0;vertical-align:top}}.info th{{font-weight:600;color:#475569;width:40%}}.list thead th{{background:#0f172a;color:#fff;font-weight:600;font-size:13px}}.list tfoot th,.list tfoot td{{font-weight:800;border-top:2px solid #0f172a}}.n{{font-family:system-ui,sans-serif;direction:ltr;unicode-bidi:isolate}}small{{color:#64748b}}.chip{{display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:700;background:#fee2e2;color:#991b1b}}.partial .chip{{background:#fef3c7;color:#92400e}}.paid .chip{{background:#dcfce7;color:#166534}}.owe{{margin:16px 0;padding:12px 14px;border-radius:12px;background:#fee2e2;color:#991b1b;font-weight:800;font-size:18px}}.ok{{margin:16px 0;padding:12px 14px;border-radius:12px;background:#ecfdf5;color:#065f46;font-weight:700}}.muted{{color:#64748b;font-size:13px}}ul{{margin:0;padding-inline-start:18px}}@media print{{button{{display:none}}}}</style></head>
<body><h1>{e(t["title"])} · Mobile Shop</h1><table class="info">{info}</table>{banner}{table}{pay}<button onclick="print()">{e(t["print"])}</button></body></html>"""
