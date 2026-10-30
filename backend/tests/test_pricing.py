"""Owner (2026-10-30): the rate suggestion comes from the shop's own recent sales of the same model."""

from tests.conftest import login
from tests.test_devices import _stock

IMEIS = ["490154203237518", "356938035643809", "353879234567891", "358812091717195"]


def _sell(owner, device, price):
    r = owner.post(
        "/api/v1/sales",
        json={
            "devices": [{"device_id": device["id"], "price": price}],
            "paid": price,
            "override_reason": "known seller",
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


def test_price_hint_from_own_sales(owner, client, cat):
    model = cat["model"]["id"]
    q = f"model_id={model}&storage_id={cat['storage']['id']}&condition=used"
    # nothing sold yet
    h = owner.get(f"/api/v1/devices/price-hint?{q}").json()
    assert h["basis"] == "none" and h["samples"] == 0 and h["suggested"] is None

    a = _stock(owner, cat, imei=IMEIS[0], condition="used", cost_price=800, asking_price=1000)
    b = _stock(owner, cat, imei=IMEIS[1], condition="used", cost_price=850, asking_price=1100)
    c = _stock(owner, cat, imei=IMEIS[2], condition="box_pack", cost_price=1500, asking_price=1800)
    _sell(owner, a, 1000)
    _sell(owner, b, 1240)
    _sell(owner, c, 1800)
    d = _stock(owner, cat, imei=IMEIS[3], condition="used", cost_price=900, asking_price=1300)

    h = owner.get(f"/api/v1/devices/price-hint?{q}").json()
    assert h["basis"] == "exact" and h["samples"] == 2
    assert h["last"]["price"] == "1240.00" and h["low"] == "1000.00" and h["high"] == "1240.00"
    assert h["median"] == "1120.00" and h["suggested"] == "1100.00"  # rounded to the hundred
    assert h["cost_median"] == "825.00"  # the owner sees what they were bought for
    assert h["in_stock_same"] == 1 and h["stock_asking_low"] == "1300.00"
    assert h["last"]["days_to_sell"] == 0 and h["avg_days_to_sell"] == 0.0

    # one box-pack sale only: falls back to every sale of the model
    h2 = owner.get(f"/api/v1/devices/price-hint?model_id={model}&condition=box_pack").json()
    assert h2["basis"] == "model" and h2["samples"] == 3 and h2["high"] == "1800.00"

    # the phone being priced is not counted as "same in stock"; a salesman gets no cost
    h3 = owner.get(f"/api/v1/devices/price-hint?{q}&exclude_device_id={d['id']}").json()
    assert h3["in_stock_same"] == 0
    owner.post(
        "/api/v1/staff",
        json={"name": "Ali", "phone": "03211234567", "password": "secret123", "role": "salesman"},
    )
    ali = login(client, "03211234567")
    h4 = ali.get(f"/api/v1/devices/price-hint?{q}").json()
    assert h4["suggested"] == "1100.00" and h4["cost_median"] is None
