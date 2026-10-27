"""Pakistan-specific validators shared by every module."""

import re

_PHONE_RE = re.compile(r"^(?:\+92|0092|92|0)?3\d{9}$")
_CNIC_RE = re.compile(r"^\d{5}-?\d{7}-?\d$")
_URDU_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")


def latin_digits(value: str) -> str:
    return value.translate(_URDU_DIGITS)


def normalise_phone(value: str) -> str:
    """Pakistani mobile numbers stored as 03XXXXXXXXX. Accepts +92/92/0 prefixes, spaces, dashes, Urdu digits."""
    digits = re.sub(r"[\s\-()]", "", latin_digits(value))
    if not _PHONE_RE.match(digits):
        raise ValueError("Enter a valid Pakistani mobile number, e.g. 03001234567")
    digits = re.sub(r"^(\+92|0092|92)", "0", digits)
    if digits.startswith("3"):
        digits = "0" + digits
    return digits


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
