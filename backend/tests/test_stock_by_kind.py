"""Accessories shop 2026-11-21 (ADR-121): the stock screen's type chips carry what is on hand of
each kind — one more key on the existing summary, nothing else about it changed."""

from tests.test_devices import _stock

IMEI_A = "490154203237518"
IMEI_B = "356938035643809"


def test_stock_status_counts_each_kind(owner, cat):
    empty = owner.get("/api/v1/devices/stock-status").json()
    assert empty["by_kind"] == {} and empty["units"]["on_hand"] == 0
    _stock(owner, cat, imei=IMEI_A, condition="box_pack", cost_price=3000, asking_price=3500)
    _stock(owner, cat, imei=IMEI_B, condition="used", cost_price=2000, asking_price=2500)
    owner.post(
        "/api/v1/accessories",
        json={"name": "Cable", "category": "cable", "opening_qty": 7, "opening_cost": 100},
    )
    s = owner.get("/api/v1/devices/stock-status").json()
    assert s["by_kind"] == {"phone": 2}
    assert s["units"]["on_hand"] == 2 and s["items"]["on_hand"] == 7  # as before
    # one kind asked for: only its own count
    assert owner.get("/api/v1/devices/stock-status?category=phone").json()["by_kind"] == {
        "phone": 2
    }
    assert owner.get("/api/v1/devices/stock-status?category=tablet").json()["by_kind"] == {}
