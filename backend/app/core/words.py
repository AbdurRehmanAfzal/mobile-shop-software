"""An amount in words for printed bills (owner 2026-11-06, docs/36 §6): "Rupees One Lakh Fifty-Two
Thousand Only" / "صرف ایک لاکھ باون ہزار روپے" — the Pakistani way, in lakh and crore."""

from decimal import ROUND_HALF_UP, Decimal

_EN = [
    "Zero",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
]
_EN_TENS = ["_", "_", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]
# Urdu has its own word for every number up to 99
_UR = [
    "صفر",
    "ایک",
    "دو",
    "تین",
    "چار",
    "پانچ",
    "چھ",
    "سات",
    "آٹھ",
    "نو",
    "دس",
    "گیارہ",
    "بارہ",
    "تیرہ",
    "چودہ",
    "پندرہ",
    "سولہ",
    "سترہ",
    "اٹھارہ",
    "انیس",
    "بیس",
    "اکیس",
    "بائیس",
    "تئیس",
    "چوبیس",
    "پچیس",
    "چھبیس",
    "ستائیس",
    "اٹھائیس",
    "انتیس",
    "تیس",
    "اکتیس",
    "بتیس",
    "تینتیس",
    "چونتیس",
    "پینتیس",
    "چھتیس",
    "سینتیس",
    "اڑتیس",
    "انتالیس",
    "چالیس",
    "اکتالیس",
    "بیالیس",
    "تینتالیس",
    "چوالیس",
    "پینتالیس",
    "چھیالیس",
    "سینتالیس",
    "اڑتالیس",
    "انچاس",
    "پچاس",
    "اکیاون",
    "باون",
    "ترپن",
    "چون",
    "پچپن",
    "چھپن",
    "ستاون",
    "اٹھاون",
    "انسٹھ",
    "ساٹھ",
    "اکسٹھ",
    "باسٹھ",
    "تریسٹھ",
    "چونسٹھ",
    "پینسٹھ",
    "چھیاسٹھ",
    "سڑسٹھ",
    "اڑسٹھ",
    "انہتر",
    "ستر",
    "اکہتر",
    "بہتر",
    "تہتر",
    "چوہتر",
    "پچھتر",
    "چھہتر",
    "ستتر",
    "اٹھہتر",
    "اناسی",
    "اسی",
    "اکیاسی",
    "بیاسی",
    "تراسی",
    "چوراسی",
    "پچاسی",
    "چھیاسی",
    "ستاسی",
    "اٹھاسی",
    "نواسی",
    "نوے",
    "اکانوے",
    "بانوے",
    "ترانوے",
    "چورانوے",
    "پچانوے",
    "چھیانوے",
    "ستانوے",
    "اٹھانوے",
    "ننانوے",
]
assert len(_UR) == 100
# (size, English, Urdu) from the largest down: arab, crore, lakh, thousand, hundred
_UNITS = [
    (10**9, "Arab", "ارب"),
    (10**7, "Crore", "کروڑ"),
    (10**5, "Lakh", "لاکھ"),
    (1000, "Thousand", "ہزار"),
    (100, "Hundred", "سو"),
]


def _en_small(n: int) -> str:
    if n < 20:
        return _EN[n]
    t, u = divmod(n, 10)
    return _EN_TENS[t] + (f"-{_EN[u]}" if u else "")


def _spell(n: int, ur: bool) -> str:
    if n < 100:
        return _UR[n] if ur else _en_small(n)
    parts = []
    for size, en, urw in _UNITS:
        if n >= size:
            q, n = divmod(n, size)
            parts.append(f"{_spell(q, ur)} {urw if ur else en}")
    if n:
        parts.append(_UR[n] if ur else _en_small(n))
    return " ".join(parts)


def amount_in_words(amount: Decimal | float | str, lang: str = "en") -> str:
    """ "Rupees Five Hundred Sixty-Eight Only"; with paisa "… and Fifty Paisa Only"; Urdu "صرف … روپے"."""
    v = Decimal(str(amount)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    neg = v < 0
    v = abs(v)
    rupees, paisa = int(v), int((v - int(v)) * 100)
    ur = lang == "ur"
    if ur:
        text = f"{_spell(rupees, True)} روپے" + (f" {_spell(paisa, True)} پیسے" if paisa else "")
        return ("منفی " if neg else "") + f"صرف {text}"
    text = f"Rupees {_spell(rupees, False)}" + (
        f" and {_spell(paisa, False)} Paisa" if paisa else ""
    )
    return ("Minus " if neg else "") + f"{text} Only"
