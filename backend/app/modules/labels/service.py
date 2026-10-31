"""Price stickers / barcode labels (owner 2026-10-30): every shop sticks a label on each phone and
item. One printable page: a roll label per sticker (the page is the sticker's size) or an A4 sheet
grid. The barcode is Code 128 of the IMEI (or the item's SKU) so the shop's scanner or the app's
camera reads it straight into search or the sale. The buying price can go on as a secret code:
digits spelt with the shop's 10-letter code word (owner/manager only)."""

import datetime as dt
import html
import re
import uuid
from decimal import Decimal
from io import BytesIO

import barcode
from barcode.writer import SVGWriter
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import today as shop_today
from app.core.errors import ValidationFailed
from app.modules.accessories.models import Accessory
from app.modules.auth.models import Shop
from app.modules.barcodes import codes
from app.modules.devices.models import Device
from app.modules.devices.service import _base_query, to_out

# width × height in mm; "a4" = a sheet of 38×21 labels (65 per page), the common office sheet
SIZES: dict[str, tuple[float, float]] = {
    "38x25": (38, 25),
    "40x30": (40, 30),
    "50x25": (50, 25),
    "50x30": (50, 30),
    "58x40": (58, 40),  # 58 mm roll
    "60x40": (60, 40),
    "70x40": (70, 40),
    "a4": (38.1, 21.2),
}
FIELDS = (
    "shop",
    "name",
    "specs",
    "price",
    "barcode",
    "imei",
    "last4",
    "condition",
    "pta",
    "date",
    "code",
)
DEFAULT_FIELDS = ("shop", "name", "specs", "price", "barcode", "imei", "condition")
DEFAULT_CODE_WORD = "BLACKHORSE"

CONDITION = {
    "box_pack": ("Box pack", "باکس پیک"),
    "open_box": ("Open box", "اوپن باکس"),
    "used": ("Used", "استعمال شدہ"),
    "refurbished": ("Refurbished", "ری فربشڈ"),
    "faulty": ("Faulty", "خراب"),
}
PTA = {
    "pta_approved": ("PTA approved", "PTA منظور"),
    "non_pta": ("Non-PTA", "نان PTA"),
    "jv": ("JV", "JV"),
    "unknown": ("", ""),
}


def code_word_ok(word: str | None) -> bool:
    return word is None or (len(word) == 10 and word.isalpha() and len(set(word.upper())) == 10)


def cost_code(amount: Decimal | None, word: str | None) -> str:
    """45000 with BLACKHORSE → 'HRBBB' (digit n = n-th letter). The shop reads it, the customer
    cannot."""
    if amount is None:
        return ""
    w = (word or DEFAULT_CODE_WORD).upper()
    return "".join(w[int(ch)] for ch in str(int(amount)))


def barcode_svg(value: str) -> str:
    """Code 128 as an inline SVG that scales to the label's width."""
    buf = BytesIO()
    code = barcode.get("code128", value, writer=SVGWriter())
    code.write(
        buf,
        options={
            "module_width": 0.25,
            "module_height": 8.0,
            "quiet_zone": 1.0,
            "write_text": False,
            "font_size": 0,
            "text_distance": 0,
        },
    )
    svg = buf.getvalue().decode("utf-8")
    svg = svg[svg.index("<svg") :]
    m = re.search(r'width="([\d.]+)mm" height="([\d.]+)mm"', svg)
    if m:
        w, h = m.group(1), m.group(2)
        svg = svg.replace(
            m.group(0),
            f'width="100%" height="100%" viewBox="0 0 {w} {h}" preserveAspectRatio="none"',
            1,
        )
    return svg


def _size(size: str, w: float | None, h: float | None) -> tuple[float, float, bool]:
    if w and h:
        if not (20 <= w <= 110 and 10 <= h <= 110):
            raise ValidationFailed(code="label_size")
        return float(w), float(h), False
    if size not in SIZES:
        raise ValidationFailed(code="label_size")
    lw, lh = SIZES[size]
    return lw, lh, size == "a4"


def _fields(fields: str | None, can_cost: bool) -> set[str]:
    want = {f.strip() for f in (fields or "").split(",") if f.strip()} or set(DEFAULT_FIELDS)
    want &= set(FIELDS)
    if not can_cost:
        want.discard("code")
    return want


def _money(v) -> str:
    return f"Rs. {Decimal(v):,.0f}" if v is not None else ""


