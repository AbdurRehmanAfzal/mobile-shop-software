"""Owner 2026-11-03: an item's own GST % is used on the sale bill when the bill is taxed. Phones and
items without a rate take the bill's rate; a sale without tax stays without tax; with no own rate
anywhere the bill is computed exactly as before."""

from tests.test_accessories import _acc
from tests.test_devices import _stock


def test_item_gst_on_a_taxed_bill(owner, cat):
    item = _acc(owner, opening_qty=10, opening_cost=500, tax_rate=5)
    assert owner.get(f"/api/v1/accessories/{item['id']}/price").json()["tax_rate"] == "5.00"
    dev = _stock(
        owner,
        cat,
        imei="490154203237518",
        cost_price=8000,
        asking_price=10000,
        condition="box_pack",
    )
    # walk-in pays in full: compute the total first
    r = owner.post(
        "/api/v1/sales",
        json={
            "devices": [{"device_id": dev["id"], "price": 10000}],
            "misc": [
                {"description": "item", "accessory_id": item["id"], "qty": 2, "unit_price": 1000}
            ],
            "tax_rate": 18,
            "paid": 13900,
        },
    )
    assert r.status_code == 201, r.text
    inv = r.json()
    # phone 10,000 × 18% = 1,800; item 2,000 × its own 5% = 100
    assert inv["tax_amount"] == "1900.00" and inv["total"] == "13900.00"
    shares = sorted(ln["tax_share"] for ln in inv["lines"])
    assert shares == ["100.00", "1800.00"]
    # the printed bill does not claim one rate
    page = owner.get(f"/api/v1/sales/{inv['id']}/receipt", params={"lang": "en"}).text
    assert "(by item)" in page and "18%" not in page


def test_untaxed_bill_and_no_own_rate_stay_as_before(owner, cat):
    plain = _acc(owner, opening_qty=10, opening_cost=500)
    taxed_item = _acc(owner, name="Glass", sku="GL1", opening_qty=10, opening_cost=100, tax_rate=5)
    d1 = _stock(
        owner,
        cat,
        imei="490154203237518",
        cost_price=8000,
        asking_price=10000,
        condition="box_pack",
    )
    d2 = _stock(
        owner,
        cat,
        imei="356938035643809",
        cost_price=8000,
        asking_price=10000,
        condition="box_pack",
    )
    # no tax on the sale: the item's rate does not add tax by itself
    r = owner.post(
        "/api/v1/sales",
        json={
            "devices": [{"device_id": d1["id"], "price": 10000}],
            "misc": [
                {
                    "description": "item",
                    "accessory_id": taxed_item["id"],
                    "qty": 1,
                    "unit_price": 1000,
                }
            ],
            "tax_rate": 0,
            "paid": 11000,
        },
    )
    assert r.status_code == 201, r.text
    assert r.json()["tax_amount"] == "0.00" and r.json()["total"] == "11000.00"
    # no item with its own rate: one rate on the whole bill, as before
    r = owner.post(
        "/api/v1/sales",
        json={
            "devices": [{"device_id": d2["id"], "price": 10000}],
            "misc": [
                {"description": "item", "accessory_id": plain["id"], "qty": 2, "unit_price": 1000}
            ],
            "tax_rate": 18,
            "discount": 500,
            "paid": 13570,
        },
    )
    assert r.status_code == 201, r.text
    inv = r.json()
    assert inv["tax_amount"] == "2070.00" and inv["total"] == "13570.00"
    page = owner.get(f"/api/v1/sales/{inv['id']}/receipt", params={"lang": "en"}).text
    assert "18%" in page and "(by item)" not in page
