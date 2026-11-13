"""Owner 2026-11-13: a phone may carry its serial number too (optional, under the IMEIs); it is
cleaned like any serial, added or corrected later by Edit details."""

from tests.test_devices import _stock
from tests.test_reports_owner import A, B


def test_phone_serial_optional_saved_and_edited(owner, cat):
    d = _stock(owner, cat, imei=A, condition="box_pack", serial="f2l-xk9 abcd")
    assert d["imei1"] == A and d["serial"] == "F2LXK9ABCD"
    plain = _stock(owner, cat, imei=B, condition="box_pack")
    assert plain["serial"] is None
    r = owner.patch(f"/api/v1/devices/{plain['id']}", json={"serial": "dnpx 12ab"})
    assert r.status_code == 200, r.text
    assert r.json()["serial"] == "DNPX12AB" and r.json()["imei1"] == B
    assert owner.patch(f"/api/v1/devices/{plain['id']}", json={"serial": "x"}).status_code == 422