def _page(labels: list[str], w: float, h: float, sheet: bool, ur: bool, title: str) -> str:
    gap = 2
    if sheet:
        page = f"@page{{size:A4;margin:8mm}} .grid{{display:flex;flex-wrap:wrap;gap:{gap}mm}} .label{{page-break-inside:avoid}}"
    else:
        page = f"@page{{size:{w}mm {h}mm;margin:0}} .label{{page-break-after:always}} .label:last-child{{page-break-after:auto}}"
    s = h / 25  # type scale: a 25 mm label is the base
    css = f"""
    *{{box-sizing:border-box;margin:0;padding:0}}
    body{{font-family:Arial,Helvetica,'Noto Nastaliq Urdu',sans-serif;color:#000;background:#fff}}
    {page}
    .label{{width:{w}mm;height:{h}mm;padding:{0.9 * s:.2f}mm {1.2 * s:.2f}mm;display:flex;flex-direction:column;justify-content:space-between;overflow:hidden;border:0.1mm solid #bbb}}
    @media print{{.label{{border:0}}}}
    .shop{{font-size:{2.1 * s:.2f}mm;font-weight:700;text-transform:uppercase;letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}
    .name{{font-size:{2.7 * s:.2f}mm;font-weight:800;line-height:1.1;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}}
    .specs{{font-size:{2.0 * s:.2f}mm;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}
    .row{{display:flex;align-items:baseline;justify-content:space-between;gap:1mm}}
    .price{{font-size:{4.2 * s:.2f}mm;font-weight:900;letter-spacing:-.01em;white-space:nowrap}}
    .code{{font-size:{2.2 * s:.2f}mm;font-weight:700;font-family:'Courier New',monospace}}
    .bar{{height:{7.5 * s:.2f}mm;width:100%}}
    .bar svg{{display:block;width:100%;height:100%}}
    .bar.qr{{height:{12 * s:.2f}mm;display:flex;justify-content:center}} .bar.qr svg{{width:auto;height:100%}}
    .imei{{font-size:{2.1 * s:.2f}mm;font-family:'Courier New',monospace;letter-spacing:.08em;text-align:center;white-space:nowrap}}
    .meta{{font-size:{1.9 * s:.2f}mm;color:#222;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}
    .ur{{font-family:'Noto Nastaliq Urdu',Arial,sans-serif;direction:rtl}}
    """
    body = "".join(labels)
    inner = f'<div class="grid">{body}</div>' if sheet else body
    return (
        f'<!doctype html><html lang="{"ur" if ur else "en"}"><head><meta charset="utf-8">'
        f"<title>{html.escape(title)}</title><style>{css}</style></head><body>{inner}</body></html>"
    )


def _label(parts: dict, want: set[str], ur: bool) -> str:
    e = html.escape
    top = []
    if "shop" in want and parts.get("shop"):
        top.append(
            f'<div class="shop{" ur" if parts.get("shop_ur") else ""}">{e(parts["shop"])}</div>'
        )
    if "name" in want and parts.get("name"):
        top.append(f'<div class="name">{e(parts["name"])}</div>')
    if "specs" in want and parts.get("specs"):
        top.append(f'<div class="specs">{e(parts["specs"])}</div>')
    mid = []
    row = []
    if "price" in want and parts.get("price"):
        row.append(f'<div class="price">{e(parts["price"])}</div>')
    if "code" in want and parts.get("code"):
        row.append(f'<div class="code">{e(parts["code"])}</div>')
    if row:
        mid.append(f'<div class="row">{"".join(row)}</div>')
    if "barcode" in want and parts.get("barcode"):
        kind = parts.get("barcode_type") or "code128"
        mid.append(
            f'<div class="bar{" qr" if kind == "qr" else ""}">{codes.svg(kind, parts["barcode"])}</div>'
        )
    if "imei" in want and parts.get("barcode"):
        mid.append(f'<div class="imei">{e(parts["barcode"])}</div>')
    if "last4" in want and parts.get("last4"):
        mid.append(f'<div class="imei">{e(parts["last4"])}</div>')
    meta = [
        parts.get("condition") if "condition" in want else None,
        parts.get("pta") if "pta" in want else None,
        parts.get("date") if "date" in want else None,
    ]
    meta = [m for m in meta if m]
    bottom = f'<div class="meta">{e(" · ".join(meta))}</div>' if meta else ""
    return f'<div class="label"><div>{"".join(top)}</div><div>{"".join(mid)}</div>{bottom}</div>'


