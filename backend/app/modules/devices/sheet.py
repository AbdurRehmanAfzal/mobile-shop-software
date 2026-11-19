"""A phone's details as a printed slip (shopkeepers 2026-11-20, ADR-114): on an 80 mm thermal roll
or an A4 page, with the lines the shop ticks — like the price sticker, but the whole phone. The
phone's page shows this page as its preview, so what is seen is what prints, downloads or is
shared. Read-only: it is drawn from the device row and writes nothing."""

import html
import uuid

from sqlalchemy.orm import Session

from app.core.clock import today as shop_today
from app.modules.auth import profile
from app.modules.auth.models import Shop
from app.modules.barcodes import codes
from app.modules.devices import types as dtypes
from app.modules.devices.service import get_device, get_device_out, with_source
from app.modules.labels.service import _SIM_SHORT, CONDITION, PTA, is_imei

# the lines a shop may tick, in the order they print
FIELDS = (
    "shop",
    "status",
    "price",
    "imei",
    "imei2",
    "serial",
    "memory",
    "colour",
    "condition",
    "pta",
    "battery",
    "warranty",
    "accessories",
    "seller",
    "cost",
    "notes",
    "barcode",
    "date",
)
DEFAULT_FIELDS = (
    "shop",
    "price",
    "imei",
    "imei2",
    "serial",
    "memory",
    "colour",
    "condition",
    "pta",
    "battery",
    "warranty",
    "accessories",
    "barcode",
    "date",
)
# only for those who may see cost (owner, manager)
COST_FIELDS = ("cost", "seller")

T = {
    "title": ("Phone details", "موبائل کی تفصیل"),
    "status": ("Status", "حالت"),
    "price": ("Price", "قیمت"),
    "imei": ("IMEI", "IMEI"),
    "imei2": ("IMEI 2", "IMEI 2"),
    "serial": ("Serial no.", "سیریل نمبر"),
    "memory": ("Memory", "میموری"),
    "specs": ("Specs", "تفصیل"),
    "colour": ("Colour", "رنگ"),
    "condition": ("Condition", "کنڈیشن"),
    "pta": ("PTA", "PTA"),
    "battery": ("Battery", "بیٹری"),
    "warranty": ("Warranty", "وارنٹی"),
    "accessories": ("Comes with", "ساتھ ہے"),
    "seller": ("Bought from", "جس سے خریدا"),
    "cost": ("Cost", "قیمتِ خرید"),
    "notes": ("Notes", "نوٹ"),
    "date": ("Printed", "چھپنے کی تاریخ"),
    "months": ("months", "ماہ"),
    "by": {
        "shop": ("by the shop", "دکان کی"),
        "supplier": ("by the dealer", "ڈیلر کی"),
        "brand": ("by the brand", "کمپنی کی"),
    },
    "pending": ("to come", "آنا باقی"),
    "cycles": ("cycles", "سائیکل"),
}
STATUS = {
    "in_stock": ("In stock", "اسٹاک میں"),
    "sold": ("Sold", "بک گیا"),
    "on_loan": ("On amanat", "امانت پر"),
    "in_repair": ("In repair", "مرمت میں"),
    "faulty": ("Faulty", "خراب"),
    "reserved": ("Reserved", "بک شدہ"),
    "with_customer_for_approval": ("With a customer", "گاہک کے پاس"),
    "returned_to_supplier": ("Returned to the dealer", "ڈیلر کو واپس"),
    "transferred": ("Sent to a branch", "برانچ کو بھیجا"),
}
ACC = {
    "box": ("Box", "ڈبہ"),
    "charger": ("Charger", "چارجر"),
    "cable": ("Cable", "کیبل"),
    "earphones": ("Earphones", "ہینڈز فری"),
    "airpods": ("AirPods", "ایئر پوڈز"),
    "stylus": ("Pen", "قلم"),
    "keyboard": ("Keyboard", "کی بورڈ"),
    "strap": ("Strap", "اسٹریپ"),
    "manual": ("Manual", "کتابچہ"),
    "cover": ("Cover", "کور"),
    "wireless_charger": ("Wireless charger", "وائرلیس چارجر"),
}


