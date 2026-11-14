"""Stock tally sheet (owner 2026-11-14, ADR-075): one report to count the stock by hand.

The print page fits A4 portrait (the app's PDF and the browser's print both use it): a header with
the shop, the date and who printed it; the figures (phones on hand, in the shop / out, faulty,
reserved, value, items, to get / to give, cash and bank for the owner); counts by brand and by model;
then every phone, brand by brand and model by model, two lines per phone so every field fits, with
a box to tick and a space to write; the items; and signature lines. The Excel has the same as a
Summary sheet, a Phones sheet with one column per field and a "Found" column, and an Items sheet,
set to print A4 landscape one page wide. Read-only: nothing is written."""

import datetime as dt
import html
import io
from collections import defaultdict
from decimal import Decimal

from fastapi.responses import Response
from sqlalchemy import select

from app.core.clock import today as shop_today
from app.db.base import ZERO
from app.db.refs import user_name
from app.modules.devices import service as devices
from app.modules.devices.state import DeviceStatus
from app.modules.ledger.service import money
from app.modules.parties.models import Party

HELD = (
    DeviceStatus.IN_STOCK,
    DeviceStatus.FAULTY,
    DeviceStatus.IN_REPAIR,
    DeviceStatus.WITH_CUSTOMER_FOR_APPROVAL,
    DeviceStatus.ON_LOAN,
)
IN_SHOP = (DeviceStatus.IN_STOCK, DeviceStatus.FAULTY)

W = {
    "title": ("Stock tally sheet", "اسٹاک گنتی شیٹ"),
    "printed": ("Printed", "چھپی"),
    "by": ("by", "از"),
    "phones": ("Phones on hand", "موجود موبائل"),
    "in_shop": ("In the shop", "دکان میں"),
    "out": ("Out (repair / approval / loan)", "باہر (مرمت / پسند / امانت)"),
    "faulty": ("Faulty", "خراب"),
    "reserved": ("Reserved", "ریزرو"),
    "inspection": ("ID check / lock pending", "شناخت / لاک باقی"),
    "value_cost": ("Phones at cost", "موبائل قیمتِ خرید پر"),
    "value_asking": ("Phones at asking", "موبائل قیمتِ فروخت پر"),
    "items": ("Items (pieces)", "آئٹمز (عدد)"),
    "items_value": ("Items at cost", "آئٹمز قیمتِ خرید پر"),
    "to_get": ("To get (lena)", "لینا ہے"),
    "to_give": ("To give (dena)", "دینا ہے"),
    "cash": ("Cash + bank now", "نقد + بینک ابھی"),
    "by_brand": ("By brand", "برانڈ کے حساب سے"),
    "by_model": ("By model", "ماڈل کے حساب سے"),
    "brand": ("Brand", "برانڈ"),
    "model": ("Model", "ماڈل"),
    "count": ("Phones", "موبائل"),
    "cost": ("Cost", "قیمتِ خرید"),
    "asking": ("Asking", "قیمتِ فروخت"),
    "detail": ("Every phone", "ہر موبائل"),
    "found": ("Found", "ملا"),
    "ids": ("IMEI / IMEI 2 / Serial", "IMEI / IMEI 2 / سیریل"),
    "spec": ("Storage · RAM / Colour", "اسٹوریج · RAM / رنگ"),
    "cond": ("Condition · Grade / PTA · SIM lock", "حالت · گریڈ / PTA · سم لاک"),
    "battery": ("Battery / Region · SIM", "بیٹری / ریجن · سم"),
    "code": ("Barcode / Shelf", "بارکوڈ / شیلف"),
    "status": ("Status / Days", "حالت / دن"),
    "price": ("Cost / Asking", "خرید / فروخت"),
    "note": ("Note", "نوٹ"),
    "items_title": ("Items (accessories)", "آئٹمز"),
    "item": ("Item", "آئٹم"),
    "sku": ("SKU", "SKU"),
    "qty": ("In books", "ریکارڈ میں"),
    "counted": ("Counted", "گنے"),
    "counted_by": ("Counted by", "گنتی کرنے والا"),
    "checked_by": ("Checked by", "چیک کرنے والا"),
    "date": ("Date", "تاریخ"),
    "total": ("Total", "کل"),
    "none": ("No phones on hand.", "کوئی موبائل موجود نہیں۔"),
}
STATUS = {
    "in_stock": ("In stock", "اسٹاک میں"),
    "faulty": ("Faulty", "خراب"),
    "in_repair": ("In repair", "مرمت میں"),
    "with_customer_for_approval": ("On approval", "پسند کے لیے"),
    "on_loan": ("On loan", "امانت"),
}
COND = {"box_pack": "Box pack", "open_box": "Open box", "used": "Used", "patched": "Patched"}
PTA = {"pta_approved": "PTA", "non_pta": "Non-PTA", "jv": "JV", "cpid": "CP ID", "unknown": ""}