def _device_parts(d: dict, shop: Shop, ur: bool, word: str | None) -> dict:
    cat = d.get("category") or "phone"
    specs = [
        f"{d['size_mm']}mm" if cat == "watch" and d.get("size_mm") else " + ".join(x for x in (d.get("storage_name"), f"{d['ram_gb']}GB RAM" if d.get("ram_gb") else None) if x) or None,
        d.get("colour_name"),
        (
            None
            if cat == "phone"
            else ("SIM" if d.get("cellular") else ("Wi-Fi" if cat == "tablet" else "GPS"))
        ),
        f"Battery {d['battery_health']}%" if d.get("battery_health") else None,
    ]
    cond = CONDITION.get(d.get("condition") or "", ("", ""))[1 if ur else 0]
    pta = PTA.get(d.get("pta_status") or "", ("", ""))[1 if ur else 0]
    first = d.get("first_seen_at")
    return {
        "shop": (shop.name_ur if ur and shop.name_ur else shop.name),
        "shop_ur": bool(ur and shop.name_ur),
        "name": f"{d.get('brand_name') or ''} {d.get('model_name') or ''}".strip(),
        "specs": " · ".join(x for x in specs if x),
        "price": _money(d.get("asking_price")),
        "code": cost_code(d.get("cost_price"), word),
        "barcode": d.get("barcode") or d.get("imei1") or d.get("serial") or "",
        "barcode_type": d.get("barcode_type") or "code128",
        "last4": f"IMEI …{(d.get('imei1') or '')[-4:]}" if d.get("imei1") else "",
        "condition": cond,
        "pta": pta,
        "date": first.strftime("%d-%m-%y") if isinstance(first, dt.datetime) else "",
    }


def devices_html(
    db: Session,
    shop_id: uuid.UUID,
    ids: list[uuid.UUID],
    *,
    size: str = "50x30",
    w: float | None = None,
    h: float | None = None,
    fields: str | None = None,
    copies: int = 1,
    lang: str | None = None,
    can_cost: bool = False,
) -> str:
    shop = db.get(Shop, shop_id)
    ur = (lang or shop.default_locale) == "ur"
    lw, lh, sheet = _size(size, w, h)
    want = _fields(fields, can_cost)
    rows = db.execute(_base_query(shop_id).where(Device.id.in_(ids))).all()
    by_id = {r[0].id: to_out(r) for r in rows}
    labels = []
    for did in ids:  # in the order asked
        d = by_id.get(did)
        if d is None:
            continue
        lab = _label(_device_parts(d, shop, ur, shop.label_code_word), want, ur)
        labels.extend([lab] * max(1, min(copies, 50)))
    if not labels:
        raise ValidationFailed(code="no_labels")
    return _page(labels, lw, lh, sheet, ur, f"labels-{shop_today().isoformat()}")


def items_html(
    db: Session,
    shop_id: uuid.UUID,
    ids: list[uuid.UUID],
    *,
    size: str = "38x25",
    w: float | None = None,
    h: float | None = None,
    fields: str | None = None,
    copies: int = 1,
    lang: str | None = None,
    can_cost: bool = False,
) -> str:
    shop = db.get(Shop, shop_id)
    ur = (lang or shop.default_locale) == "ur"
    lw, lh, sheet = _size(size, w, h)
    want = _fields(fields, can_cost)
    items = db.scalars(
        select(Accessory).where(Accessory.shop_id == shop_id, Accessory.id.in_(ids))
    ).all()
    by_id = {a.id: a for a in items}
    labels = []
    for iid in ids:
        a = by_id.get(iid)
        if a is None:
            continue
        parts = {
            "shop": (shop.name_ur if ur and shop.name_ur else shop.name),
            "shop_ur": bool(ur and shop.name_ur),
            "name": a.name_ur if ur and a.name_ur else a.name,
            "specs": "",
            "price": _money(a.price),
            "code": cost_code(a.avg_cost, shop.label_code_word),
            "barcode": a.barcode or a.sku,
            "barcode_type": a.barcode_type or "code128",
            "last4": "",
            "condition": "",
            "pta": "",
            "date": shop_today().strftime("%d-%m-%y"),
        }
        lab = _label(parts, want, ur)
        labels.extend([lab] * max(1, min(copies, 100)))
    if not labels:
        raise ValidationFailed(code="no_labels")
    return _page(labels, lw, lh, sheet, ur, f"labels-{shop_today().isoformat()}")
