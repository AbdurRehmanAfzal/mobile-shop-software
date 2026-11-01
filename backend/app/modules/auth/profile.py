"""The shop's business profile on paper (docs/30): logo, names, owner, contact, NTN / STRN / FBR POS ID,
bank details, terms and the currency label. One header and one footer used by every printed
document (sale bill, repair slip, seller declaration, unit statement), so a change in Settings shows
everywhere. Money is always PKR (hard rule); the currency setting changes only how it is written."""

import base64
import html
import re
from decimal import Decimal

from app.modules.auth.models import Shop

DEFAULT_CURRENCY = {"code": "PKR", "symbol": "Rs.", "position": "before", "decimals": 0}
SYMBOLS = ("Rs.", "Rs", "PKR", "₨", "روپے")
BUSINESS_TYPES = ("sole", "partnership", "company", "aop", "other")
PROVINCES = ("punjab", "sindh", "kpk", "balochistan", "islamabad", "gb", "ajk")
DEFAULT_PRINT = {"logo": True, "ntn": True, "owner": False, "bank": False, "terms": True, "tagline": True, "social": False}
LOGO_MAX = 600 * 1024


def currency(shop: Shop | None) -> dict:
    c = dict(DEFAULT_CURRENCY)
    raw = (shop.currency if shop is not None else None) or {}
    if raw.get("symbol") in SYMBOLS:
        c["symbol"] = raw["symbol"]
    if raw.get("position") in ("before", "after"):
        c["position"] = raw["position"]
    if raw.get("decimals") in (0, 2):
        c["decimals"] = raw["decimals"]
    return c


def clean_currency(raw: dict | None) -> dict | None:
    if raw is None:
        return None
    if not isinstance(raw, dict):
        raise TypeError("currency must be an object")
    out = {"code": "PKR"}
    sym = raw.get("symbol", "Rs.")
    if sym not in SYMBOLS:
        raise ValueError(f"symbol must be one of {SYMBOLS}")
    out["symbol"] = sym
    pos = raw.get("position", "before")
    if pos not in ("before", "after"):
        raise ValueError("position must be before or after")
    out["position"] = pos
    dec = int(raw.get("decimals", 0))
    if dec not in (0, 2):
        raise ValueError("decimals must be 0 or 2")
    out["decimals"] = dec
    return out


def money(shop: Shop | None, amount: Decimal | float | str | None) -> str:
    c = currency(shop)
    v = Decimal(str(amount or 0))
    body = f"{abs(v):,.{c['decimals']}f}"
    text = f"{c['symbol']} {body}" if c["position"] == "before" else f"{body} {c['symbol']}"
    return f"-{text}" if v < 0 else text


def print_prefs(shop: Shop | None) -> dict:
    p = dict(DEFAULT_PRINT)
    raw = (shop.print_prefs if shop is not None else None) or {}
    for k in DEFAULT_PRINT:
        if k in raw:
            p[k] = bool(raw[k])
    return p


def clean_print_prefs(raw: dict | None) -> dict | None:
    if raw is None:
        return None
    if not isinstance(raw, dict):
        raise TypeError("print_prefs must be an object")
    return {k: bool(raw[k]) for k in DEFAULT_PRINT if k in raw}


def clean_ntn(v: str | None) -> str | None:
    """NTN: 7 digits plus a check digit (1234567-8), or a 13-digit CNIC-based NTN"""
    if not v or not v.strip():
        return None
    d = re.sub(r"\D", "", v)
    if len(d) == 8:
        return f"{d[:7]}-{d[7]}"
    if len(d) in (7, 13):
        return d
    raise ValueError("NTN: 7 digits + check digit (1234567-8) or 13 digits")


def clean_strn(v: str | None) -> str | None:
    if not v or not v.strip():
        return None
    d = re.sub(r"\D", "", v)
    if len(d) not in (12, 13):
        raise ValueError("STRN: 13 digits")
    return d


def clean_social(raw: dict | None) -> dict | None:
    if raw is None:
        return None
    if not isinstance(raw, dict):
        raise TypeError("social must be an object")
    out = {}
    for k in ("facebook", "instagram", "tiktok", "youtube"):
        v = str(raw.get(k) or "").strip()
        if v:
            out[k] = v[:120]
    return out or None


