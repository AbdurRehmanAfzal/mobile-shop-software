"""FR-TXN-05: payments in/out, FIFO and explicit allocation, invoice/purchase paid status, void."""

from tests.conftest import login
from tests.test_devices import _stock
from tests.test_purchases import _party

IMEI_A = "490154203237518"
IMEI_B = "356938035643809"


def _sale(owner, cat, customer, imei, price, paid):
    d = _stock(
        owner, cat, imei=imei, condition="box_pack", cost_price=price - 1000, asking_price=price
    )
    return owner.post(
        "/api/v1/sales",
        json={
            "party_id": customer["id"],
            "devices": [{"device_id": d["id"], "price": price}],
            "paid": paid,
        },
    ).json()


def test_s4_partial_payments_clear_the_account_fifo(owner, cat):
    c = _party(owner, name="Ahmed Khan", phone="03219876543", kinds=("customer",))
    inv = _sale(owner, cat, c, IMEI_A, 50000, 30000)
    assert inv["status"] == "partially_paid"
    r = owner.post(
        "/api/v1/payments",
        json={
            "party_id": c["id"],
            "direction": "in",
            "amount": 10000,
            "method": "easypaisa",
            "reference": "TX1",
        },
    )
    assert r.status_code == 201, r.text
    p1 = r.json()
    assert (
        p1["no"] == "PAY-000001"
        and p1["allocations"][0]["document_no"] == inv["no"]
        and p1["allocations"][0]["amount"] == "10000.00"
        and p1["unallocated"] == "0.00"
    )
    assert p1["party_balance_after"] == "10000.00"
    assert owner.get(f"/api/v1/sales/{inv['id']}").json()["paid"] == "40000.00"
    p2 = owner.post(
        "/api/v1/payments", json={"party_id": c["id"], "direction": "in", "amount": 10000}
    ).json()
    assert p2["party_balance_after"] == "0.00"
    got = owner.get(f"/api/v1/sales/{inv['id']}").json()
    assert got["status"] == "paid" and got["balance_due"] == "0.00"
    st = owner.get(f"/api/v1/ledger/parties/{c['id']}/statement").json()
    assert st["closing_balance"] == "0.00" and [row["balance"] for row in st["rows"]] == [
        "50000.00",
        "20000.00",
        "10000.00",
        "0.00",
    ]
    assert owner.get("/api/v1/ledger/accounts").json()[0]["balance"] == "50000.00"


def test_fifo_spreads_over_two_invoices_and_keeps_advance(owner, cat):
    c = _party(owner, name="Ahmed Khan", phone="03219876543", kinds=("customer",))
    i1 = _sale(owner, cat, c, IMEI_A, 10000, 0)
    i2 = _sale(owner, cat, c, IMEI_B, 5000, 0)
    p = owner.post(
        "/api/v1/payments", json={"party_id": c["id"], "direction": "in", "amount": 16000}
    ).json()
    assert [(a["document_no"], a["amount"]) for a in p["allocations"]] == [
        (i1["no"], "10000.00"),
        (i2["no"], "5000.00"),
    ]
    assert (
        p["unallocated"] == "1000.00" and p["party_balance_after"] == "-1000.00"
    )  # advance: we owe the customer
    assert owner.get(f"/api/v1/sales/{i2['id']}").json()["status"] == "paid"


def test_explicit_allocation_and_over_allocation(owner, cat):
    c = _party(owner, name="Ahmed Khan", phone="03219876543", kinds=("customer",))
    i1 = _sale(owner, cat, c, IMEI_A, 10000, 0)
    i2 = _sale(owner, cat, c, IMEI_B, 5000, 0)
    r = owner.post(
        "/api/v1/payments",
        json={
            "party_id": c["id"],
            "direction": "in",
            "amount": 5000,
            "allocations": [{"document_type": "invoice", "document_id": i2["id"], "amount": 5000}],
        },
    )
    assert (
        r.status_code == 201 and owner.get(f"/api/v1/sales/{i2['id']}").json()["status"] == "paid"
    )
    assert owner.get(f"/api/v1/sales/{i1['id']}").json()["status"] == "open"
    r = owner.post(
        "/api/v1/payments",
        json={
            "party_id": c["id"],
            "direction": "in",
            "amount": 20000,
            "allocations": [{"document_type": "invoice", "document_id": i1["id"], "amount": 20000}],
        },
    )
    assert r.status_code == 422 and r.json()["error"]["code"] == "over_allocation"
    r = owner.post(
        "/api/v1/payments",
        json={
            "party_id": c["id"],
            "direction": "in",
            "amount": 100,
            "allocations": [{"document_type": "invoice", "document_id": i1["id"], "amount": 200}],
        },
    )
    assert r.status_code == 422 and r.json()["error"]["code"] == "allocation_exceeds_amount"


def test_payment_out_to_supplier_and_void(owner, cat):
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
                    "cost": 8000,
                }
            ],
            "paid": 2000,
        },
    ).json()
    assert owner.get(f"/api/v1/parties/{sup['id']}").json()["balance"] == "-6000.00"
    p = owner.post(
        "/api/v1/payments",
        json={"party_id": sup["id"], "direction": "out", "amount": 6000, "method": "bank"},
    ).json()
    assert p["allocations"][0]["document_no"] == pur["no"] and p["party_balance_after"] == "0.00"
    assert owner.get(f"/api/v1/purchases/{pur['id']}").json()["balance_due"] == "0.00"
    # wrong direction allocation rejected
    r = owner.post(
        "/api/v1/payments",
        json={
            "party_id": sup["id"],
            "direction": "in",
            "amount": 10,
            "allocations": [{"document_type": "purchase", "document_id": pur["id"], "amount": 10}],
        },
    )
    assert r.status_code == 422
    r = owner.post(f"/api/v1/payments/{p['id']}/void", json={"reason": "bounced cheque"})
    assert (
        r.status_code == 200
        and r.json()["status"] == "voided"
        and r.json()["unallocated"] == "0.00"
    )
    assert owner.get(f"/api/v1/parties/{sup['id']}").json()["balance"] == "-6000.00"
    assert owner.get(f"/api/v1/purchases/{pur['id']}").json()["balance_due"] == "6000.00"


def test_roles_and_isolation(client, owner, other_owner, cat):
    c = _party(owner, name="Ahmed Khan", phone="03219876543", kinds=("customer",))
    owner.post(
        "/api/v1/staff",
        json={"name": "Sales", "phone": "03451112233", "password": "secret123", "role": "salesman"},
    )
    s = login(client, "03451112233")
    p = s.post(
        "/api/v1/payments", json={"party_id": c["id"], "direction": "in", "amount": 500}
    ).json()
    assert p["no"].startswith("PAY-")
    assert (
        s.post(f"/api/v1/payments/{p['id']}/void", json={"reason": "nope nope"}).status_code == 403
    )
    assert other_owner.get(f"/api/v1/payments/{p['id']}").status_code == 404
    assert (
        other_owner.post(
            "/api/v1/payments", json={"party_id": c["id"], "direction": "in", "amount": 5}
        ).status_code
        == 404
    )
