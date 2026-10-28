"""Owner (2026-10-28): paying by cash, online (bank app / wallet), cheque, or a remittance from abroad,
on sales and purchases — easy, to the point, and findable later."""

from tests.test_devices import _stock
from tests.test_purchases import _party
from tests.test_reports_owner import A, B, C
from tests.test_returns import _customer


def _sale(owner, cat, imei, price, payment, party=None):
    d = _stock(
        owner, cat, imei=imei, condition="box_pack", cost_price=price - 100, asking_price=price
    )
    body = {"devices": [{"device_id": d["id"], "price": price}], "paid": price, "payment": payment}
    if party:
        body["party_id"] = party["id"]
    return owner.post("/api/v1/sales", json=body)


def _balances(owner):
    return {a["name"]: a["balance"] for a in owner.get("/api/v1/ledger/accounts").json()}


def test_online_cheque_and_remittance_land_in_their_own_accounts(owner, cat):
    r = _sale(
        owner, cat, A, 1000, {"method": "online", "bank": "Meezan Bank", "reference": "TID778812"}
    )
    assert r.status_code == 201, r.text
    sale = r.json()
    assert sale["payment"]["method"] == "online" and sale["payment"]["bank"] == "Meezan Bank"
    receipt = owner.get(f"/api/v1/sales/{sale['id']}/receipt?format=thermal&lang=en").text
    assert "Online · Meezan Bank · Ref TID778812" in receipt

    c = _customer(owner)
    r = _sale(
        owner,
        cat,
        B,
        2000,
        {"method": "cheque", "bank": "HBL", "reference": "00123456", "cheque_date": "2026-11-05"},
        c,
    )
    assert r.status_code == 201, r.text

    r = _sale(
        owner,
        cat,
        C,
        37100,
        {
            "method": "remittance",
            "currency": "SAR",
            "foreign_amount": 500,
            "rate": 74.2,
            "sender_name": "Ahmed Raza",
            "country": "Saudi Arabia",
            "service": "Western Union",
            "reference": "MTCN 1234567890",
        },
        c,
    )
    assert r.status_code == 201, r.text
    pay = r.json()["payment"]
    assert (
        pay["currency"] == "SAR"
        and pay["foreign_amount"] == "500.00"
        and pay["sender_name"] == "Ahmed Raza"
    )

    bal = _balances(owner)
    assert (
        bal["Bank / Online"] == "1000.00"
        and bal["Cheques"] == "2000.00"
        and bal["Remittance"] == "37100.00"
    )
    assert bal["Cash"] == "0.00"


def test_wallet_goes_to_the_shops_own_wallet_account_and_details_are_checked(owner, cat):
    ep = owner.post("/api/v1/ledger/accounts", json={"kind": "easypaisa", "name": "Shop Easypaisa"})
    assert ep.status_code == 201, ep.text
    assert _sale(owner, cat, A, 1000, {"method": "online", "bank": "Easypaisa"}).status_code == 201
    assert _balances(owner)["Shop Easypaisa"] == "1000.00"
    # what each way of paying needs (refused before anything is saved)
    dev = owner.get(f"/api/v1/devices/imei/{A}").json()["device"]
    for bad in (
        {"method": "online"},
        {"method": "cheque", "bank": "HBL"},
        {"method": "remittance", "currency": "AED"},
    ):
        body = {"devices": [{"device_id": dev["id"], "price": 1000}], "paid": 1000, "payment": bad}
        assert owner.post("/api/v1/sales", json=body).status_code == 422
    # plain cash keeps working and needs no details
    cash = _sale(owner, cat, B, 1000, {"method": "cash"})
    assert cash.status_code == 201 and cash.json()["payment"] is None


def test_purchase_paid_online(owner, cat):
    sup = _party(owner, name="Dealer One", phone="03005556666", kinds=("supplier",))
    r = owner.post(
        "/api/v1/purchases",
        json={
            "kind": "supplier",
            "party_id": sup["id"],
            "devices": [
                {
                    "device": {
                        "imei1": A,
                        "brand_id": cat["brand"]["id"],
                        "model_id": cat["model"]["id"],
                        "condition": "box_pack",
                        "pta_status": "pta_approved",
                    },
                    "cost": 1000,
                }
            ],
            "paid": 1000,
            "payment": {"method": "online", "bank": "Bank Alfalah", "reference": "IBFT-55"},
        },
    )
    assert r.status_code == 201, r.text
    assert r.json()["payment"]["bank"] == "Bank Alfalah"
    assert _balances(owner)["Bank / Online"] == "-1000.00"