def _w(k: str, ur: bool) -> str:
    return W[k][1 if ur else 0]


def _days(at) -> int | None:
    if not at:
        return None
    d = at.date() if isinstance(at, dt.datetime) else at
    return max(0, (shop_today() - d).days)


def collect(db, shop_id, can_cost: bool) -> dict:
    """everything the sheet shows, once, for the page and the Excel"""
    from app.modules.accessories.models import Accessory
    from app.modules.reports import service as rep

    rows = devices.list_devices(
        db, shop_id, status=None, condition=None, pta_status=None, brand_id=None, q=None, limit=5000
    )
    phones = [d for d in rows if d["status"] in HELD]
    phones.sort(key=lambda d: (d["brand_name"] or "", d["model_name"] or "", d["imei1"] or ""))
    st = devices.stock_status(db, shop_id, category=None, can_cost=can_cost)
    items = db.scalars(
        select(Accessory)
        .where(Accessory.shop_id == shop_id, Accessory.is_active.is_(True), Accessory.qty != 0)
        .order_by(Accessory.name)
    ).all()
    balances = db.scalars(
        select(Party.balance).where(
            Party.shop_id == shop_id, Party.is_active.is_(True), Party.balance != 0
        )
    ).all()
    dash = rep.dashboard(db, shop_id, can_cost) if can_cost else None
    brands: dict[str, dict] = {}
    models: dict[tuple[str, str], dict] = {}
    for d in phones:
        b = brands.setdefault(
            d["brand_name"], {"count": 0, "in_shop": 0, "cost": ZERO, "asking": ZERO}
        )
        m = models.setdefault(
            (d["brand_name"], d["model_name"]), {"count": 0, "cost": ZERO, "asking": ZERO}
        )
        for x in (b, m):
            x["count"] += 1
            x["cost"] += d["cost_price"] or ZERO
            x["asking"] += d["asking_price"] or ZERO
        if d["status"] in IN_SHOP:
            b["in_shop"] += 1
    return {
        "phones": phones,
        "brands": brands,
        "models": models,
        "status": st,
        "items": items,
        "to_get": money(sum((b for b in balances if b > 0), ZERO)),
        "to_give": money(-sum((b for b in balances if b < 0), ZERO)),
        "cash": dash["cash_in_hand"] if dash else None,
        "value_cost": money(sum((d["cost_price"] or ZERO for d in phones), ZERO)),
        "value_asking": money(sum((d["asking_price"] or ZERO for d in phones), ZERO)),
        "items_pieces": sum(i.qty for i in items),
        "items_value": money(sum((i.avg_cost * i.qty for i in items), ZERO)),
    }


def _n(v) -> str:
    if v is None or v == "":
        return ""
    return f"{Decimal(v):,.0f}"


