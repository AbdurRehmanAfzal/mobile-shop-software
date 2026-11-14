"""Owner 2026-11-10 (ADR-063): the purchase price of a phone typed wrong is put right by the owner
or manager while the phone is still in the shop. Nothing is erased: a correction group moves the
difference between stock and the seller's khata, the bill and the phone follow, history keeps both."""

from tests.conftest import login
from tests.test_corrections_after_purchase import _buy
from tests.test_purchases import IMEI_B, _party


def _bal(owner, party):
    return owner.get(f"/api/v1/parties/{party['id']}").json()["balance"]


def test_purchase_price_put_right(client, owner, cat):
    sup = _party(owner, name="Cost Traders", phone="03003333333")
    p = _buy(owner, cat, sup, cost=10000, paid=4000)
    dev = p["lines"][0]["device_id"]
    assert _bal(owner, sup) == "-6000.00"
    url = "/api/v1/purchases/cost"

    # up: 10,000 -> 12,000 — the dealer is owed 2,000 more, stock is worth 2,000 more
    r = owner.post(url, json={"device_id": dev, "cost": 12000, "reason": "typed 10 instead of 12"})
    assert r.status_code == 200, r.text
    assert r.json()["total"] == "12000.00" and r.json()["paid"] == "4000.00"
    assert _bal(owner, sup) == "-8000.00"
    assert owner.get(f"/api/v1/devices/{dev}").json()["cost_price"] == "12000.00"
    # cash did not move
    assert owner.get("/api/v1/ledger/accounts").json()[0]["balance"] == "-4000.00"
    fix = next(
        e for e in owner.get(f"/api/v1/devices/{dev}/history").json() if e["type"] == "corrected"
    )
    assert fix["data"]["field"] == "cost"
    assert (fix["data"]["from"], fix["data"]["to"]) == ("10000.00", "12000.00")

    # down below what was paid: the dealer now owes the shop
    r = owner.post(url, json={"device_id": dev, "cost": 3000, "reason": "it was 3,000"})
    assert r.status_code == 200, r.text
    assert _bal(owner, sup) == "1000.00"
    assert owner.get(f"/api/v1/devices/{dev}").json()["cost_price"] == "3000.00"

    # the same price again; no reason
    assert (
        owner.post(url, json={"device_id": dev, "cost": 3000, "reason": "x1"}).json()["error"][
            "code"
        ]
        == "same_cost"
    )
    assert owner.post(url, json={"device_id": dev, "cost": 5000}).status_code == 422

    # staff may not
    owner.post(
        "/api/v1/staff",
        json={"name": "Sales", "phone": "03451112233", "password": "secret123", "role": "salesman"},
    )
    s = login(client, "03451112233")
    assert s.post(url, json={"device_id": dev, "cost": 5000, "reason": "x1"}).status_code == 403

    # once sold, refused (the sale already took the cost into profit)
    p2 = _buy(owner, cat, sup, imei=IMEI_B, cost=1000)
    dev2 = p2["lines"][0]["device_id"]
    sale = owner.post(
        "/api/v1/sales", json={"devices": [{"device_id": dev2, "price": 1500}], "paid": 1500}
    )
    assert sale.status_code == 201, sale.text
    r = owner.post(url, json={"device_id": dev2, "cost": 900, "reason": "x1"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "cost_after_sale"


def test_price_typed_wrong_and_paid_right_moves_cash_not_khata(owner, cat):
    """Owner 2026-11-14 (ADR-073): typed 40,000 and paid 40,000 in cash, but 45,000 was really paid —
    'typing mistake' takes the 5,000 out of the galla, the seller's khata stays clear. And typed
    30,000 for a 25,000 phone (25,000 really paid): 5,000 back into the galla."""
    sup = _party(owner, name="Typo Seller", phone="03004445555")
    p = _buy(owner, cat, sup, cost=40000, paid=40000)
    dev = p["lines"][0]["device_id"]
    cash0 = owner.get("/api/v1/ledger/accounts").json()[0]["balance"]
    r = owner.post(
        "/api/v1/purchases/cost",
        json={"device_id": dev, "cost": 45000, "reason": "typed 40 not 45", "mode": "paid"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["total"] == "45000.00" and r.json()["paid"] == "45000.00"
    assert _bal(owner, sup) == "0.00"
    cash1 = owner.get("/api/v1/ledger/accounts").json()[0]["balance"]
    assert float(cash1) == float(cash0) - 5000
    assert owner.get(f"/api/v1/devices/{dev}").json()["cost_price"] == "45000.00"

    p2 = _buy(owner, cat, sup, imei=IMEI_B, cost=30000, paid=30000)
    dev2 = p2["lines"][0]["device_id"]
    r = owner.post(
        "/api/v1/purchases/cost",
        json={"device_id": dev2, "cost": 25000, "reason": "typed 30 not 25", "mode": "paid"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["paid"] == "25000.00" and _bal(owner, sup) == "0.00"
    assert float(owner.get("/api/v1/ledger/accounts").json()[0]["balance"]) == float(cash1) - 25000


def test_typing_mistake_needs_money_paid(owner, cat):
    sup = _party(owner, name="Udhaar Seller", phone="03004446666")
    p = _buy(owner, cat, sup, cost=10000, paid=0)
    r = owner.post(
        "/api/v1/purchases/cost",
        json={
            "device_id": p["lines"][0]["device_id"],
            "cost": 8000,
            "reason": "typed",
            "mode": "paid",
        },
    )
    assert r.status_code == 422 and r.json()["error"]["code"] == "paid_out_of_range"
