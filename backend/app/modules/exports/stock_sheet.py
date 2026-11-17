"""Stock list on A4 (owner 2026-11-15, ADR-078): the stock page's Download / Share as a page that
fits A4 portrait whatever fields are picked — the shop's header, the figures, counts by brand and by
model, then every phone, brand by brand and model by model, one row a phone: its numbers (IMEI /
IMEI 2 / serial), every other picked field wrapped as "label value", and the price.

Three copies, the same layout:
- `screen`: what the page shows (its filters, fields and order; cost only with VIEW_COST);
- `staff`: every phone field with the asking price and who it was bought from (the name only) —
  no cost — to share with the staff;
- `customer`: what a customer asks about (model, storage, RAM, colour, condition, PTA, battery, …)
  and the price — no IMEI, serial, barcode, cost, seller, days or status; phones for sale only.
Read-only."""

import datetime as dt
import html
from collections import defaultdict
from decimal import Decimal

from fastapi.responses import Response

from app.core.clock import today as shop_today
from app.db.base import ZERO
from app.db.refs import user_name
from app.modules.exports.tally import COND, PTA, STATUS

STAFF_KEYS = [
    "name", "storage", "ram", "colour", "condition", "grade", "pta", "simlock", "sim_time",
    "battery", "cycles", "region", "sim", "imei", "imei2", "serial", "barcode", "days", "status",
    "verification", "source", "asking",
]  # fmt: skip
CUSTOMER_KEYS = [
    "name", "storage", "ram", "colour", "condition", "grade", "pta", "simlock", "sim_time",
    "battery", "region", "sim", "asking",
]  # fmt: skip
IDS = ("imei", "imei2", "serial")
PRICE = ("asking", "cost")

W = {
    "screen": ("Stock list", "اسٹاک کی فہرست"),
    "staff": ("Stock list with prices (staff)", "اسٹاک کی فہرست قیمت کے ساتھ (عملہ)"),
    "customer": ("Phones for sale", "فروخت کے لیے موبائل"),
    "printed": ("Printed", "چھپی"),
    "by": ("by", "از"),
    "phones": ("Phones", "موبائل"),
    "asking_total": ("At asking price", "قیمتِ فروخت پر"),
    "cost_total": ("At cost", "قیمتِ خرید پر"),
    "brands": ("Brands", "برانڈ"),
    "models": ("Models", "ماڈل"),
    "by_brand": ("By brand", "برانڈ کے حساب سے"),
    "by_model": ("By model", "ماڈل کے حساب سے"),
    "brand": ("Brand", "برانڈ"),
    "model": ("Model", "ماڈل"),
    "ids": ("IMEI / Serial", "IMEI / سیریل"),
    "details": ("Details", "تفصیل"),
    "price": ("Price", "قیمت"),
    "none": ("No phones.", "کوئی موبائل نہیں۔"),
}


def _w(k: str, ur: bool) -> str:
    return W[k][1 if ur else 0]


def _n(v) -> str:
    return "" if v is None or v == "" else f"{Decimal(v):,.0f}"


def _value(key: str, d: dict, get, ur: bool, cp: str = "CP ID", phone: bool = False):
    v = get(d)
    if v is None or v == "":
        return None
    if key == "condition":
        from app.modules.devices.types import lock_text

        base = COND.get(d["condition"], d["condition"])
        return " · ".join(x for x in (base, lock_text(d.get("lock_type"), ur)) if x)
    if key == "pta":
        return cp if v == "cpid" else PTA.get(v, v) or None
    if key == "status":
        return STATUS.get(v, (v, v))[1 if ur else 0]
    if key == "battery":
        return f"{v}%"
    if key == "ram":
        return f"{v} GB"
    if key == "days":
        return f"{v}d"
    if key == "verification":
        return None if v == "not_required" else str(v).replace("_", " ")
    if key == "source" and phone and d.get("source_party_phone"):
        return f"{v} · {d['source_party_phone']}"  # ADR-093: the owner's own list
    return v


