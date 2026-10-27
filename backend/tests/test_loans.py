"""FR-TXN-06: loans (amanat) to other shops — out, return, settle as sale. Includes the Nokia chain S1–S3."""

from tests.test_devices import _stock
from tests.test_purchases import _party

IMEI = "490154203237518"


def _shop_b(owner):
    return _party(owner, name="Bilal Mobiles", phone="03001111111", kinds=("shop",))


def test_loan_out_and_return(owner, cat):
    d = _stock(owner, cat, imei=IMEI, condition="box_pack")
    b = _shop_b(owner)
    customer = _party(owner, name="Sara", phone="03002222222", kinds=("customer",))
    r = owner.post("/api/v1/loans", json={"device_id": d["id"], "party_id": customer["id"]})
    assert r.status_code == 422 and r.json()["error"]["code"] == "loan_party_must_be_shop"
    r = owner.post(
        "/api/v1/loans",
        json={
            "device_id": d["id"],
            "party_id": b["id"],
            "expected_back_at": "2020-01-01",
            "notes": "gahak ko dikhana",
        },
    )
    assert r.status_code == 201, r.text
    loan = r.json()
    assert (
        loan["status"] == "out"
        and loan["overdue"] is True
        and loan["party_name"] == "Bilal Mobiles"
        and loan["imei1"] == IMEI
    )
    assert owner.get(f"/api/v1/devices/{d['id']}").json()["status"] == "on_loan"
    assert (
        owner.post("/api/v1/loans", json={"device_id": d["id"], "party_id": b["id"]}).status_code
        == 409
    )
    # generic events endpoint no longer accepts loan events
    assert (
        owner.post(f"/api/v1/devices/{d['id']}/events", json={"type": "loan_returned"}).status_code
        == 422
    )
    assert [x["id"] for x in owner.get("/api/v1/loans", params={"status": "out"}).json()] == [
        loan["id"]
    ]
    r = owner.post(f"/api/v1/loans/{loan['id']}/return", json={"notes": "wapas aa gaya"})
    assert r.status_code == 200 and r.json()["status"] == "returned"
    assert owner.get(f"/api/v1/devices/{d['id']}").json()["status"] == "in_stock"
    assert owner.post(f"/api/v1/loans/{loan['id']}/return", json={}).status_code == 409


def test_nokia_chain_s1_s2_s3(owner, cat):
    """Buy from Ali (walk-in), loan to Shop B, Shop B sells & pays 500 of 1,000, device comes back, sold to Sara for 1,500."""
    ali = _party(owner, name="Ali Raza", phone="03007777777", kinds=("customer",))
    b = _shop_b(owner)
    sara = _party(owner, name="Sara Ahmed", phone="03002222222", kinds=("customer",))
    # S1 purchase 1,000 cash + verification clear
    pur = owner.post(
        "/api/v1/purchases",
        json={
            "kind": "walk_in",
            "party_id": ali["id"],
            "devices": [
                {
                    "device": {
                        "imei1": IMEI,
                        "brand_id": cat["brand"]["id"],
                        "model_id": cat["model"]["id"],
                        "condition": "used",
                        "pta_status": "pta_approved",
                    },
                    "cost": 1000,
                }
            ],
            "paid": 1000,
        },
    ).json()
    dev_id = pur["lines"][0]["device_id"]
    owner.put(
        f"/api/v1/devices/{dev_id}/verification",
        json={
            "seller_party_id": ali["id"],
            "cnic_no": "33100-1234567-1",
            "cnic_front_path": f"{owner.shop_id}/f.png",
            "cnic_back_path": f"{owner.shop_id}/b.png",
            "seller_photo_path": f"{owner.shop_id}/s.png",
            "egadget_result": "clear",
            "declaration_signed": True,
        },
    )
    assert owner.get(f"/api/v1/devices/{dev_id}").json()["verification_status"] == "clear"
    assert owner.get("/api/v1/ledger/accounts").json()[0]["balance"] == "-1000.00"
    # S2 loan to shop B, then B sells it: invoice to B for 1,000, B pays 500
    loan = owner.post("/api/v1/loans", json={"device_id": dev_id, "party_id": b["id"]}).json()
    r = owner.post(f"/api/v1/loans/{loan['id']}/sell", json={"price": 1000, "paid": 500})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "sold" and r.json()["invoice_id"]
    inv = owner.get(f"/api/v1/sales/{r.json()['invoice_id']}").json()
    assert (
        inv["party_name"] == "Bilal Mobiles"
        and inv["loan_id"] == loan["id"]
        and inv["balance_due"] == "500.00"
    )
    assert owner.get(f"/api/v1/parties/{b['id']}").json()["balance"] == "500.00"
    dev = owner.get(f"/api/v1/devices/{dev_id}").json()
    assert dev["status"] == "sold" and dev["current_party_name"] == "Bilal Mobiles"
    # S3 comes back: void the sale to B (money reversed → B's 500 becomes an advance, owner may keep as income via returns module later)
    r = owner.post(
        f"/api/v1/sales/{inv['id']}/void", json={"reason": "Shop B's customer returned it"}
    )
    assert r.status_code == 200
    assert owner.get(f"/api/v1/devices/{dev_id}").json()["status"] == "in_stock"
    assert (
        owner.get(f"/api/v1/parties/{b['id']}").json()["balance"] == "0.00"
    )  # void = full reversal incl. the 500 (returns module offers keep-as-credit)
    # sold to Sara for 1,500 paid in full
    inv2 = owner.post(
        "/api/v1/sales",
        json={
            "party_id": sara["id"],
            "devices": [{"device_id": dev_id, "price": 1500}],
            "paid": 1500,
        },
    ).json()
    assert inv2["status"] == "paid" and inv2["profit"] == "500.00"
    hist = owner.get(f"/api/v1/devices/{dev_id}/history").json()
    assert [h["type"] for h in hist] == [
        "purchased",
        "verified",
        "loaned_out",
        "sold",
        "sale_returned",
        "sold",
    ]
    assert [h["party_name"] for h in hist] == [
        "Ali Raza",
        "Ali Raza",
        "Bilal Mobiles",
        "Bilal Mobiles",
        "Bilal Mobiles",
        "Sara Ahmed",
    ]
    assert (
        owner.get("/api/v1/ledger/accounts").json()[0]["balance"] == "500.00"
    )  # -1000 +500 -500 +1500
    assert owner.get("/api/v1/devices/imei/" + IMEI).json()["times_bought"] == 1
