"""A shop's receipt, 2026-11-26: on an 80 mm thermal printer the grey / light lines did not print.
Every 80 mm slip ends its style with `profile.THERMAL_INK` (pure black, semi-bold at least); an A4
page keeps its own look."""

from app.modules.auth.profile import THERMAL_INK
from tests.test_returns_audit import A, _buy, _customer, _sell, _supplier


def test_80mm_slips_print_in_full_black_and_a4_is_unchanged(owner, cat):
    p = _buy(owner, cat, _supplier(owner), [A], cost=30000)
    dev = p["lines"][0]["device_id"]
    s = _sell(owner, _customer(owner), [dev], price=35000)
    for path in (
        f"/api/v1/sales/{s['id']}/receipt?format=thermal",
        f"/api/v1/sales/{s['id']}/receipt?format=thermal&lang=ur",
        f"/api/v1/devices/{dev}/sheet?format=thermal",
    ):
        r = owner.get(path)
        assert r.status_code == 200, (path, r.text)
        html = r.text
        # the rule comes last in the style, so it wins over the grey of `small`
        assert THERMAL_INK in html, path
        assert html.index(THERMAL_INK) > html.index("small")
    for path in (
        f"/api/v1/sales/{s['id']}/receipt?format=a4",
        f"/api/v1/devices/{dev}/sheet?format=a4",
    ):
        r = owner.get(path)
        assert r.status_code == 200, (path, r.text)
        assert THERMAL_INK not in r.text, path
    assert "color:#000 !important" in THERMAL_INK and "font-weight:600" in THERMAL_INK
