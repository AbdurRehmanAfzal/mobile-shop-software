"""Owner 2026-11-12 (ADR-065): a sale put on "Walk-in customer" (or the wrong person) by mistake is
moved to the right customer after the sale. Nothing is erased: the khata shows the bill, the phone's
history says who it was and who it is now; cash never moves."""

from tests.conftest import login
from tests.test_devices import _stock
from tests.test_purchases import _party
from tests.test_reports_owner import A, B, C


def _bal(owner, p):
    return owner.get(f"/api/v1/parties/{p['id']}").json()["balance"]


def _cash(owner):
    return owner.get("/api/v1/ledger/accounts").json()[0]["balance"]


def _sell(owner, cat, imei, price, paid, party=None):
    d = _stock(owner, cat, imei=imei, condition="box_pack", cost_price=500, asking_price=price)
    body = {"devices": [{"device_id": d["id"], "price": price}], "paid": paid}
    if party:
        body["party_id"] = party["id"]
    r = owner.post("/api/v1/sales", json=body)
    assert r.status_code == 201, r.text
    return r.json(), d["id"]


def test_walk_in_sale_put_on_a_customer(client, owner, cat):
    imran = _party(owner, name="Imran Ali", phone="03006666111", kinds=("customer",))
    sale, dev = _sell(owner, cat, A, 1000, 1000)
    assert sale["party_id"] is None
    cash = _cash(owner)
    url = f"/api/v1/sales/{sale['id']}/customer"

    r = owner.post(url, json={"party_id": imran["id"], "reason": "salesman picked walk-in"})
    assert r.status_code == 200, r.text
    assert r.json()["party_id"] == imran["id"]
    # paid in full at the sale: nothing owed, cash unchanged, the khata shows the bill
    assert _bal(owner, imran) == "0.00"
    assert _cash(owner) == cash
    st = owner.get(f"/api/v1/ledger/parties/{imran['id']}/statement").json()
    assert len(st["rows"]) == 2
    # the phone now shows its buyer; history keeps the change
    assert owner.get(f"/api/v1/devices/{dev}").json()["current_party_id"] == imran["id"]
    fix = next(
        e for e in owner.get(f"/api/v1/devices/{dev}/history").json() if e["type"] == "corrected"
    )
    assert fix["data"]["field"] == "customer"
    assert (fix["data"]["from"], fix["data"]["to"]) == (None, "Imran Ali")
    # the same person again
    assert (
        owner.post(url, json={"party_id": imran["id"], "reason": "x1"}).json()["error"]["code"]
        == "same_party"
    )
    # a salesman may not
    owner.post(
        "/api/v1/staff",
        json={"name": "Sales", "phone": "03451112233", "password": "secret123", "role": "salesman"},
    )
    s = login(client, "03451112233")
    assert s.post(url, json={"party_id": imran["id"], "reason": "x1"}).status_code == 403


def test_udhaar_sale_moved_between_customers(owner, cat):
    wrong = _party(owner, name="Wrong Buyer", phone="03006666222", kinds=("customer",))
    right = _party(owner, name="Right Buyer", phone="03006666333", kinds=("customer",))
    sale, _dev = _sell(owner, cat, B, 1000, 400, wrong)
    assert _bal(owner, wrong) == "600.00"
    r = owner.post(
        f"/api/v1/sales/{sale['id']}/customer", json={"party_id": right["id"], "reason": "wrong"}
    )
    assert r.status_code == 200, r.text
    assert _bal(owner, wrong) == "0.00"
    assert _bal(owner, right) == "600.00"

    # once money was received against it later, refused
    sale2, _ = _sell(owner, cat, C, 1000, 0, right)
    pay = owner.post(
        "/api/v1/payments",
        json={
            "party_id": right["id"],
            "direction": "in",
            "amount": 200,
            "allocations": [
                {"document_type": "invoice", "document_id": sale2["id"], "amount": 200}
            ],
        },
    )
    assert pay.status_code == 201, pay.text
    r = owner.post(
        f"/api/v1/sales/{sale2['id']}/customer", json={"party_id": wrong["id"], "reason": "x1"}
    )
    assert r.status_code == 409 and r.json()["error"]["code"] == "sale_has_later_money"