def page(ctx, db, can_cost: bool, ur: bool) -> Response:
    from app.modules.auth.models import Shop

    shop = db.get(Shop, ctx.shop_id)
    data = collect(db, ctx.shop_id, can_cost)
    e = html.escape
    st = data["status"]["units"]
    out = st["in_repair"] + st["approval"] + st["on_loan"]
    now = dt.datetime.now().strftime("%d-%m-%Y %I:%M %p")
    who = user_name(db, ctx.id) or ""

    def stat(k: str, v, money_: bool = False) -> str:
        val = _n(v) if money_ else e(str(v))
        return f'<div class="st"><span>{e(_w(k, ur))}</span><b class="n">{val}</b></div>'

    stats = [
        stat("phones", st["on_hand"]),
        stat("in_shop", st["on_hand"] - out),
        stat("out", out),
        stat("faulty", st["faulty"]),
        stat("reserved", st["reserved"]),
        stat("inspection", st["inspection"]),
        stat("value_asking", data["value_asking"], True),
        stat("items", data["items_pieces"]),
        stat("to_get", data["to_get"], True),
        stat("to_give", data["to_give"], True),
    ]
    if can_cost:
        stats[6:6] = [stat("value_cost", data["value_cost"], True)]
        stats.append(stat("items_value", data["items_value"], True))
        stats.append(stat("cash", data["cash"], True))

    cost_th = f'<th class="n">{e(_w("cost", ur))}</th>' if can_cost else ""
    brand_rows = "".join(
        f"<tr><td>{e(b or '')}</td><td class='n'>{v['count']}</td><td class='n'>{v['in_shop']}</td>"
        + (f"<td class='n'>{_n(v['cost'])}</td>" if can_cost else "")
        + f"<td class='n'>{_n(v['asking'])}</td></tr>"
        for b, v in sorted(data["brands"].items(), key=lambda x: (-x[1]["count"], x[0] or ""))
    )
    model_rows = "".join(
        f"<tr><td>{e(b or '')} {e(m or '')}</td><td class='n'>{v['count']}</td>"
        + (f"<td class='n'>{_n(v['cost'])}</td>" if can_cost else "")
        + f"<td class='n'>{_n(v['asking'])}</td></tr>"
        for (b, m), v in sorted(
            data["models"].items(), key=lambda x: (x[0][0] or "", x[0][1] or "")
        )
    )

    # every phone: brand → model, two lines a phone
    by_model: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for d in data["phones"]:
        by_model[(d["brand_name"], d["model_name"])].append(d)
    head = (
        f"<thead><tr><th class='box'>{e(_w('found', ur))}</th><th class='n'>#</th>"
        f"<th>{e(_w('ids', ur))}</th><th>{e(_w('spec', ur))}</th><th>{e(_w('cond', ur))}</th>"
        f"<th>{e(_w('battery', ur))}</th><th>{e(_w('code', ur))}</th><th>{e(_w('status', ur))}</th>"
        + (
            f"<th class='n'>{e(_w('price', ur))}</th>"
            if can_cost
            else f"<th class='n'>{e(_w('asking', ur))}</th>"
        )
        + f"<th class='note'>{e(_w('note', ur))}</th></tr></thead>"
    )
    blocks = []
    last_brand = None
    k = 0
    for (b, m), ds in by_model.items():
        if b != last_brand:
            bv = data["brands"][b]
            blocks.append(f'<h3 class="brand">{e(b or "")} <span>· {bv["count"]}</span></h3>')
            last_brand = b
        trs = []
        for d in ds:
            k += 1
            ids = "<br>".join(e(x) for x in (d["imei1"], d.get("imei2"), d.get("serial")) if x)
            spec1 = " · ".join(
                x
                for x in (
                    d.get("storage_name"),
                    f"{d['ram_gb']}GB RAM" if d.get("ram_gb") else None,
                )
                if x
            )
            lock = (
                ""
                if not d.get("sim_lock")
                else "Unlocked"
                if d["sim_lock"] == "unlocked"
                else " ".join(x for x in ("Locked", d.get("sim_lock_carrier")) if x)
            )
            cond1 = " · ".join(
                x for x in (COND.get(d["condition"], d["condition"]), d.get("grade")) if x
            )
            cond2 = " · ".join(x for x in (PTA.get(d["pta_status"], d["pta_status"]), lock) if x)
            bat1 = f"{d['battery_health']}%" if d.get("battery_health") else ""
            if d.get("battery_cycles") is not None:
                bat1 = " · ".join(x for x in (bat1, f"{d['battery_cycles']} cyc") if x)
            bat2 = " · ".join(x for x in (d.get("region_code"), d.get("sim_type")) if x)
            stat_ = STATUS.get(d["status"], (d["status"], d["status"]))[1 if ur else 0]
            faults = ", ".join(d.get("faults") or [])
            price = (
                f"{_n(d['cost_price'])}<br>{_n(d['asking_price'])}"
                if can_cost
                else _n(d["asking_price"])
            )
            trs.append(
                f"<tr><td class='box'><span></span></td><td class='n'>{k}</td>"
                f"<td class='mono'>{ids}</td>"
                f"<td>{e(spec1)}<br><span class='mu'>{e(d.get('colour_name') or '')}</span></td>"
                f"<td>{e(cond1)}<br><span class='mu'>{e(cond2)}</span></td>"
                f"<td>{e(bat1)}<br><span class='mu'>{e(bat2)}</span></td>"
                f"<td class='mono'>{e(d.get('barcode') or '')}<br><span class='mu'>{e(d.get('location') or '')}</span></td>"
                f"<td>{e(stat_)}{(' · ' + e(faults)) if faults else ''}<br><span class='mu'>{_days(d.get('first_seen_at') or d.get('last_event_at')) or 0}d</span></td>"
                f"<td class='n'>{price}</td><td class='note'></td></tr>"
            )
        blocks.append(
            f'<div class="model"><h4>{e(m or "")} <span>· {len(ds)}</span></h4>'
            f"<table class='list'>{head}<tbody>{''.join(trs)}</tbody></table></div>"
        )

    item_rows = "".join(
        f"<tr><td class='box'><span></span></td><td>{e(i.name)}</td><td class='mono'>{e(i.sku)}</td>"
        f"<td class='n'>{i.qty}</td><td class='counted'></td>"
        + (f"<td class='n'>{_n(i.avg_cost * i.qty)}</td>" if can_cost else "")
        + "</tr>"
        for i in data["items"]
    )
    items_html = (
        f"<h2>{e(_w('items_title', ur))} <span>· {len(data['items'])}</span></h2>"
        f"<table class='list'><thead><tr><th class='box'>{e(_w('found', ur))}</th><th>{e(_w('item', ur))}</th>"
        f"<th>{e(_w('sku', ur))}</th><th class='n'>{e(_w('qty', ur))}</th><th>{e(_w('counted', ur))}</th>"
        + (f"<th class='n'>{e(_w('cost', ur))}</th>" if can_cost else "")
        + f"</tr></thead><tbody>{item_rows}</tbody></table>"
        if data["items"]
        else ""
    )
    addr = (
        " · ".join(
            x
            for x in (shop.address, shop.city, shop.phone, f"NTN {shop.ntn}" if shop.ntn else None)
            if x
        )
        if shop
        else ""
    )
    css = """
@page { size: A4 portrait; margin: 9mm; }
* { box-sizing: border-box; }
body { font-family: Manrope, 'Noto Nastaliq Urdu', Arial, sans-serif; color: #111; margin: 0; font-size: 10px; }
body.ur { font-family: 'Noto Nastaliq Urdu', Manrope, Arial, sans-serif; }
.n, .mono { font-family: Manrope, Arial, sans-serif; font-variant-numeric: tabular-nums; }
.mono { letter-spacing: .02em; }
.top { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #111; padding-bottom: 6px; }
.top h1 { font-size: 18px; margin: 0; } .top .sub { color: #444; font-size: 10.5px; margin-top: 2px; }
.top .right { text-align: end; font-size: 10.5px; } .top .right b { font-size: 14px; display: block; }
.stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; margin: 8px 0; }
.st { border: 1px solid #999; border-radius: 4px; padding: 4px 6px; display: flex; flex-direction: column; }
.st span { font-size: 9px; color: #333; } .st b { font-size: 13px; }
.two { display: grid; grid-template-columns: 1fr 1.3fr; gap: 8px; }
h2 { font-size: 13px; margin: 10px 0 4px; } h2 span, h3 span, h4 span { color: #555; font-weight: 600; }
h3.brand { font-size: 13px; margin: 10px 0 2px; padding: 3px 6px; background: #111; color: #fff; break-after: avoid; }
h3.brand span { color: #ddd; }
.model h4 { font-size: 11px; margin: 6px 0 2px; break-after: avoid; }
table { width: 100%; border-collapse: collapse; }
th, td { border: 1px solid #999; padding: 2px 4px; vertical-align: top; text-align: start; line-height: 1.25; }
th { background: #eee; font-size: 9px; }
td.n, th.n { text-align: end; white-space: nowrap; }
.list tr { break-inside: avoid; }
.list thead { display: table-header-group; }
.mu { color: #555; }
td.box, th.box { width: 30px; text-align: center; }
td.box span { display: inline-block; width: 13px; height: 13px; border: 1.5px solid #111; border-radius: 2px; }
td.note, th.note { width: 70px; } td.counted { width: 60px; }
.sign { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 22px; break-inside: avoid; }
.sign div { border-top: 1px solid #111; padding-top: 3px; font-size: 10px; }
"""
    page_html = f"""<!doctype html><html lang="{"ur" if ur else "en"}" dir="{"rtl" if ur else "ltr"}"><head><meta charset="utf-8">
<title>{e(_w("title", ur))} {shop_today().isoformat()}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;700;800&family=Noto+Nastaliq+Urdu&display=swap">
<style>{css}</style></head><body class="{"ur" if ur else ""}">
<div class="top"><div><h1>{e(shop.name if shop else "")}</h1>
<div class="sub">{e(addr)}</div></div>
<div class="right"><b>{e(_w("title", ur))}</b>{e(_w("printed", ur))} {e(now)}{(" " + e(_w("by", ur)) + " " + e(who)) if who else ""}</div></div>
<div class="stats">{"".join(stats)}</div>
<div class="two">
<div><h2>{e(_w("by_brand", ur))}</h2><table><thead><tr><th>{e(_w("brand", ur))}</th><th class="n">{e(_w("count", ur))}</th><th class="n">{e(_w("in_shop", ur))}</th>{cost_th}<th class="n">{e(_w("asking", ur))}</th></tr></thead><tbody>{brand_rows}</tbody></table></div>
<div><h2>{e(_w("by_model", ur))}</h2><table><thead><tr><th>{e(_w("model", ur))}</th><th class="n">{e(_w("count", ur))}</th>{cost_th}<th class="n">{e(_w("asking", ur))}</th></tr></thead><tbody>{model_rows}</tbody></table></div>
</div>
<h2>{e(_w("detail", ur))} <span>· {len(data["phones"])}</span></h2>
{"".join(blocks) if blocks else f"<p>{e(_w('none', ur))}</p>"}
{items_html}
<div class="sign"><div>{e(_w("counted_by", ur))}</div><div>{e(_w("checked_by", ur))}</div><div>{e(_w("date", ur))}</div></div>
</body></html>"""
    return Response(content=page_html, media_type="text/html; charset=utf-8")