def fields_for(raw: str | None, can_cost: bool) -> list[str]:
    want = [f.strip() for f in (raw or "").split(",") if f.strip()] or list(DEFAULT_FIELDS)
    return [f for f in FIELDS if f in want and (can_cost or f not in COST_FIELDS)]


def sheet_html(
    db: Session,
    shop_id: uuid.UUID,
    device_id: uuid.UUID,
    *,
    fmt: str = "thermal",
    fields: str | None = None,
    lang: str | None = None,
    can_cost: bool = False,
) -> str:
    shop = db.get(Shop, shop_id)
    lang = lang if lang in ("en", "ur") else (shop.default_locale or "ur")
    ur = lang == "ur"
    i = 1 if ur else 0
    e = html.escape
    d = with_source(db, [get_device_out(db, shop_id, device_id)])[0]
    device = get_device(db, shop_id, device_id)
    want = fields_for(fields, can_cost)
    thermal = fmt == "thermal"
    cat = d.get("category") or "phone"
    ltr = lambda v: f'<span class="l">{e(str(v))}</span>'

    rows: list[tuple[str, str]] = []

    def row(key: str, value: str | None, label: str | None = None) -> None:
        if key in want and value:
            rows.append((label or T[key][i], value))

    row("status", e(STATUS.get(d.get("status") or "", (d.get("status") or "", ""))[i] or ""))
    real_imei = is_imei(d.get("imei1"))
    if real_imei:
        row("imei", ltr(d["imei1"]))
    row("imei2", ltr(d["imei2"]) if d.get("imei2") else None)
    serial = d.get("serial") or (None if real_imei else d.get("imei1"))
    row("serial", ltr(serial) if serial else None)
    if cat == "laptop":
        row("memory", ltr(dtypes.laptop_line(d)) if dtypes.laptop_line(d) else None, T["specs"][i])
    else:
        mem = " · ".join(
            x
            for x in (d.get("storage_name"), f"{d['ram_gb']}GB RAM" if d.get("ram_gb") else None)
            if x
        )
        row("memory", ltr(mem) if mem else None)
    row("colour", e(d["colour_name"]) if d.get("colour_name") else None)
    cond = CONDITION.get(d.get("condition") or "", ("", ""))[i]
    if d.get("grade"):
        g = str(d["grade"])
        cond = f"{cond} {g.upper() if len(g) == 1 else g}".strip()
    locked = dtypes.lock_text(d.get("lock_type"), ur)
    if locked:
        cond = " · ".join(x for x in (cond, locked) if x)
    if d.get("faults"):
        cond = " · ".join(x for x in (cond, dtypes.fault_text(d["faults"], ur)) if x)
    row("condition", e(cond) if cond else None)
    if cat == "phone" or d.get("cellular"):
        pta = PTA.get(d.get("pta_status") or "", ("", ""))[i]
        if d.get("pta_status") == "cpid":
            pta = dtypes.cpid_label(shop)
        sim = _SIM_SHORT.get(d.get("sim_type") or "", d.get("sim_type"))
        row("pta", e(" · ".join(x for x in (pta, sim, d.get("region_code")) if x)) or None)
    bat = " · ".join(
        x
        for x in (
            f"{d['battery_health']}%" if d.get("battery_health") else None,
            f"{d['battery_cycles']} {T['cycles'][i]}"
            if d.get("battery_cycles") is not None
            else None,
        )
        if x
    )
    row("battery", e(bat) if bat else None)
    if d.get("warranty_months"):
        by = T["by"].get(d.get("warranty_by") or "", ("", ""))[i]
        row("warranty", e(f"{d['warranty_months']} {T['months'][i]}{' · ' + by if by else ''}"))
    acc = []
    for a in device.accessories:
        name = a.label if a.kind == "other" and a.label else ACC.get(a.kind, (a.kind, a.kind))[i]
        acc.append(name if a.came_with else f"{name} ({T['pending'][i]})")
    row("accessories", e(", ".join(acc)) if acc else None)
    row("seller", e(d["source_party_name"]) if d.get("source_party_name") else None)
    if d.get("cost_price") is not None:
        row("cost", ltr(profile.money(shop, d["cost_price"])))
    row("notes", e(d["notes"]) if d.get("notes") else None)
    row("date", ltr(shop_today().strftime("%d-%m-%Y")))

    name = f"{d.get('brand_name') or ''} {d.get('model_name') or ''}".strip()
    price_html = (
        f'<div class="price">{ltr(profile.money(shop, d["asking_price"]))}</div>'
        if "price" in want and d.get("asking_price") is not None
        else ""
    )
    table = "".join(f"<tr><th>{e(k)}</th><td>{v}</td></tr>" for k, v in rows)
    bar_html = ""
    if "barcode" in want:
        # as on the sticker (ADR-106): the IMEI when the phone has one, else the shop's own code
        value = d["imei1"] if real_imei else (d.get("barcode") or d.get("imei1") or "")
        kind = "code128" if real_imei else (d.get("barcode_type") or "code128")
        if value:
            bar_html = f'<div class="bar{" qr" if kind == "qr" else ""}">{codes.svg(kind, value)}</div><div class="code l">{e(value)}</div>'
    head = profile.header_html(shop, ur, thermal) if "shop" in want else ""
    font_link = (
        '<link href="https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@400;700&display=swap" rel="stylesheet">'
        if ur
        else ""
    )
    body_font = "'Noto Nastaliq Urdu', serif" if ur else "Arial, sans-serif"
    side = "right" if ur else "left"
    return f"""<!doctype html><html lang="{lang}" dir="{"rtl" if ur else "ltr"}"><head><meta charset="utf-8"><title>{e(name)}</title>
{font_link}
<style>
@page {{ size: {"80mm auto" if thermal else "A4"}; margin: {"4mm" if thermal else "14mm"}; }}
* {{ box-sizing: border-box; }}
body {{ width: {"72mm" if thermal else "190mm"}; margin: 0 auto; font-family: {body_font}; font-size: {"11px" if thermal else "14px"}; color: #111; background: #fff; {"line-height: 1.9;" if ur else ""} }}
h1 {{ font-size: {"15px" if thermal else "20px"}; margin: 0; text-align: center; }}
.kind {{ margin-top: {"6px" if thermal else "14px"}; text-align: center; font-size: {"9px" if thermal else "11px"}; letter-spacing: .08em; text-transform: uppercase; color: #555; }}
.name {{ text-align: center; font-size: {"16px" if thermal else "26px"}; font-weight: 800; line-height: 1.2; margin-top: 2px; }}
.price {{ text-align: center; font-size: {"22px" if thermal else "34px"}; font-weight: 900; margin: {"4px 0" if thermal else "8px 0 4px"}; }}
table {{ width: 100%; border-collapse: collapse; margin-top: {"6px" if thermal else "14px"}; }}
th, td {{ padding: {"3px 2px" if thermal else "8px 6px"}; vertical-align: top; border-bottom: 1px {"dashed" if thermal else "solid"} #bbb; text-align: {side}; }}
th {{ width: {"36%" if thermal else "30%"}; font-weight: 400; color: #444; }} td {{ font-weight: 700; word-break: break-word; }}
.l {{ direction: ltr; unicode-bidi: isolate; display: inline-block; }}
.bar {{ height: {"14mm" if thermal else "20mm"}; width: {"100%" if thermal else "90mm"}; margin: {"8px auto 0" if thermal else "18px auto 0"}; }} .bar svg {{ display: block; width: 100%; height: 100%; }}
.bar.qr {{ height: 24mm; width: 24mm; }}
.code {{ display: block; text-align: center; font-family: 'Courier New', monospace; letter-spacing: .08em; font-size: {"10px" if thermal else "12px"}; margin-top: 2px; }}
small {{ color: #555; }}
</style></head><body>
{head}
<div class="kind">{e(T["title"][i])}</div>
<div class="name">{e(name)}</div>
{price_html}
<table>{table}</table>
{bar_html}
</body></html>"""
