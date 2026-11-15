"""Owner 2026-11-15 (ADR-081): a phone bought from someone turns out faulty and is given back. The
record keeps both (bought, then returned to the seller); the money settles: what the shop still owed
is cancelled, what it had paid comes back — less any cut the seller keeps (the shop's loss)."""

from tests.test_purchases import IMEI_A, _party


def _buy(owner, cat, cost=50000, paid=25000):
    sup = _party(owner, name="Seller Khan", phone="03007775555")
    pur = owner.post(
        "/api/v1/purchases",
        json={
            "kind": "supplier",
            "party_id": sup["id"],
            "devices": [
                {
                    "device": {
                        "imei1": IMEI_A,
                        "brand_id": cat["brand"]["id"],
                        "model_id": cat["model"]["id"],
                        "condition": "used",
                    },
                    "cost": cost,
                }
            ],
            "paid": paid,
        },
    )
    assert pur.status_code == 201, pur.text
    return sup, pur.json()


def _balance(owner, party_id):
    return owner.get(f"/api/v1/parties/{party_id}").json()["balance"]


def test_owner_example_full_return_balance_zero(owner, cat):
    """50,000 phone, 25,000 paid, 25,000 still to give: returned, the seller hands the 25,000 back
    and the 25,000 the shop owed is gone — balance zero"""
    sup, pur = _buy(owner, cat)
    assert _balance(owner, sup["id"]) == "-25000.00"  # the shop owes 25,000
    cash_before = owner.get("/api/v1/ledger/accounts").json()[0]["balance"]
    r = owner.post(
        "/api/v1/returns/purchase",
        json={
            "purchase_id": pur["id"],
            "line_ids": [pur["lines"][0]["id"]],
            "refund_amount": 25000,
            "reason": "Faulty",
        },
    )
    assert r.status_code == 201, r.text
    assert r.json()["party_balance_after"] == "0.00"
    cash_after = owner.get("/api/v1/ledger/accounts").json()[0]["balance"]
    assert float(cash_after) - float(cash_before) == 25000
    dev = owner.get(f"/api/v1/devices/{pur['lines'][0]['device_id']}").json()
    assert dev["status"] == "returned_to_supplier"
    # bought, then returned: the purchase stays, its line marked returned
    again = owner.get(f"/api/v1/purchases/{pur['id']}").json()
    assert again["status"] == "posted" and again["lines"][0]["returned_at"]
    assert again["returned_total"] == "50000.00"


def test_return_with_a_cut(owner, cat):
    """the seller takes it back for 5,000 less: of the 25,000 paid only 20,000 comes back"""
    _sup, pur = _buy(owner, cat)
    line = pur["lines"][0]["id"]
    too_much = owner.post(
        "/api/v1/returns/purchase",
        json={
            "purchase_id": pur["id"],
            "line_ids": [line],
            "cut_amount": 5000,
            "refund_amount": 46000,
        },
    )
    assert too_much.status_code == 422
    r = owner.post(
        "/api/v1/returns/purchase",
        json={
            "purchase_id": pur["id"],
            "line_ids": [line],
            "cut_amount": 5000,
            "refund_amount": 20000,
            "reason": "Faulty",
        },
    )
    assert r.status_code == 201, r.text
    assert r.json()["kept_amount"] == "5000.00" and r.json()["party_balance_after"] == "0.00"
    # the cut is the shop's loss, in the profit report
    pl = owner.get("/api/v1/reports/profit-loss").json()
    assert "5000" in str(pl)


def test_seller_pays_later(owner, cat):
    """nothing handed back today: the seller owes the shop 25,000 in his khata"""
    sup, pur = _buy(owner, cat)
    r = owner.post(
        "/api/v1/returns/purchase",
        json={"purchase_id": pur["id"], "line_ids": [pur["lines"][0]["id"]], "refund_amount": 0},
    )
    assert r.status_code == 201, r.text
    assert _balance(owner, sup["id"]) == "25000.00"  # he owes the shop


def test_cut_cannot_exceed_value(owner, cat):
    _sup, pur = _buy(owner, cat)
    r = owner.post(
        "/api/v1/returns/purchase",
        json={"purchase_id": pur["id"], "line_ids": [pur["lines"][0]["id"]], "cut_amount": 60000},
    )
    assert r.status_code == 422
