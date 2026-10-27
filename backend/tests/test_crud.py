"""Owner: every record can be added, changed and deleted.

Delete rules: nothing refers to it -> gone; has history -> archived (hidden, history kept);
money still owed / stock left -> refused with a clear message.
"""

from app.modules.expenses.service import seed_categories

IMEI = "490154203237518"


def _party(actor, name="Ali Raza", phone="03007777777", kinds=("customer",)):
    r = actor.post("/api/v1/parties", json={"name": name, "phone": phone, "kinds": list(kinds)})
    assert r.status_code == 201, r.text
    return r.json()


def test_party_without_history_is_deleted_and_number_reusable(owner):
    p = _party(owner)
    r = owner.delete(f"/api/v1/parties/{p['id']}")
    assert r.status_code == 200 and r.json()["result"] == "delete"
    assert owner.get(f"/api/v1/parties/{p['id']}").status_code == 404
    _party(owner, name="Ali New")


def test_party_with_history_is_archived_then_restored_by_same_number(owner, cat):
    sup = _party(owner, name="Rehman Traders", phone="03005555555", kinds=("supplier",))
    r = owner.post(
        "/api/v1/purchases",
        json={
            "kind": "supplier",
            "party_id": sup["id"],
            "devices": [
                {
                    "device": {
                        "imei1": IMEI,
                        "brand_id": cat["brand"]["id"],
                        "model_id": cat["model"]["id"],
                        "condition": "box_pack",
                        "pta_status": "pta_approved",
                    },
                    "cost": 1000,
                }
            ],
            "paid": 400,
        },
    )
    assert r.status_code == 201, r.text
    # still owes 600 -> refused
    r = owner.delete(f"/api/v1/parties/{sup['id']}")
    assert r.status_code == 409 and r.json()["error"]["code"] == "party_has_balance"
    pay = owner.post(
        "/api/v1/payments", json={"party_id": sup["id"], "direction": "out", "amount": 600}
    )
    assert pay.status_code == 201, pay.text
    r = owner.delete(f"/api/v1/parties/{sup['id']}")
    assert r.status_code == 200 and r.json()["result"] == "archive"
    assert all(x["id"] != sup["id"] for x in owner.get("/api/v1/parties").json())
    # history still reachable
    assert owner.get(f"/api/v1/parties/{sup['id']}").status_code == 200
    # adding the same number again brings the account back
    again = owner.post(
        "/api/v1/parties",
        json={"name": "Rehman Traders 2", "phone": "03005555555", "kinds": ["supplier"]},
    )
    assert (
        again.status_code == 201
        and again.json()["id"] == sup["id"]
        and again.json()["is_active"] is True
    )


def test_accessory_delete_needs_zero_stock(owner):
    a = owner.post(
        "/api/v1/accessories",
        json={
            "name": "Charger 20W",
            "category": "charger",
            "price": 900,
            "opening_qty": 2,
            "opening_cost": 500,
        },
    ).json()
    r = owner.delete(f"/api/v1/accessories/{a['id']}")
    assert r.status_code == 409 and r.json()["error"]["code"] == "accessory_has_stock"
    r = owner.patch(f"/api/v1/accessories/{a['id']}", json={"name": "Charger 25W", "price": 950})
    assert r.status_code == 200 and r.json()["name"] == "Charger 25W"
    b = owner.post(
        "/api/v1/accessories", json={"name": "Cable", "category": "cable", "price": 200}
    ).json()
    assert owner.delete(f"/api/v1/accessories/{b['id']}").json()["result"] == "delete"


