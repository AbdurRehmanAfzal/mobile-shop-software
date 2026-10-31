"""Shop Audit P8 (docs/17): the owner's security feed — every bent number or rule, with who did
it; managers and salesmen never see it."""

from app.core.security import hash_pin
from tests.conftest import login
from tests.test_devices import _stock
from tests.test_price_rules import _set_owner_pin
from tests.test_purchases import _party

A, B, C, D = "490154203237518", "356938035643809", "352099001761481", "358812091717195"


def test_security_feed_collects_every_kind_and_flags_people(owner, client, cat):
    owner.post(
        "/api/v1/staff",
        json={"name": "Ali", "phone": "03211234567", "password": "secret123", "role": "salesman"},
    )
    owner.post(
        "/api/v1/staff",
        json={"name": "Mina", "phone": "03211234568", "password": "secret123", "role": "manager"},
    )
    ali, mina = login(client, "03211234567"), login(client, "03211234568")
    cus = _party(owner, name="Ahmed", phone="03001111111", kinds=("customer",))
    a = _stock(owner, cat, imei=A, condition="box_pack", cost_price=800, asking_price=1000)
    b = _stock(owner, cat, imei=B, condition="box_pack", cost_price=800, asking_price=1000)
    c = _stock(owner, cat, imei=C, condition="box_pack", cost_price=800, asking_price=1000)
    d = _stock(owner, cat, imei=D, cost_price=800, asking_price=1000)  # used → ID check pending
    # asking changed at checkout + sold under asking (owner), discount (owner), below cost (owner)
    assert (
        owner.post(
            "/api/v1/sales",
            json={
                "devices": [
                    {
                        "device_id": a["id"],
                        "price": 900,
                        "new_asking_price": 950,
                        "asking_reason": "market",
                    }
                ],
                "paid": 900,
            },
        ).status_code
        == 201
    )
    assert (
        owner.post(
            "/api/v1/sales",
            json={
                "party_id": cus["id"],
                "devices": [{"device_id": b["id"], "price": 1000}],
                "discount": 100,
                "paid": 900,
            },
        ).status_code
        == 201
    )
    r = owner.post(
        "/api/v1/sales",
        json={
            "devices": [{"device_id": c["id"], "price": 700}],
            "paid": 700,
            "below_cost_ok": True,
        },
    )
    assert r.status_code == 201, r.text
    r.json()
    # void by the owner, a wrong PIN by Ali under the "pin" rule, a bypass by Ali, an opening balance
    v = _stock(
        owner, cat, imei="358812091717197", condition="box_pack", cost_price=800, asking_price=1000
    )
    inv_v = owner.post(
        "/api/v1/sales", json={"devices": [{"device_id": v["id"], "price": 1000}], "paid": 1000}
    ).json()
    assert owner.post(
        f"/api/v1/sales/{inv_v['id']}/void", json={"reason": "wrong phone"}
    ).status_code in (200, 201)
    owner.patch(
        "/api/v1/shops/current",
        json={"sale_rules": {"below_asking": "pin", "asking_change": "pin"}},
    )
    _set_owner_pin(client, owner.me["user"]["id"], hash_pin("4321"))
    e = _stock(
        owner, cat, imei="358812091717196", condition="box_pack", cost_price=800, asking_price=1000
    )
    assert (
        ali.post(
            "/api/v1/sales",
            json={
                "devices": [{"device_id": e["id"], "price": 900}],
                "paid": 900,
                "approval_pin": "0000",
            },
        ).status_code
        == 403
    )
    assert (
        ali.post(
            "/api/v1/sales",
            json={
                "devices": [{"device_id": e["id"], "price": 900}],
                "paid": 900,
                "approval_pin": "4321",
            },
        ).status_code
        == 201
    )
    assert ali.post(
        f"/api/v1/devices/{d['id']}/verification/override", json={"reason": "known"}
    ).status_code in (200, 201)
    assert (
        owner.post(
            f"/api/v1/ledger/parties/{cus['id']}/opening-balance",
            json={"amount": 500, "party_owes": True},
        ).status_code
        == 201
    )

    f = owner.get("/api/v1/shop-audit/security", params={"preset": "this_month"}).json()
    c_ = f["counts"]
    assert (
        c_["asking_changed"] == 1 and c_["below_asking"] == 3 and c_["below_cost"] == 1
    )  # the under-cost sale is under asking too
    assert c_["discount"] == 1 and c_["void"] == 1 and c_["pin_wrong"] == 1
    assert (
        c_["bypass"] == 1
        and c_["opening_balance"] == 1
        and f["total"] == 11
        and c_["reversal"] == 1
    )  # the void also reversed its ledger group
    kinds = {r["kind"]: r for r in f["rows"]}
    assert (
        kinds["asking_changed"]["before"] == "1000.00"
        and kinds["asking_changed"]["after"] == "950.00"
        and kinds["asking_changed"]["reason"] == "market"
    )
    assert (
        kinds["discount"]["amount"] == "100.00" and kinds["discount"]["link"]["type"] == "invoice"
    )
    assert kinds["below_cost"]["amount"] == "-100.00" and kinds["below_cost"]["label"].endswith(C)
    assert kinds["void"]["reason"] == "wrong phone" and kinds["void"]["label"] == inv_v["no"]
    assert (
        kinds["pin_wrong"]["user_name"] == "Ali"
        and kinds["bypass"]["user_name"] == "Ali"
        and kinds["bypass"]["reason"] == "known"
    )
    under = [r for r in f["rows"] if r["kind"] == "below_asking"]
    assert any(
        r["user_name"] == "Ali" and r["approved_by"] == owner.me["user"]["name"] for r in under
    )
    assert kinds["opening_balance"]["label"] == "Ahmed"
    users = {u["user_name"]: u for u in f["by_user"]}
    assert (
        users["Ali"]["kinds"] == {"below_asking": 1, "pin_wrong": 1, "bypass": 1}
        and users["Ali"]["flags"] == []
    )
    assert users[owner.me["user"]["name"]]["total"] == 8
    # filters
    only = owner.get(
        "/api/v1/shop-audit/security", params={"preset": "this_month", "kind": "void"}
    ).json()
    assert [r["kind"] for r in only["rows"]] == ["void"] and only["total"] == 11
    assert owner.get("/api/v1/shop-audit/security", params={"kind": "gossip"}).status_code == 422
    # three wrong PINs flag the person (on a phone still in stock)
    g = _stock(
        owner, cat, imei="358812091717198", condition="box_pack", cost_price=800, asking_price=1000
    )
    for _ in range(2):
        ali.post(
            "/api/v1/sales",
            json={
                "devices": [{"device_id": g["id"], "price": 900}],
                "paid": 900,
                "approval_pin": "1111",
            },
        )
    f = owner.get("/api/v1/shop-audit/security", params={"preset": "this_month"}).json()
    assert "pin_wrong" in {u["user_name"]: u for u in f["by_user"]}["Ali"]["flags"]
    assert f["by_user"][0]["user_name"] == "Ali"
    # owner only
    assert mina.get("/api/v1/shop-audit/security").status_code == 403
    assert ali.get("/api/v1/shop-audit/security").status_code == 403
    assert mina.get("/api/v1/shop-audit/overview").status_code == 200
