"""The shop's own price code (shopkeepers 2026-11-20, ADR-117): a price written on a sticker so
that the shop reads it and a customer cannot. The shop makes the pattern itself:

* a sign for every digit 0-9 (1 = A, 2 = B … 0 = Z, or anything else);
* a sign for lakh, thousand and hundred (L, T, H) — each may be left empty, and may be a sign
  that is also a digit (their own example has 8 = H and hundred = H);
* a prefix and a postfix around the code (## … @@);
* a style:
    - ``short``  — the digits without the zeros at the end, then the sign of the price's size:
                   285,000 → BHE + L (2.85 lakh), 45,000 → DE + T, 2,500 → BE + T, 950 → IE + H.
                   Short, but 2,500 and 25,000 look alike — the shopkeeper knows the phone.
    - ``exact``  — each part with its sign, as the price is spoken: 285,500 → B L · HE T · E H
                   (2 lakh 85 thousand 5 hundred). Nothing is lost.
    - ``digits`` — every digit, zeros too: 285,000 → BHEZZZ.

A shop without a pattern keeps the 10-letter code word (`service.cost_code`). The pattern is part
of the shop's settings (`shops.price_code`), is validated here, and is never sent to a login that
may not see cost. The app never encodes a price itself: the settings page asks `preview`.
"""

from decimal import ROUND_HALF_UP, Decimal

STYLES = ("short", "exact", "digits")
UNITS = ("lakh", "thousand", "hundred")
AFFIX_MAX = 8


def _sign(v, what: str, required: bool) -> str:
    s = str(v or "").strip()
    if not s:
        if required:
            raise ValueError(f"{what}: write a letter or sign")
        return ""
    if len(s) != 1 or not s.isprintable() or s.isspace():
        raise ValueError(f"{what}: one letter or sign")
    return s.upper()


def clean(v: dict | None) -> dict | None:
    """the pattern as it is stored, or ValueError; None stays None (the shop uses the code word)"""
    if v is None:
        return None
    if not isinstance(v, dict):
        raise TypeError("price_code must be an object")
    raw = v.get("digits")
    if isinstance(raw, str):
        raw = list(raw)
    if not isinstance(raw, list) or len(raw) != 10:
        raise ValueError("digits: ten signs, for 0 to 9")
    digits = [_sign(x, f"digit {i}", True) for i, x in enumerate(raw)]
    units = {u: _sign(v.get(u), u, False) for u in UNITS}
    if len(set(digits)) != 10:
        raise ValueError("every digit needs a different sign")
    named = [x for x in units.values() if x]
    if len(set(named)) != len(named):
        raise ValueError("lakh, thousand and hundred need different signs")
    affix = {}
    for k in ("prefix", "postfix"):
        s = str(v.get(k) or "").strip()
        if len(s) > AFFIX_MAX or not s.isprintable():
            raise ValueError(f"{k}: at most {AFFIX_MAX} signs")
        affix[k] = s
    style = v.get("style") or "short"
    if style not in STYLES:
        raise ValueError("style: short, exact or digits")
    return {"digits": digits, **units, **affix, "style": style}


def encode(amount: Decimal | float | str | None, pattern: dict) -> str:
    """the price in the shop's code; "" when there is no price"""
    if amount is None:
        return ""
    n = int(abs(Decimal(str(amount))).quantize(Decimal(1), rounding=ROUND_HALF_UP))
    sign = pattern["digits"]

    def d(x: int | str) -> str:
        return "".join(sign[int(ch)] for ch in str(x))

    lakh, thousand, hundred = (pattern.get(u) or "" for u in UNITS)
    style = pattern.get("style") or "short"
    if style == "exact":
        body = ""
        big, rest = divmod(n, 100_000)
        mid, rest = divmod(rest, 1000)
        if big and lakh:
            body += d(big) + lakh
        else:  # no sign for lakh: they count as thousands
            mid += big * 100
        low, rest = divmod(rest, 100)
        if mid and thousand:
            body += d(mid) + thousand
        else:
            low += mid * 10
        if low and hundred:
            body += d(low) + hundred
        else:
            rest += low * 100
        if rest or not body:
            body += d(rest)
    elif style == "short":
        unit = (
            lakh
            if n >= 100_000 and lakh
            else thousand
            if n >= 1000 and thousand
            else hundred
            if n >= 100 and hundred
            else ""
        )
        body = d(str(n).rstrip("0") or "0") + unit if unit else d(n)
    else:
        body = d(n)
    return f"{pattern.get('prefix') or ''}{body}{pattern.get('postfix') or ''}"


def preview(pattern: dict, amounts: list[Decimal]) -> dict:
    """the cleaned pattern and each amount in it — what the settings page shows while typing"""
    p = clean(pattern)
    # shopkeepers write 8 = H and hundred = H: allowed (the unit sign is where the price's size
    # is said), but the page says so, because such a code is harder to read back
    overlap = sorted({p[u] for u in UNITS if p[u] and p[u] in p["digits"]})
    return {
        "pattern": p,
        "overlap": overlap,
        "codes": [{"amount": int(a), "code": encode(a, p)} for a in amounts],
    }
