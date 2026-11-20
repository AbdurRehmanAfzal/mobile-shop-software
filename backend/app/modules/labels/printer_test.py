"""A test page for a printer (owner 2026-11-20, ADR-119): one page of exactly the size the shop
says it prints on — a sticker, an 80 mm slip or A4 — with a frame along its edge, a ruler in
millimetres and a barcode. If the whole frame is on the paper the size is right; if the scanner
reads the barcode the stickers will scan. Nothing of the shop's data is on it and nothing is saved.

The software does not talk to a printer: every print goes through the phone's or the computer's
own print window. This page is what the shop prints once to pick the printer there and see that
the paper size fits (docs/guides, Settings → Printers).
"""

import html

from app.core.errors import ValidationFailed
from app.modules.barcodes import codes
from app.modules.labels.service import SIZES

KINDS = ("sticker", "receipt", "a4")
SAMPLE = "MS-TEST-12345"

TEXT = {
    "en": {
        "title": "Printer test",
        "sticker": "Sticker",
        "receipt": "80 mm slip",
        "a4": "A4 page",
        "frame": "The whole frame must be on the paper.",
        "scan": "Scan this barcode with your scanner.",
        "ok": "If both are right, your printer is ready.",
        "cut": "Frame cut off? Choose the right paper size in the print window, margins: None.",
    },
    "ur": {
        "title": "پرنٹر ٹیسٹ",
        "sticker": "اسٹیکر",
        "receipt": "80 ملی میٹر سلپ",
        "a4": "A4 صفحہ",
        "frame": "پورا چوکھٹا کاغذ پر آنا چاہیے۔",
        "scan": "یہ بارکوڈ اپنے اسکینر سے اسکین کریں۔",
        "ok": "دونوں ٹھیک ہیں تو آپ کا پرنٹر تیار ہے۔",
        "cut": "چوکھٹا کٹ گیا؟ پرنٹ ونڈو میں صحیح کاغذ کا سائز چنیں، مارجن: None۔",
    },
}


def page(
    kind: str, size: str = "60x40", w: float | None = None, h: float | None = None, lang: str = "en"
) -> str:
    if kind not in KINDS:
        raise ValidationFailed(code="printer_kind")
    t = TEXT["ur" if lang == "ur" else "en"]
    e = html.escape
    if kind == "sticker":
        if w and h:
            if not (20 <= w <= 110 and 10 <= h <= 110):
                raise ValidationFailed(code="label_size")
            pw, ph = float(w), float(h)
        elif size in SIZES and size != "a4":
            pw, ph = SIZES[size]
        else:
            raise ValidationFailed(code="label_size")
        at = f"@page{{size:{pw}mm {ph}mm;margin:0}}"
        box = f"width:{pw}mm;height:{ph}mm"
        note = f"{pw:g} × {ph:g} mm"
        scale = max(0.55, min(1.0, ph / 40))
    elif kind == "receipt":
        pw = 72.0  # what an 80 mm printer prints
        at = "@page{size:80mm auto;margin:0}"
        box = f"width:{pw}mm;min-height:60mm;margin:0 auto"
        note = "80 mm · 72 mm"
        scale = 1.0
    else:
        pw = 190.0
        at = "@page{size:A4;margin:10mm}"
        box = f"width:{pw}mm;height:120mm"
        note = "A4 · 210 × 297 mm"
        scale = 1.6
    ticks = "".join(
        f'<span style="left:{mm}mm;height:{2.4 if mm % 10 == 0 else 1.2}mm"></span>'
        + (f'<b style="left:{mm}mm">{mm}</b>' if mm % 10 == 0 and mm else "")
        for mm in range(0, int(pw) - 3, 5)
    )
    small = kind == "sticker" and scale < 0.8
    lines = [
        f'<div class="h">{e(t["title"])} · {e(t[kind])} · <span dir="ltr">{e(note)}</span></div>'
    ]
    if not small:
        lines.append(f'<div class="p">{e(t["frame"])}</div>')
    lines.append(f'<div class="bar">{codes.svg("code128", SAMPLE)}</div>')
    lines.append(f'<div class="c" dir="ltr">{SAMPLE}</div>')
    if not small:
        lines.append(f'<div class="p">{e(t["scan"])}</div>')
    if kind != "sticker":
        lines.append(f'<div class="p b">{e(t["ok"])}</div><div class="p">{e(t["cut"])}</div>')
    css = f"""
    *{{box-sizing:border-box;margin:0;padding:0}}
    body{{font-family:Arial,Helvetica,'Noto Nastaliq Urdu',sans-serif;color:#000;background:#fff}}
    {at}
    .box{{{box};border:0.4mm solid #000;padding:{1.2 * scale:.2f}mm {1.6 * scale:.2f}mm;display:flex;flex-direction:column;gap:{0.8 * scale:.2f}mm;overflow:hidden;position:relative}}
    .h{{font-size:{3.0 * scale:.2f}mm;font-weight:800}}
    .p{{font-size:{2.5 * scale:.2f}mm;line-height:1.35}} .b{{font-weight:800}}
    .bar{{height:{9 * scale:.2f}mm}} .bar svg{{width:100%;height:100%}}
    .c{{font-size:{2.4 * scale:.2f}mm;font-family:'Courier New',monospace;text-align:center}}
    .ruler{{position:relative;height:5mm;margin-top:auto}}
    .ruler span{{position:absolute;bottom:0;width:0.2mm;background:#000}}
    .ruler b{{position:absolute;bottom:2.6mm;font-size:1.8mm;font-weight:400;transform:translateX(-50%)}}
    """
    ruler = "" if small else f'<div class="ruler" dir="ltr">{ticks}</div>'
    return (
        f'<!doctype html><html lang="{"ur" if lang == "ur" else "en"}" dir="{"rtl" if lang == "ur" else "ltr"}">'
        f'<head><meta charset="utf-8"><title>printer-test-{kind}</title><style>{css}</style></head>'
        f'<body><div class="box">{"".join(lines)}{ruler}</div></body></html>'
    )
