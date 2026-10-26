"""FR-TXN-08: sale returns (refund / credit / income) and purchase returns to supplier."""

from tests.test_devices import _stock
from tests.test_purchases import _party

IMEI_A = "490154203237518"
IMEI_B = "356938035643809"


def _customer(owner):
    return _party(owner, name="Ahmed Khan", phone="03219876543", kinds=("customer",))


def _sell(owner, cat, customer, imei, price, paid, cost=None):
    d = _stock(
        owner,
        cat,
        imei=imei,
        condition="box_pack",
        cost_price=cost if cost is not None else price - 500,
        asking_price=price,
    )
    inv = owner.post(
        "/api/v1/sales",
        json={
            "party_id": customer["id"],
            "devices": [{"device_id": d["id"], "price": price}],
            "paid": paid,
        },
    ).json()
    return d, inv


def test_return_with_refund(owner, cat):
    c = _customer(owner)
    d, inv = _sell(owner, cat, c, IMEI_A, 1000, 1000)
    r = owner.post(
        "/api/v1/returns/sale",
        json={
            "invoice_id": inv["id"],
            "line_ids": [inv["lines"][0]["id"]],
            "settlement": "refund",
            "reason": "faulty mic",
        },
    )
    assert r.status_code == 201, r.text
    ret = r.json()
    assert (
        ret["no"] == "RET-000001"
        and ret["amount"] == "1000.00"
        and ret["refund_amount"] == "1000.00"
        and ret["party_balance_after"] == "0.00"
    )
    assert owner.get("/api/v1/ledger/accounts").json()[0]["balance"] == "0.00"
    dev = owner.get(f"/api/v1/devices/{d['id']}").json()
    assert dev["status"] == "in_stock" and dev["current_party_id"] is None
    got = owner.get(f"/api/v1/sales/{inv['id']}").json()
    assert (
        got["status"] == "returned"
        and got["returned_total"] == "1000.00"
        and got["balance_due"] == "0.00"
    )
    g = owner.get(f"/api/v1/ledger/groups/{ret['ledger_group_id']}").json()
    accts = {(e["account"], e["debit"], e["credit"]) for e in g["entries"]}
    assert (
        ("sales", "1000.00", "0.00") in accts
        and ("inventory", "500.00", "0.00") in accts
        and ("cogs", "0.00", "500.00") in accts
    )
    assert (
        owner.post(
            "/api/v1/returns/sale",
            json={"invoice_id": inv["id"], "line_ids": [inv["lines"][0]["id"]]},
        ).status_code
        == 409
    )


def test_nokia_s3_keep_500_as_income(owner, cat):
    """Shop B bought for 1,000, paid 500, returns the device; owner keeps the 500 as income."""
    b = _party(owner, name="Bilal Mobiles", phone="03001111111", kinds=("shop",))
    d, inv = _sell(owner, cat, b, IMEI_A, 1000, 500, cost=1000)
    assert owner.get(f"/api/v1/parties/{b['id']}").json()["balance"] == "500.00"
    r = owner.post(
        "/api/v1/returns/sale",
        json={
            "invoice_id": inv["id"],
            "line_ids": [inv["lines"][0]["id"]],
            "settlement": "income",
            "reason": "amanat fee",
        },
    )
    assert r.status_code == 201, r.text
    assert (
        r.json()["kept_amount"] == "500.00"
        and r.json()["refund_amount"] == "0.00"
        and r.json()["party_balance_after"] == "0.00"
    )
    g = owner.get(f"/api/v1/ledger/groups/{r.json()['ledger_group_id']}").json()
    assert next(e for e in g["entries"] if e["account"] == "other_income")["credit"] == "500.00"
    assert owner.get("/api/v1/ledger/accounts").json()[0]["balance"] == "500.00"
    hist = owner.get(f"/api/v1/devices/{d['id']}/history").json()
    assert (
        hist[-1]["type"] == "sale_returned"
        and hist[-1]["data"]["kept"] == "500.00"
        and hist[-1]["document_type"] == "sale_return"
    )


def test_return_as_credit_and_partial_invoice(owner, cat):
    c = _customer(owner)
    d1 = _stock(owner, cat, imei=IMEI_A, condition="box_pack", cost_price=800, asking_price=1000)
    d2 = _stock(owner, cat, imei=IMEI_B, condition="box_pack", cost_price=800, asking_price=1000)
    inv = owner.post(
        "/api/v1/sales",
        json={
            "party_id": c["id"],
            "devices": [
                {"device_id": d1["id"], "price": 1000},
                {"device_id": d2["id"], "price": 1000},
            ],
            "paid": 1500,
        },
    ).json()
    line1 = next(ln for ln in inv["lines"] if ln["device_id"] == d1["id"])
    r = owner.post(
        "/api/v1/returns/sale",
        json={"invoice_id": inv["id"], "line_ids": [line1["id"]], "settlement": "credit"},
    )
    assert r.status_code == 201, r.text
    assert r.json()["party_balance_after"] == "-500.00"  # paid 1,500 for 1,000 worth kept
    got = owner.get(f"/api/v1/sales/{inv['id']}").json()
    assert (
        got["status"] == "paid"
        and got["returned_total"] == "1000.00"
        and got["balance_due"] == "0.00"
    )
    assert owner.get(f"/api/v1/devices/{d1['id']}").json()["status"] == "in_stock"
    assert owner.get(f"/api/v1/devices/{d2['id']}").json()["status"] == "sold"
    # cannot refund more than the excess
    line2 = next(ln for ln in inv["lines"] if ln["device_id"] == d2["id"])
    r = owner.post(
        "/api/v1/returns/sale",
        json={
            "invoice_id": inv["id"],
            "line_ids": [line2["id"]],
            "settlement": "refund",
            "refund_amount": 5000,
        },
    )
    assert r.status_code == 422 and r.json()["error"]["code"] == "exceeds_excess"