def page(
    ctx, db, copy: str, keys: list[str], found: list[dict], cols: dict, ur_headers: dict, ur: bool
) -> Response:
    from app.modules.auth.models import Shop
    from app.modules.devices.types import cpid_label

    shop = db.get(Shop, ctx.shop_id)
    cp = cpid_label(shop)
    e = html.escape
    label = lambda k: ur_headers.get(cols[k][0], cols[k][0]) if ur else cols[k][0]
    title = _w(copy, ur)
    show_ids = [k for k in IDS if k in keys]
    detail = [k for k in keys if k not in IDS and k not in PRICE and k != "name"]
    ask, cost = "asking" in keys, "cost" in keys
    # the seller's phone: only on the owner's / manager's own list, never the staff or customer one
    from app.core.permissions import Cap

    with_phone = copy == "screen" and ctx.can(Cap.VIEW_COST)

    brands: dict[str, dict] = {}
    models: dict[tuple[str, str], dict] = {}
    for d in found:
        for x in (
            brands.setdefault(d["brand_name"], {"count": 0, "asking": ZERO}),
            models.setdefault((d["brand_name"], d["model_name"]), {"count": 0, "asking": ZERO}),
        ):
            x["count"] += 1
            x["asking"] += d["asking_price"] or ZERO
    stats = [(_w("phones", ur), str(len(found))), (_w("brands", ur), str(len(brands)))]
    stats.append((_w("models", ur), str(len(models))))
    if ask:
        total = sum((d["asking_price"] or ZERO for d in found), ZERO)
        stats.append((_w("asking_total", ur), _n(total)))
    if cost:
        total = sum((d["cost_price"] or ZERO for d in found), ZERO)
        stats.append((_w("cost_total", ur), _n(total)))
    stat_html = "".join(
        f'<div class="st"><span>{e(k)}</span><b class="n">{v}</b></div>' for k, v in stats
    )
    ask_th = f'<th class="n">{e(label("asking"))}</th>' if ask else ""
    brand_rows = "".join(
        f"<tr><td>{e(b or '')}</td><td class='n'>{v['count']}</td>"
        + (f"<td class='n'>{_n(v['asking'])}</td>" if ask else "")
        + "</tr>"
        for b, v in sorted(brands.items(), key=lambda x: (-x[1]["count"], x[0] or ""))
    )
    model_rows = "".join(
        f"<tr><td>{e(b or '')} {e(m or '')}</td><td class='n'>{v['count']}</td>"
        + (f"<td class='n'>{_n(v['asking'])}</td>" if ask else "")
        + "</tr>"
        for (b, m), v in sorted(models.items(), key=lambda x: (x[0][0] or "", x[0][1] or ""))
    )

    head = (
        "<thead><tr><th class='n'>#</th>"
        + (f"<th>{e(_w('ids', ur))}</th>" if show_ids else "")
        + (f"<th>{e(_w('details', ur))}</th>" if detail else "")
        + (f"<th class='n'>{e(_w('price', ur))}</th>" if ask or cost else "")
        + "</tr></thead>"
    )
    groups: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for d in found:  # keeps the page's order inside each model
        groups[(d["brand_name"], d["model_name"])].append(d)
    blocks, last, k = [], None, 0
    for (b, m), ds in sorted(groups.items(), key=lambda x: (x[0][0] or "", x[0][1] or "")):
        if b != last:
            blocks.append(
                f'<h3 class="brand">{e(b or "")} <span>· {brands[b]["count"]}</span></h3>'
            )
            last = b
        trs = []
        for d in ds:
            k += 1
            ids = "<br>".join(e(str(cols[x][1](d))) for x in show_ids if cols[x][1](d))
            bits = []
            for key in detail:
                v = _value(key, d, cols[key][1], ur, cp, with_phone)
                if v is not None:
                    bits.append(f'<span class="kv"><i>{e(label(key))}</i> {e(str(v))}</span>')
            price = []
            if ask:
                price.append(f"<b>{_n(d['asking_price'])}</b>")
            if cost:
                price.append(f"<span class='mu'>{_n(d['cost_price'])}</span>")
            trs.append(
                f"<tr><td class='n'>{k}</td>"
                + (f"<td class='mono'>{ids}</td>" if show_ids else "")
                + (f"<td>{''.join(bits)}</td>" if detail else "")
                + (f"<td class='n'>{'<br>'.join(price)}</td>" if ask or cost else "")
                + "</tr>"
            )
        blocks.append(
            f'<div class="model"><h4>{e(m or "")} <span>· {len(ds)}</span></h4>'
            f"<table class='list'>{head}<tbody>{''.join(trs)}</tbody></table></div>"
        )

    addr = " · ".join(x for x in (shop.address, shop.city, shop.phone) if x) if shop else ""
    now = dt.datetime.now().strftime("%d-%m-%Y %I:%M %p")
    who = user_name(db, ctx.id) or ""
    css = """
@page { size: A4 portrait; margin: 9mm; }
* { box-sizing: border-box; }
body { font-family: Manrope, 'Noto Nastaliq Urdu', Arial, sans-serif; color: #111; margin: 0; font-size: 10.5px; }
body.ur { font-family: 'Noto Nastaliq Urdu', Manrope, Arial, sans-serif; }
.n, .mono { font-family: Manrope, Arial, sans-serif; font-variant-numeric: tabular-nums; }
.top { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #111; padding-bottom: 6px; }
.top h1 { font-size: 18px; margin: 0; } .top .sub { color: #444; font-size: 10.5px; margin-top: 2px; }
.top .right { text-align: end; font-size: 10.5px; } .top .right b { font-size: 14px; display: block; }
.stats { display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; margin: 8px 0; }
.st { border: 1px solid #999; border-radius: 4px; padding: 4px 6px; display: flex; flex-direction: column; }
.st span { font-size: 9px; color: #333; } .st b { font-size: 13px; }
.two { display: grid; grid-template-columns: 1fr 1.3fr; gap: 8px; }
h2 { font-size: 13px; margin: 10px 0 4px; } h3 span, h4 span { color: #555; font-weight: 600; }
h3.brand { font-size: 13px; margin: 10px 0 2px; padding: 3px 6px; background: #111; color: #fff; break-after: avoid; }
h3.brand span { color: #ddd; }
.model h4 { font-size: 11px; margin: 6px 0 2px; break-after: avoid; }
table { width: 100%; border-collapse: collapse; }
th, td { border: 1px solid #999; padding: 3px 4px; vertical-align: top; text-align: start; line-height: 1.35; overflow-wrap: anywhere; }
th { background: #eee; font-size: 9px; }
td.n, th.n { text-align: end; white-space: nowrap; width: 1%; }
.list tr { break-inside: avoid; } .list thead { display: table-header-group; }
td.mono { width: 125px; letter-spacing: .02em; }
.kv { display: inline-block; margin: 0 10px 1px 0; white-space: nowrap; }
body.ur .kv { margin: 0 0 1px 10px; }
.kv i { font-style: normal; color: #666; font-size: 9px; }
.mu { color: #555; }
"""
    out = f"""<!doctype html><html lang="{"ur" if ur else "en"}" dir="{"rtl" if ur else "ltr"}"><head><meta charset="utf-8">
<title>{e(title)} {shop_today().isoformat()}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;700;800&family=Noto+Nastaliq+Urdu&display=swap">
<style>{css}</style></head><body class="{"ur" if ur else ""}">
<div class="top"><div><h1>{e(shop.name if shop else "")}</h1><div class="sub">{e(addr)}</div></div>
<div class="right"><b>{e(title)}</b>{e(_w("printed", ur))} {e(now)}{(" " + e(_w("by", ur)) + " " + e(who)) if who and copy != "customer" else ""}</div></div>
<div class="stats">{stat_html}</div>
<div class="two">
<div><h2>{e(_w("by_brand", ur))}</h2><table><thead><tr><th>{e(_w("brand", ur))}</th><th class="n">{e(_w("phones", ur))}</th>{ask_th}</tr></thead><tbody>{brand_rows}</tbody></table></div>
<div><h2>{e(_w("by_model", ur))}</h2><table><thead><tr><th>{e(_w("model", ur))}</th><th class="n">{e(_w("phones", ur))}</th>{ask_th}</tr></thead><tbody>{model_rows}</tbody></table></div>
</div>
{"".join(blocks) if blocks else f"<p>{e(_w('none', ur))}</p>"}
</body></html>"""
    return Response(content=out, media_type="text/html; charset=utf-8")
