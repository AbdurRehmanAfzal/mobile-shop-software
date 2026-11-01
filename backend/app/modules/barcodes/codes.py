"""Barcode types: what each can encode, check digits, and rendering as crisp SVG (print) or PNG
(tests decode it back). Code 128 is the default; EAN-13, Code 39 and QR are the others. Data Matrix
is not offered (no pure-Python encoder worth shipping; QR covers the 2-D need)."""

import re
from io import BytesIO

TYPES = ("code128", "ean13", "code39", "qr")
DEFAULT_TYPE = "code128"
LABELS = {
    "code128": "Code 128",
    "ean13": "EAN-13",
    "code39": "Code 39",
    "qr": "QR code",
}
_CODE39 = re.compile(r"^[A-Z0-9 \-.$/+%]{1,40}$")
_CODE128 = re.compile(r"^[\x20-\x7e]{1,48}$")


def ean13_check_digit(digits12: str) -> str:
    total = sum(int(d) * (3 if i % 2 else 1) for i, d in enumerate(digits12))
    return str((10 - total % 10) % 10)


def normalise(kind: str, value: str) -> str:
    """The value as it will be stored, or raises ValueError with a short reason key."""
    v = (value or "").strip()
    if not v:
        raise ValueError("empty")
    if kind == "ean13":
        if not v.isdigit():
            raise ValueError("ean13_digits")
        if len(v) == 12:
            return v + ean13_check_digit(v)
        if len(v) == 13:
            if ean13_check_digit(v[:12]) != v[12]:
                raise ValueError("ean13_check")
            return v
        raise ValueError("ean13_length")
    if kind == "code39":
        v = v.upper()
        if not _CODE39.match(v):
            raise ValueError("code39_chars")
        return v
    if kind == "code128":
        if not _CODE128.match(v):
            raise ValueError("code128_chars")
        return v
    if kind == "qr":
        if len(v) > 200:
            raise ValueError("qr_length")
        return v
    raise ValueError("type")


def can_encode(kind: str, value: str) -> bool:
    try:
        normalise(kind, value)
        return True
    except ValueError:
        return False


REASONS = {
    "empty": ("The barcode value is empty", "بارکوڈ کی قیمت خالی ہے"),
    "ean13_digits": ("EAN-13 holds digits only", "EAN-13 میں صرف ہندسے ہوتے ہیں"),
    "ean13_length": (
        "EAN-13 needs 12 digits (the 13th is computed) or 13 with a valid check digit",
        "EAN-13 کے لیے 12 ہندسے (13واں خود بنتا ہے) یا 13 درست ہندسے چاہییں",
    ),
    "ean13_check": ("The EAN-13 check digit is wrong", "EAN-13 کا چیک ہندسہ غلط ہے"),
    "code39_chars": (
        "Code 39 allows A–Z, 0–9, space and - . $ / + % (up to 40)",
        "Code 39 میں A–Z، 0–9، خالی جگہ اور - . $ / + % (زیادہ سے زیادہ 40)",
    ),
    "code128_chars": (
        "Code 128 allows printable English characters (up to 48)",
        "Code 128 میں انگریزی کے قابلِ طباعت حروف (زیادہ سے زیادہ 48)",
    ),
    "qr_length": (
        "A QR code value may be up to 200 characters",
        "QR کوڈ کی قیمت زیادہ سے زیادہ 200 حروف",
    ),
    "type": ("Unknown barcode type", "نامعلوم بارکوڈ قسم"),
}


# ---- rendering ----------------------------------------------------------------------------------


def _svg_strip(svg: str) -> str:
    svg = svg[svg.index("<svg") :]
    m = re.search(r'width="([\d.]+)mm" height="([\d.]+)mm"', svg)
    if m:
        w, h = m.group(1), m.group(2)
        svg = svg.replace(
            m.group(0),
            f'width="100%" height="100%" viewBox="0 0 {w} {h}" preserveAspectRatio="none"',
            1,
        )
        # python-barcode writes every bar as x="2.5mm" width="0.5mm"; inside a viewBox measured in
        # plain millimetre numbers a "mm" unit is 3.78 times too big, so the bars overflowed and the
        # printed sticker showed only the first few (found 2026-11-01 on the landing screenshot)
        svg = re.sub(r'="(-?[\d.]+)mm"', r'="\1"', svg)
    return svg


def svg(kind: str, value: str, *, module_width: float = 0.25, height_mm: float = 8.0) -> str:
    """Inline SVG that scales to the label: vector bars, a quiet zone on each side, black on white.
    QR keeps its aspect (preserveAspectRatio default) so modules stay square."""
    if kind == "qr":
        import segno

        q = segno.make(value, error="m", micro=False)
        buf = BytesIO()
        q.save(
            buf, kind="svg", xmldecl=False, svgns=True, scale=4, border=2, dark="#000", light="#fff"
        )
        out = buf.getvalue().decode("utf-8")
        out = out[out.index("<svg") :]
        out = re.sub(r'width="[\d.]+"', 'width="100%"', out, count=1)
        out = re.sub(r'height="[\d.]+"', 'height="100%"', out, count=1)
        return out
    import barcode
    from barcode.writer import SVGWriter

    name = {"code128": "code128", "ean13": "ean13", "code39": "code39"}[kind]
    value_in = value[:12] if kind == "ean13" else value
    cls = barcode.get_barcode_class(name)
    code = cls(
        value_in, writer=SVGWriter(), **({"add_checksum": False} if kind == "code39" else {})
    )
    buf = BytesIO()
    code.write(
        buf,
        options={
            "module_width": module_width,
            "module_height": height_mm,
            "quiet_zone": 2.5,  # mm each side: scanners need it
            "write_text": False,
            "font_size": 0,
            "text_distance": 0,
        },
    )
    return _svg_strip(buf.getvalue().decode("utf-8"))


def png(kind: str, value: str, *, scale: int = 4) -> bytes:
    """A raster image (for the round-trip tests and for anyone who wants a PNG)."""
    if kind == "qr":
        import segno

        buf = BytesIO()
        segno.make(value, error="m", micro=False).save(buf, kind="png", scale=6, border=4)
        return buf.getvalue()
    import barcode
    from barcode.writer import ImageWriter

    name = {"code128": "code128", "ean13": "ean13", "code39": "code39"}[kind]
    value_in = value[:12] if kind == "ean13" else value
    cls = barcode.get_barcode_class(name)
    code = cls(
        value_in, writer=ImageWriter(), **({"add_checksum": False} if kind == "code39" else {})
    )
    buf = BytesIO()
    code.write(
        buf,
        options={
            "module_width": 0.3 * scale / 2,
            "module_height": 15.0,
            "quiet_zone": 6.5,
            "write_text": False,
            "dpi": 300,
        },
    )
    return buf.getvalue()
