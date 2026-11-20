"""Shopkeepers 2026-11-20 (ADR-117): the shop's own price code — a sign per digit, signs for lakh /
thousand / hundred, a prefix and a postfix — printed on a sticker for the cost and for the asking
price. A shop without a pattern keeps its 10-letter code word; a login that may not see cost gets
neither the pattern nor a coded price."""

import pytest

from app.modules.labels.pricecode import clean, encode
from tests.conftest import login
from tests.test_devices import _stock

IMEI = "490154203237518"
# the shopkeepers' own example: 1 = A … 9 = I, 0 = Z, lakh L, thousand T, hundred H, ## … @@
PATTERN = {
    "digits": ["Z", "A", "B", "C", "D", "E", "F", "G", "H", "I"],
    "lakh": "L",
    "thousand": "T",
    "hundred": "H",
    "prefix": "##",
    "postfix": "@@",
    "style": "short",
}


def test_short_style_is_the_shopkeepers_example():
    p = clean(PATTERN)
    assert encode(285000, p) == "##BHEL@@"  # 2.85 lakh
    assert encode(45000, p) == "##DET@@"
    assert encode(2500, p) == "##BET@@"
    assert encode(950, p) == "##IEH@@"
    assert encode(300000, p) == "##CL@@"
    assert encode(1250500, p) == "##ABEZEL@@"  # zeros inside stay, zeros at the end go
    assert encode(75, p) == "##GE@@"  # under a hundred: the digits
    assert encode(0, p) == "##Z@@"
    assert encode(None, p) == ""
    assert encode("44999.60", p) == "##DET@@"  # rounded to the rupee first


def test_exact_and_digits_styles():
    exact = clean({**PATTERN, "prefix": "", "postfix": "", "style": "exact"})
    assert encode(285000, exact) == "BLHET"  # 2 lakh 85 thousand
    assert encode(285500, exact) == "BLHETEH"
    assert encode(45050, exact) == "DETEZ"  # 45 thousand and 50
    assert encode(1200000, exact) == "ABL"
    assert encode(950, exact) == "IHEZ"
    assert encode(40, exact) == "DZ"
    # a sign left empty folds into the next one down: no lakh sign → 285 thousand
    assert (
        encode(
            285000, clean({**PATTERN, "prefix": "", "postfix": "", "style": "exact", "lakh": ""})
        )
        == "BHET"
    )
    # two different prices never share an exact code
    seen = {}
    for n in (2500, 25000, 250000, 2050, 20500, 205000, 25, 250, 2005):
        code = encode(n, exact)
        assert code not in seen, (n, seen.get(code))
        seen[code] = n
    digits = clean({**PATTERN, "prefix": "", "postfix": "", "style": "digits"})
    assert encode(285000, digits) == "BHEZZZ"


def test_short_style_without_unit_signs_writes_every_digit():
    p = clean({**PATTERN, "lakh": "", "thousand": "", "hundred": "", "prefix": "", "postfix": ""})
    assert encode(285000, p) == "BHEZZZ"
    # only a thousand sign: a lakh price is counted in the largest sign there is
    assert encode(285000, clean({**PATTERN, "lakh": "", "prefix": "", "postfix": ""})) == "BHET"


def test_pattern_is_checked():
    assert clean(None) is None
    p = clean({"digits": "zabcdefghi", "lakh": "l"})  # a string of ten works; signs are upper-cased
    assert (
        p["digits"][1] == "A" and p["lakh"] == "L" and p["thousand"] == "" and p["style"] == "short"
    )
    with pytest.raises(ValueError):
        clean({**PATTERN, "digits": ["A"] * 10})  # the same sign twice
    with pytest.raises(ValueError):
        clean({**PATTERN, "thousand": "L"})  # two units with one sign
    assert clean({**PATTERN, "lakh": "A"})["lakh"] == "A"  # a unit may share a digit's sign
    with pytest.raises(ValueError):
        clean({**PATTERN, "digits": PATTERN["digits"][:9]})
    with pytest.raises(ValueError):
        clean({**PATTERN, "digits": ["AB", *PATTERN["digits"][1:]]})  # one sign each
    with pytest.raises(ValueError):
        clean({**PATTERN, "digits": ["", *PATTERN["digits"][1:]]})
    with pytest.raises(ValueError):
        clean({**PATTERN, "prefix": "#" * 9})
    with pytest.raises(ValueError):
        clean({**PATTERN, "style": "secret"})


def test_sticker_prints_the_pattern_and_staff_never_see_it(owner, client, cat):
    d = _stock(owner, cat, imei=IMEI, condition="box_pack", cost_price=258000, asking_price=285000)
    url = f"/api/v1/labels/devices?ids={d['id']}&fields=name,price,code,pcode&lang=en&fv=2"

    # no pattern yet: the code word, for the cost and for the asking price (as before for the cost)
    page = owner.get(url).text
    assert "AHSBBB" in page and "ASHBBB" in page  # 258000 and 285000 with BLACKHORSE
    assert owner.get("/api/v1/shops/current").json()["price_code"] is None

    # the page shows the pattern at work before anything is saved
    r = owner.post(
        "/api/v1/labels/price-code/preview", json={"pattern": PATTERN, "amounts": [285000, 45000]}
    )
    assert r.status_code == 200, r.text
    assert [c["code"] for c in r.json()["codes"]] == ["##BHEL@@", "##DET@@"]
    assert owner.get("/api/v1/shops/current").json()["price_code"] is None
    assert r.json()["overlap"] == ["H"]  # 8 and hundred share a sign: said, not refused
    bad = owner.post(
        "/api/v1/labels/price-code/preview",
        json={"pattern": {**PATTERN, "thousand": "L"}, "amounts": [1]},
    )
    assert bad.status_code == 422 and bad.json()["error"]["code"] == "price_code_bad"

    # saved: the sticker carries both prices in the shop's own code
    r = owner.patch("/api/v1/shops/current", json={"price_code": PATTERN})
    assert r.status_code == 200, r.text
    assert r.json()["price_code"]["digits"][2] == "B"
    page = owner.get(url).text
    assert "##BEHL@@" in page and "##BHEL@@" in page and "AHSBBB" not in page
    assert "Rs. 285,000" in page  # the plain price is its own tick
    only_code = owner.get(
        f"/api/v1/labels/devices?ids={d['id']}&fields=name,pcode&lang=en&fv=2"
    ).text
    assert (
        "##BHEL@@" in only_code and "Rs. 285,000" not in only_code and "##BEHL@@" not in only_code
    )
    # a bad pattern is refused and the saved one stays
    assert (
        owner.patch(
            "/api/v1/shops/current", json={"price_code": {**PATTERN, "thousand": "L"}}
        ).status_code
        == 422
    )
    assert owner.get("/api/v1/shops/current").json()["price_code"]["thousand"] == "T"

    # a salesman: no pattern in the settings, no coded price on a sticker, no preview
    owner.post(
        "/api/v1/staff",
        json={"name": "Ali", "phone": "03211234567", "password": "secret123", "role": "salesman"},
    )
    ali = login(client, "03211234567")
    assert ali.get("/api/v1/shops/current").json()["price_code"] is None
    page = ali.get(url).text
    assert "##" not in page and "Rs. 285,000" in page
    assert (
        ali.post(
            "/api/v1/labels/price-code/preview", json={"pattern": PATTERN, "amounts": [1]}
        ).status_code
        == 403
    )

    # switched off again: back to the code word
    assert owner.patch("/api/v1/shops/current", json={"price_code": None}).status_code == 200
    assert "ASHBBB" in owner.get(url).text