def test_return_blocked_when_device_moved(owner, cat):
    c = _customer(owner)
    _d, inv = _sell(owner, cat, c, IMEI_A, 1000, 1000)
    # customer sells it back to us (trade-in) → new cycle; the old sale can no longer be "returned"
    owner.post(
        "/api/v1/purchases",
        json={
            "kind": "trade_in",
            "party_id": c["id"],
            "devices": [
                {
                    "device": {
                        "imei1": IMEI_A,
                        "brand_id": cat["brand"]["id"],
                        "model_id": cat["model"]["id"],
                        "condition": "used",
                    },
                    "cost": 700,
                }
            ],
        },
    )
    r = owner.post(
        "/api/v1/returns/sale", json={"invoice_id": inv["id"], "line_ids": [inv["lines"][0]["id"]]}
    )
    assert r.status_code == 409 and r.json()["error"]["code"] == "device_changed"


def test_purchase_return_to_supplier(owner, cat):
    sup = _party(owner)
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
                        "condition": "box_pack",
                    },
                    "cost": 4000,
                },
                {
                    "device": {
                        "imei1": IMEI_B,
                        "brand_id": cat["brand"]["id"],
                        "model_id": cat["model"]["id"],
                        "condition": "box_pack",
                    },
                    "cost": 4000,
                },
            ],
            "paid": 8000,
        },
    ).json()
    line = pur["lines"][0]
    r = owner.post(
        "/api/v1/returns/purchase",
        json={
            "purchase_id": pur["id"],
            "line_ids": [line["id"]],
            "refund_amount": 4000,
            "reason": "dead on arrival",
        },
    )
    assert r.status_code == 201, r.text
    assert (
        r.json()["kind"] == "purchase"
        and r.json()["amount"] == "4000.00"
        and r.json()["party_balance_after"] == "0.00"
    )
    assert owner.get("/api/v1/ledger/accounts").json()[0]["balance"] == "-4000.00"
    dev = owner.get(f"/api/v1/devices/{line['device_id']}").json()
    assert dev["status"] == "returned_to_supplier"
    got = owner.get(f"/api/v1/purchases/{pur['id']}").json()
    assert got["returned_total"] == "4000.00" and got["balance_due"] == "0.00"
    # second device without refund → supplier owes us (positive balance)
    r = owner.post(
        "/api/v1/returns/purchase",
        json={"purchase_id": pur["id"], "line_ids": [pur["lines"][1]["id"]]},
    )
    assert r.json()["party_balance_after"] == "4000.00"
    assert len(owner.get("/api/v1/returns", params={"kind": "purchase"}).json()) == 2


def test_return_with_cut_and_walk_in(owner, cat):
    """Owner's case: phone sold for 100,000, comes back; shop cuts 10,000 and hands back 90,000.
    Also works for a walk-in cash sale once the person's name and phone are written."""
    from tests.test_devices import _stock
    from tests.test_purchases import _party

    ali = _party(owner, name="Ali Return", phone="03214445555", kinds=("customer",))
    d1 = _stock(
        owner,
        cat,
        imei="490154203237518",
        condition="box_pack",
        cost_price=80000,
        asking_price=100000,
    )
    d2 = _stock(
        owner,
        cat,
        imei="356938035643809",
        condition="box_pack",
        cost_price=40000,
        asking_price=50000,
    )
    inv = owner.post(
        "/api/v1/sales",
        json={
            "party_id": ali["id"],
            "devices": [{"device_id": d1["id"], "price": 100000}],
            "paid": 100000,
        },
    ).json()
    r = owner.post(
        "/api/v1/returns/sale",
        json={
            "invoice_id": inv["id"],
            "line_ids": [inv["lines"][0]["id"]],
            "settlement": "refund",
            "refund_amount": 90000,
            "kept_amount": 10000,
            "reason": "customer did not like it",
        },
    )
    assert r.status_code == 201, r.text
    assert r.json()["refund_amount"] == "90000.00" and r.json()["kept_amount"] == "10000.00"
    assert r.json()["party_balance_after"] == "0.00"
    assert owner.get(f"/api/v1/devices/{d1['id']}").json()["status"] == "in_stock"

    # walk-in: refused without a person, then settled in full with one
    cash = owner.post(
        "/api/v1/sales", json={"devices": [{"device_id": d2["id"], "price": 50000}], "paid": 50000}
    ).json()
    body = {
        "invoice_id": cash["id"],
        "line_ids": [cash["lines"][0]["id"]],
        "settlement": "refund",
        "refund_amount": 45000,
        "kept_amount": 5000,
    }
    r = owner.post("/api/v1/returns/sale", json=body)
    assert r.status_code == 422 and r.json()["error"]["code"] == "return_needs_customer"
    walker = _party(owner, name="Walk In", phone="03216667777", kinds=("customer",))
    r = owner.post(
        "/api/v1/returns/sale", json={**body, "party_id": walker["id"], "refund_amount": 40000}
    )
    assert r.status_code == 422 and r.json()["error"]["code"] == "walk_in_settle_all"
    r = owner.post("/api/v1/returns/sale", json={**body, "party_id": walker["id"]})
    assert r.status_code == 201, r.text
    assert r.json()["party_balance_after"] == "0.00"
    hist = owner.get(f"/api/v1/devices/{d2['id']}/history").json()
    assert hist[-1]["type"] == "sale_returned" and hist[-1]["party_name"] == "Walk In"

    day = owner.get("/api/v1/reports/day").json()
    assert day["returns_refunded"] == "135000.00" and day["returns_kept"] == "15000.00"
