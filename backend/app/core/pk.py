"""Pakistan-specific validators shared by every module."""

import re

_PHONE_RE = re.compile(r"^(?:\+92|0092|92|0)?3\d{9}$")
_CNIC_RE = re.compile(r"^\d{5}-?\d{7}-?\d$")
_URDU_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")


def latin_digits(value: str) -> str:
    return value.translate(_URDU_DIGITS)


# Country calling codes (ITU E.164). No code is the beginning of another, so the first match of
# 1, 2 or 3 digits is the country. Shopkeepers' customers and dealers come from abroad too (owner
# 2026-11-18, ADR-107).
DIAL_CODES = frozenset(
    [
        "1",
        "7",
        "20",
        "27",
        "30",
        "31",
        "32",
        "33",
        "34",
        "36",
        "39",
        "40",
        "41",
        "43",
        "44",
        "45",
        "46",
        "47",
        "48",
        "49",
        "51",
        "52",
        "53",
        "54",
        "55",
        "56",
        "57",
        "58",
        "60",
        "61",
        "62",
        "63",
        "64",
        "65",
        "66",
        "81",
        "82",
        "84",
        "86",
        "90",
        "91",
        "92",
        "93",
        "94",
        "95",
        "98",
        "211",
        "212",
        "213",
        "216",
        "218",
        "220",
        "221",
        "222",
        "223",
        "224",
        "225",
        "226",
        "227",
        "228",
        "229",
        "230",
        "231",
        "232",
        "233",
        "234",
        "235",
        "236",
        "237",
        "238",
        "239",
        "240",
        "241",
        "242",
        "243",
        "244",
        "245",
        "246",
        "247",
        "248",
        "249",
        "250",
        "251",
        "252",
        "253",
        "254",
        "255",
        "256",
        "257",
        "258",
        "260",
        "261",
        "262",
        "263",
        "264",
        "265",
        "266",
        "267",
        "268",
        "269",
        "290",
        "291",
        "297",
        "298",
        "299",
        "350",
        "351",
        "352",
        "353",
        "354",
        "355",
        "356",
        "357",
        "358",
        "359",
        "370",
        "371",
        "372",
        "373",
        "374",
        "375",
        "376",
        "377",
        "378",
        "380",
        "381",
        "382",
        "383",
        "385",
        "386",
        "387",
        "389",
        "420",
        "421",
        "423",
        "500",
        "501",
        "502",
        "503",
        "504",
        "505",
        "506",
        "507",
        "508",
        "509",
        "590",
        "591",
        "592",
        "593",
        "594",
        "595",
        "596",
        "597",
        "598",
        "599",
        "670",
        "672",
        "673",
        "674",
        "675",
        "676",
        "677",
        "678",
        "679",
        "680",
        "681",
        "682",
        "683",
        "685",
        "686",
        "687",
        "688",
        "689",
        "690",
        "691",
        "692",
        "850",
        "852",
        "853",
        "855",
        "856",
        "880",
        "886",
        "960",
        "961",
        "962",
        "963",
        "964",
        "965",
        "966",
        "967",
        "968",
        "970",
        "971",
        "972",
        "973",
        "974",
        "975",
        "976",
        "977",
        "992",
        "993",
        "994",
        "995",
        "996",
        "998",
    ]
)
# digits after the country code (without a leading 0) where the length is known for certain; the
# same table is in the app (`frontend/src/lib/phone.ts`) and a test keeps the two equal
NATIONAL_LEN: dict[str, tuple[int, int]] = {
    "971": (9, 9),  # United Arab Emirates
    "966": (9, 9),  # Saudi Arabia
    "974": (8, 8),  # Qatar
    "968": (8, 8),  # Oman
    "965": (8, 8),  # Kuwait
    "973": (8, 8),  # Bahrain
    "93": (9, 9),  # Afghanistan
    "44": (10, 10),  # United Kingdom
    "1": (10, 10),  # United States, Canada
    "91": (10, 10),  # India
    "880": (10, 10),  # Bangladesh
    "86": (11, 11),  # China
    "60": (9, 10),  # Malaysia
    "90": (10, 10),  # Türkiye
    "98": (10, 10),  # Iran
    "49": (10, 11),  # Germany
    "39": (9, 10),  # Italy
    "34": (9, 9),  # Spain
    "33": (9, 9),  # France
    "61": (9, 9),  # Australia
    "65": (8, 8),  # Singapore
    "852": (8, 8),  # Hong Kong
    "94": (9, 9),  # Sri Lanka
    "977": (10, 10),  # Nepal
    "7": (10, 10),  # Russia, Kazakhstan
    "964": (10, 10),  # Iraq
    "962": (9, 9),  # Jordan
    "20": (10, 10),  # Egypt
    "27": (9, 9),  # South Africa
    "31": (9, 9),  # Netherlands
    "47": (8, 8),  # Norway
    "30": (10, 10),  # Greece
    "353": (9, 9),  # Ireland
}
OTHER_LEN = (4, 13)  # every other country: anything E.164 allows


