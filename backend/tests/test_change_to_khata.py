"""Owner 2026-11-06: the customer hands over more cash than the bill — the change goes back, or, when
they owe the shop from before, the extra is kept against their old udhaar (a payment in, with the
sale, allocated to their oldest open bills)."""

from tests.test_devices import _stock
from tests.test_purchases import _party

A = "490154203237518"
B = "356938035643809"


def _phone(owner, cat, imei, price):
    return _stock(
        owner, cat, imei=imei, condition="box_pack", cost_price=price - 1000, asking_price=price
    )


def test_extra_cash_goes_to_old_udhaar(owner, cat):
    c = _party(owner, name="Ahmed Khan", phone="03219876543", kinds=("customer",))
    # an old bill: Rs. 10,000, Rs. 7,000 paid, Rs. 3,000 still owed
    d1 = _phone(owner, cat, A, 10000)
    old = owner.post(
        "/api/v1/sales",
        json={
            "party_id": c["id"],
            "devices": [{"device_id": d1["id"], "price": 10000}],
            "paid": 7000,
        },
    ).json()
    assert old["balance_due"] == "3000.00"

    # today: a Rs. 2,000 cover, he gives Rs. 5,000 — Rs. 3,000 against the old bill, no change
    sale = {
        "party_id": c["id"],
        "misc": [{"description": "Cover", "qty": 1, "unit_price": 2000}],
        "paid": 2000,
        "cash_tendered": 5000,
        "payment": {"method": "cash"},
    }
    # more than he owes from before: refused
    r = owner.post("/api/v1/sales", json={**sale, "cash_tendered": 6000, "khata_adjust": 4000})
    assert r.json()["error"]["code"] == "adjust_exceeds_due"
    # more than the extra he handed over: refused
    r = owner.post("/api/v1/sales", json={**sale, "khata_adjust": 3500})
    assert r.json()["error"]["code"] == "adjust_exceeds_extra"
    # a walk-in customer has no khata to adjust
    r = owner.post("/api/v1/sales", json={**sale, "party_id": None, "khata_adjust": 1000})
    assert r.json()["error"]["code"] == "adjust_needs_customer"

    r = owner.post("/api/v1/sales", json={**sale, "khata_adjust": 3000})
    assert r.status_code == 201, r.text
    inv = r.json()
    assert inv["khata_adjusted"] == "3000.00" and inv["cash_tendered"] == "5000.00"
    assert inv["status"] == "paid"
    # the old bill is now paid and the customer owes nothing
    assert owner.get(f"/api/v1/sales/{old['id']}").json()["status"] == "paid"
    assert owner.get(f"/api/v1/parties/{c['id']}").json()["balance"] == "0.00"
    pays = owner.get("/api/v1/payments", params={"party_id": c["id"]}).json()
    assert any(p["amount"] == "3000.00" and p["direction"] == "in" for p in pays)
    # the bill shows it: cash given 5,000, against old udhaar 3,000, change 0
    html = owner.client.get(
        f"/api/v1/sales/{inv['id']}/receipt", params={"lang": "en"}, headers=owner.headers()
    ).text
    assert "Taken against old udhaar" in html and ">3,000<" in html and ">5,000<" in html


def test_walk_in_bill_and_plain_change(owner, cat):
    d = _phone(owner, cat, B, 2000)
    r = owner.post(
        "/api/v1/sales",
        json={
            "devices": [{"device_id": d["id"], "price": 2000}],
            "paid": 2000,
            "cash_tendered": 5000,
        },
    )
    assert r.status_code == 201, r.text
    inv = r.json()
    assert inv["khata_adjusted"] is None
    html = owner.client.get(
        f"/api/v1/sales/{inv['id']}/receipt", params={"lang": "en"}, headers=owner.headers()
    ).text
    assert "Walk-in customer" in html and ">3,000<" in html
    assert "Taken against old udhaar" not in html