def workbook(ctx, db, can_cost: bool, ur: bool) -> Response:
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    from openpyxl.worksheet.properties import PageSetupProperties

    from app.modules.auth.models import Shop

    shop = db.get(Shop, ctx.shop_id)
    data = collect(db, ctx.shop_id, can_cost)
    st = data["status"]["units"]
    out = st["in_repair"] + st["approval"] + st["on_loan"]
    bold = Font(bold=True)
    head_fill = PatternFill("solid", fgColor="E6E2DA")
    thin = Side(style="thin", color="999999")
    box = Border(left=thin, right=thin, top=thin, bottom=thin)
    w = lambda k: _w(k, ur)

    def setup(ws, landscape: bool, title_rows: str | None = None):
        ws.page_setup.paperSize = ws.PAPERSIZE_A4
        ws.page_setup.orientation = "landscape" if landscape else "portrait"
        ws.sheet_properties.pageSetUpPr = PageSetupProperties(fitToPage=True)
        ws.page_setup.fitToWidth = 1
        ws.page_setup.fitToHeight = 0
        ws.print_options.gridLines = True
        ws.page_margins.left = ws.page_margins.right = 0.3
        ws.page_margins.top = ws.page_margins.bottom = 0.4
        if title_rows:
            ws.print_title_rows = title_rows

    def header_row(ws, row: int, values: list):
        ws.append(values)
        for c in ws[row]:
            c.font = bold
            c.fill = head_fill
            c.border = box

    wb = Workbook()
    s = wb.active
    s.title = "Summary"
    s.append([shop.name if shop else ""])
    s["A1"].font = Font(bold=True, size=14)
    s.append(
        [
            " · ".join(
                x
                for x in (
                    (shop.address if shop else None),
                    (shop.city if shop else None),
                    (shop.phone if shop else None),
                )
                if x
            )
        ]
    )
    s.append(
        [
            w("title"),
            f"{w('printed')} {dt.datetime.now().strftime('%d-%m-%Y %I:%M %p')}",
            user_name(db, ctx.id) or "",
        ]
    )
    s.append([])
    figures = [
        (w("phones"), st["on_hand"]),
        (w("in_shop"), st["on_hand"] - out),
        (w("out"), out),
        (w("faulty"), st["faulty"]),
        (w("reserved"), st["reserved"]),
        (w("inspection"), st["inspection"]),
    ]
    if can_cost:
        figures.append((w("value_cost"), float(data["value_cost"])))
    figures += [
        (w("value_asking"), float(data["value_asking"])),
        (w("items"), data["items_pieces"]),
    ]
    if can_cost:
        figures.append((w("items_value"), float(data["items_value"])))
    figures += [(w("to_get"), float(data["to_get"])), (w("to_give"), float(data["to_give"]))]
    if can_cost and data["cash"] is not None:
        figures.append((w("cash"), float(data["cash"])))
    for k, v in figures:
        s.append([k, v])
        s.cell(row=s.max_row, column=1).font = bold
    s.append([])
    r = s.max_row + 1
    header_row(
        s,
        r,
        [w("brand"), w("count"), w("in_shop")] + ([w("cost")] if can_cost else []) + [w("asking")],
    )
    for b, v in sorted(data["brands"].items(), key=lambda x: (-x[1]["count"], x[0] or "")):
        s.append(
            [b, v["count"], v["in_shop"]]
            + ([float(v["cost"])] if can_cost else [])
            + [float(v["asking"])]
        )
    s.append([])
    r = s.max_row + 1
    header_row(
        s,
        r,
        [w("brand"), w("model"), w("count")] + ([w("cost")] if can_cost else []) + [w("asking")],
    )
    for (b, m), v in sorted(data["models"].items(), key=lambda x: (x[0][0] or "", x[0][1] or "")):
        s.append(
            [b, m, v["count"]] + ([float(v["cost"])] if can_cost else []) + [float(v["asking"])]
        )
    for col, width in zip("ABCDE", (34, 26, 14, 16, 16), strict=False):
        s.column_dimensions[col].width = width
    setup(s, landscape=False)

    p = wb.create_sheet("Phones")
    cols = (
        [
            w("found"),
            "#",
            "Brand",
            "Model",
            "IMEI",
            "IMEI 2",
            "Serial",
            "Storage",
            "RAM (GB)",
            "Colour",
            "Condition",
            "Grade",
            "PTA",
            "SIM lock",
            "Battery %",
            "Cycles",
            "Region",
            "SIM",
            "Barcode",
            "Shelf",
            "Bought from",
            "Status",
            "Faults",
            "Days",
        ]
        + (["Cost"] if can_cost else [])
        + ["Asking", w("note")]
    )
    header_row(p, 1, cols)
    for i, d in enumerate(data["phones"], start=1):
        lock = (
            None
            if not d.get("sim_lock")
            else "Unlocked"
            if d["sim_lock"] == "unlocked"
            else " ".join(x for x in ("Locked", d.get("sim_lock_carrier")) if x)
        )
        p.append(
            [
                "",
                i,
                d["brand_name"],
                d["model_name"],
                d["imei1"],
                d.get("imei2"),
                d.get("serial"),
                d.get("storage_name"),
                d.get("ram_gb"),
                d.get("colour_name"),
                COND.get(d["condition"], d["condition"]),
                d.get("grade"),
                PTA.get(d["pta_status"], d["pta_status"]),
                lock,
                d.get("battery_health"),
                d.get("battery_cycles"),
                d.get("region_code"),
                d.get("sim_type"),
                d.get("barcode"),
                d.get("location"),
                d.get("source_party_name"),
                STATUS.get(d["status"], (d["status"],))[0],
                ", ".join(d.get("faults") or []) or None,
                _days(d.get("first_seen_at") or d.get("last_event_at")),
            ]
            + (
                [float(d["cost_price"]) if d["cost_price"] is not None else None]
                if can_cost
                else []
            )
            + [float(d["asking_price"]) if d["asking_price"] is not None else None, ""]
        )
    for row in p.iter_rows(min_row=2):
        for c in row:
            c.border = box
            c.alignment = Alignment(vertical="top")
    widths = (
        [7, 5, 12, 20, 17, 17, 14, 9, 6, 10, 9, 7, 8, 14, 7, 6, 7, 10, 12, 9, 16, 11, 16, 6]
        + ([10] if can_cost else [])
        + [10, 18]
    )
    for idx, width in enumerate(widths, start=1):
        p.column_dimensions[p.cell(row=1, column=idx).column_letter].width = width
    p.freeze_panes = "E2"
    p.auto_filter.ref = p.dimensions
    setup(p, landscape=True, title_rows="1:1")

    it = wb.create_sheet("Items")
    header_row(
        it,
        1,
        [w("found"), w("item"), w("sku"), w("qty"), w("counted")]
        + ([w("cost")] if can_cost else []),
    )
    for i in data["items"]:
        it.append(
            ["", i.name, i.sku, i.qty, ""] + ([float(i.avg_cost * i.qty)] if can_cost else [])
        )
    for col, width in zip("ABCDEF", (7, 36, 16, 10, 10, 14), strict=False):
        it.column_dimensions[col].width = width
    setup(it, landscape=False, title_rows="1:1")

    buf = io.BytesIO()
    wb.save(buf)
    stamp = shop_today().isoformat()
    return Response(
        content=buf.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="stock-tally-{stamp}.xlsx"'},
    )