def dial_code(digits: str) -> str | None:
    """the country calling code a full international number (digits only) begins with"""
    for n in (1, 2, 3):
        if digits[:n] in DIAL_CODES:
            return digits[:n]
    return None


def is_foreign(phone: str | None) -> bool:
    """a stored number of another country (`+…`); Pakistani ones are stored as 03XXXXXXXXX"""
    return bool(phone) and phone.startswith("+")


def wa_number(phone: str) -> str:
    """A stored number as WhatsApp wants it — country code first, no + : 03001234567 →
    923001234567, +971501234567 → 971501234567."""
    digits = re.sub(r"\D", "", latin_digits(phone or ""))
    if (phone or "").strip().startswith("+"):
        return digits
    if digits.startswith("0092"):
        return digits[2:]
    if digits.startswith("0"):
        return "92" + digits[1:]
    return digits


def normalise_phone(value: str) -> str:
    """A mobile number as it is stored. Pakistani: 03XXXXXXXXX (accepts +92 / 92 / 0 prefixes,
    spaces, dashes, Urdu digits) — unchanged. Any other country (ADR-107): written with its
    country code (+971 50 1234567 or 00971…), stored as +<code><number>."""
    digits = re.sub(r"[\s\-().]", "", latin_digits(value))
    if _PHONE_RE.match(digits):
        digits = re.sub(r"^(\+92|0092|92)", "0", digits)
        if digits.startswith("3"):
            digits = "0" + digits
        return digits
    full = digits[2:] if digits.startswith("00") else digits[1:] if digits.startswith("+") else ""
    if full.isdigit():
        code = dial_code(full)
        if code and code != "92":
            national = full[len(code) :].lstrip("0")
            lo, hi = NATIONAL_LEN.get(code, OTHER_LEN)
            if lo <= len(national) <= hi and len(code) + len(national) <= 15:
                return f"+{code}{national}"
    raise ValueError(
        "Enter a valid mobile number, e.g. 03001234567 — or with the country code, e.g. +971 50 1234567"
    )


def normalise_cnic(value: str) -> str:
    """CNIC stored as #####-#######-#."""
    digits = re.sub(r"[\s]", "", latin_digits(value))
    if not _CNIC_RE.match(digits):
        raise ValueError("Enter a valid CNIC, e.g. 33100-1234567-1")
    d = digits.replace("-", "")
    return f"{d[:5]}-{d[5:12]}-{d[12]}"


def is_valid_imei(value: str) -> bool:
    """15 digits with a valid Luhn check digit."""
    v = latin_digits(value).strip()
    if not re.fullmatch(r"\d{15}", v):
        return False
    total = 0
    for i, ch in enumerate(v):
        n = int(ch)
        if i % 2 == 1:
            n *= 2
            if n > 9:
                n -= 9
        total += n
    return total % 10 == 0