def clean_bank(raw: dict | None) -> dict | None:
    if raw is None:
        return None
    if not isinstance(raw, dict):
        raise TypeError("bank_details must be an object")
    out = {}
    for k in ("bank", "title", "account", "iban", "wallet"):
        v = str(raw.get(k) or "").strip()
        if v:
            out[k] = v[:80]
    return out or None


def logo_data_uri(shop: Shop) -> str | None:
    """the logo inlined, so a printed page / PDF / shared link shows it without a login"""
    if not shop.logo_path:
        return None
    from app.modules.files.service import resolve

    try:
        p = resolve(shop.id, shop.logo_path)
        data = p.read_bytes()
    except Exception:  # noqa: BLE001 — a missing logo never breaks a bill
        return None
    if len(data) > LOGO_MAX:
        return None
    ext = p.suffix.lower().lstrip(".")
    mime = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp"}.get(ext)
    if mime is None:
        return None
    return f"data:{mime};base64,{base64.b64encode(data).decode()}"


def header_html(shop: Shop, ur: bool, thermal: bool = False) -> str:
    """logo, name, tagline, address, phones, email, NTN / STRN / FBR POS ID — what the shop chose"""
    e = html.escape
    pp = print_prefs(shop)
    name = e(shop.name_ur) if ur and shop.name_ur else e(shop.name)
    parts = ['<div class="ph" style="text-align:center">']
    logo = logo_data_uri(shop) if pp["logo"] else None
    if logo:
        h = "48px" if thermal else "64px"
        parts.append(f'<img src="{logo}" alt="" style="max-height:{h};max-width:60%;object-fit:contain;display:block;margin:0 auto 4px">')
    parts.append(f'<h1>{name}</h1>')
    if shop.legal_name and shop.legal_name.strip() and shop.legal_name.strip() != shop.name:
        parts.append(f'<div><small>{e(shop.legal_name)}</small></div>')
    tag = (shop.tagline_ur if ur and shop.tagline_ur else shop.tagline) if pp["tagline"] else None
    if tag:
        parts.append(f'<div><i>{e(tag)}</i></div>')
    line1 = " ".join(x for x in (shop.address, shop.city) if x)
    phones = " · ".join(x for x in (shop.phone, (f"WhatsApp {shop.whatsapp}" if shop.whatsapp and shop.whatsapp != shop.phone else None)) if x)
    line2 = " · ".join(x for x in (phones, shop.email, shop.website) if x)
    owner = None
    if pp["owner"] and shop.owner_name:
        owner = ("پروپرائٹر " if ur else "Prop. ") + shop.owner_name
    tax = []
    if pp["ntn"]:
        if shop.ntn:
            tax.append(f"NTN {shop.ntn}")
        if shop.strn:
            tax.append(f"STRN {shop.strn}")
        if shop.fbr_pos_id:
            tax.append(f"FBR POS {shop.fbr_pos_id}")
    for line in (line1, line2, owner, " · ".join(tax)):
        if line:
            parts.append(f'<div><small>{e(line)}</small></div>')
    if pp["social"] and shop.social:
        parts.append(f'<div><small>{e(" · ".join(f"{k}: {v}" for k, v in shop.social.items()))}</small></div>')
    parts.append("</div>")
    return "".join(parts)


def footer_html(shop: Shop, ur: bool) -> str:
    """terms (returns / warranty), bank details for paying a balance"""
    e = html.escape
    pp = print_prefs(shop)
    out = []
    terms = (shop.terms_ur if ur and shop.terms_ur else shop.terms) if pp["terms"] else None
    if terms:
        out.append(f'<div class="terms" style="margin-top:6px;font-size:10px;white-space:pre-line">{e(terms)}</div>')
    b = shop.bank_details or {}
    if pp["bank"] and b:
        bits = " · ".join(x for x in (b.get("bank"), b.get("title"), b.get("account"), b.get("iban"), b.get("wallet")) if x)
        label = "ادائیگی: " if ur else "Pay to: "
        out.append(f'<div style="margin-top:4px;font-size:10px"><small>{e(label + bits)}</small></div>')
    if shop.opening_hours:
        out.append(f'<div style="margin-top:2px;font-size:10px"><small>{e(shop.opening_hours)}</small></div>')
    return "".join(out)