def test_cash_account_rename_and_delete(owner):
    acc = owner.post("/api/v1/ledger/accounts", json={"kind": "easypaisa", "name": "EP"}).json()
    r = owner.patch(f"/api/v1/ledger/accounts/{acc['id']}", json={"name": "Easypaisa 0300"})
    assert r.status_code == 200 and r.json()["name"] == "Easypaisa 0300"
    assert owner.delete(f"/api/v1/ledger/accounts/{acc['id']}").json()["result"] == "delete"
    default = next(a for a in owner.get("/api/v1/ledger/accounts").json() if a["is_default"])
    r = owner.delete(f"/api/v1/ledger/accounts/{default['id']}")
    assert r.status_code == 409 and r.json()["error"]["code"] == "cash_account_default"
    rich = owner.post(
        "/api/v1/ledger/accounts", json={"kind": "bank", "name": "HBL", "opening_balance": 500}
    ).json()
    r = owner.delete(f"/api/v1/ledger/accounts/{rich['id']}")
    assert r.status_code == 409 and r.json()["error"]["code"] == "cash_account_has_balance"


def test_expense_category_and_expense_edit(db, owner):
    seed_categories(db)
    cats = owner.get("/api/v1/expenses/categories").json()
    rent = next(c for c in cats if c["key"] == "rent")
    assert (
        owner.patch(f"/api/v1/expenses/categories/{rent['id']}", json={"name": "X"}).status_code
        == 403
    )
    c = owner.post("/api/v1/expenses/categories", json={"name": "Generator"}).json()
    assert (
        owner.patch(
            f"/api/v1/expenses/categories/{c['id']}", json={"name": "Generator fuel"}
        ).json()["name"]
        == "Generator fuel"
    )
    e = owner.post("/api/v1/expenses", json={"category_id": c["id"], "amount": 500}).json()
    r = owner.put(
        f"/api/v1/expenses/{e['id']}",
        json={"category_id": c["id"], "amount": 450, "description": "fixed"},
    )
    assert r.status_code == 200, r.text
    new = r.json()
    assert new["id"] != e["id"] and new["amount"] == "450.00"
    assert owner.get(f"/api/v1/expenses/{e['id']}").json()["status"] == "voided"
    # category used by expenses -> archived, not deleted
    assert owner.delete(f"/api/v1/expenses/categories/{c['id']}").json()["result"] == "archive"
    assert all(x["id"] != c["id"] for x in owner.get("/api/v1/expenses/categories").json())


def test_device_details_edit_and_cancel_old_stock(owner, cat):
    r = owner.post(
        "/api/v1/devices/opening-stock",
        json={
            "imei1": IMEI,
            "brand_id": cat["brand"]["id"],
            "model_id": cat["model"]["id"],
            "condition": "used",
            "pta_status": "pta_approved",
            "warranty_months": 0,
            "cost_price": 800,
        },
    )
    d = r.json()
    other = next(
        m
        for m in owner.get(
            "/api/v1/catalogue/models", params={"brand_id": cat["brand"]["id"]}
        ).json()
        if m["id"] != cat["model"]["id"]
    )
    r = owner.patch(
        f"/api/v1/devices/{d['id']}",
        json={"model_id": other["id"], "colour_id": cat["colour"]["id"]},
    )
    assert r.status_code == 200 and r.json()["model_id"] == other["id"]
    r = owner.post(f"/api/v1/devices/{d['id']}/cancel-opening", json={"reason": "typed twice"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] != "in_stock"
    stock = owner.get("/api/v1/devices", params={"status": "in_stock"}).json()
    assert all(x["id"] != d["id"] for x in (stock["items"] if isinstance(stock, dict) else stock))
    # a second cancel is refused
    assert (
        owner.post(
            f"/api/v1/devices/{d['id']}/cancel-opening", json={"reason": "again"}
        ).status_code
        == 409
    )


def test_salesman_cannot_delete(client, owner):
    from tests.conftest import login

    owner.post(
        "/api/v1/staff",
        json={"name": "Sales", "phone": "03451112255", "password": "secret123", "role": "salesman"},
    )
    s = login(client, "03451112255")
    p = _party(owner)
    assert s.delete(f"/api/v1/parties/{p['id']}").status_code == 403
