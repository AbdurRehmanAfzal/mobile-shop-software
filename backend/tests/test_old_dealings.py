"""Owner 2026-11-19 (ADR-110): a shop that starts the software today has old dealings — phones
that went to another shop or a customer before, part paid, the IMEIs not known. They are entered
on the person's khata as what went, what was settled and what is left; no stock and no profit are
touched, and a wrong entry is taken back by a reversing entry."""

from tests.conftest import login
from tests.test_purchases import _party

ITEMS = [
    {"description": "Apple iPhone 17", "qty": 5, "rate": 300000},
    {"description": "Samsung A56", "qty": 10, "rate": 95000},
    {"description": "Realme 14", "qty": 5, "rate": 40000},
]  # 1,500,000 + 950,000 + 200,000 = 2,650,000


def _tb(owner):
    return {
        r["key"]: float(r["debit"]) - float(r["credit"])
        for r in owner.get("/api/v1/reports/trial-balance").json()["rows"]
    }


def test_old_dealing_with_goods_and_what_is_left(owner, client):
    shop_a = _party(owner, name="Shop A", phone="03001110001", kinds=("shop",))
    r = owner.post(
        f"/api/v1/ledger/parties/{shop_a['id']}/opening-balance",
        json={
            "party_owes": True,
            "items": ITEMS,
            "settled": 2000000,
            "as_of": "2026-11-01",
            "memo": "from the register",
            "amount": 1,  # ignored: with goods the server adds them up itself
        },
    )
    assert r.status_code == 201, r.text
    # what is left is on his khata: 2,650,000 - 2,000,000
    assert float(owner.get(f"/api/v1/parties/{shop_a['id']}").json()["balance"]) == 650000
    row = owner.get(f"/api/v1/ledger/parties/{shop_a['id']}/statement").json()["rows"][-1]
    assert row["document_type"] == "opening_balance" and float(row["debit"]) == 650000
    memo = row["memo"]
    assert "Apple iPhone 17 × 5 @ 300,000 = 1,500,000" in memo
    assert "Samsung A56 × 10 @ 95,000 = 950,000" in memo
    assert "Total 2,650,000" in memo and "Settled before 2,000,000" in memo
    assert "Left 650,000" in memo and "2026-11-01" in memo and "from the register" in memo

    # nothing entered the stock and no sale or profit was made up
    assert owner.get("/api/v1/devices").json() == []
    tb = _tb(owner)
    assert tb.get("inventory", 0) == 0 and tb.get("sales", 0) == 0 and tb.get("cogs", 0) == 0
    assert sum(tb.values()) == 0  # the books still balance

    # he pays part of the old balance like any other money
    p = owner.post(
        "/api/v1/payments", json={"party_id": shop_a["id"], "direction": "in", "amount": 150000}
    )
    assert p.status_code == 201 and float(p.json()["party_balance_after"]) == 500000

    lst = owner.get(f"/api/v1/ledger/parties/{shop_a['id']}/opening-balances").json()
    assert len(lst) == 1 and float(lst[0]["amount"]) == 650000
    assert lst[0]["party_owes"] is True and lst[0]["deleted"] is False

    # a salesman can neither enter nor undo an old balance
    owner.post(
        "/api/v1/staff",
        json={"name": "Ali", "phone": "03211234567", "password": "secret123", "role": "salesman"},
    )
    ali = login(client, "03211234567")
    body = {"party_owes": True, "amount": 100}
    assert (
        ali.post(f"/api/v1/ledger/parties/{shop_a['id']}/opening-balance", json=body).status_code
        == 403
    )
    undo = f"/api/v1/ledger/opening-balances/{lst[0]['group_id']}/undo"
    assert ali.post(undo, json={"reason": "wrong"}).status_code == 403

    # entered wrongly: taken back, kept on the khata as deleted, never twice
    assert owner.post(undo, json={"reason": "x"}).status_code == 422  # a reason is needed
    r = owner.post(undo, json={"reason": "wrong shop"})
    assert r.status_code == 200, r.text
    assert float(owner.get(f"/api/v1/parties/{shop_a['id']}").json()["balance"]) == -150000
    lst = owner.get(f"/api/v1/ledger/parties/{shop_a['id']}/opening-balances").json()
    assert len(lst) == 1 and lst[0]["deleted"] is True
    assert owner.post(undo, json={"reason": "again"}).status_code == 409
    assert sum(_tb(owner).values()) == 0


def test_only_an_amount_and_money_we_owe(owner):
    dealer = _party(owner, name="Old Dealer", phone="03001110002", kinds=("supplier",))
    url = f"/api/v1/ledger/parties/{dealer['id']}/opening-balance"
    r = owner.post(url, json={"party_owes": False, "amount": 80000, "memo": "old bill 112"})
    assert r.status_code == 201, r.text
    assert float(owner.get(f"/api/v1/parties/{dealer['id']}").json()["balance"]) == -80000
    lst = owner.get(f"/api/v1/ledger/parties/{dealer['id']}/opening-balances").json()
    assert lst[0]["party_owes"] is False and float(lst[0]["amount"]) == 80000
    assert lst[0]["memo"] == "old bill 112"
    # goods we took from him before, part paid: we still owe the rest
    r = owner.post(
        url,
        json={
            "party_owes": False,
            "items": [{"description": "Vivo Y19", "qty": 4, "rate": 30000}],
            "settled": 100000,
        },
    )
    assert r.status_code == 201
    assert float(owner.get(f"/api/v1/parties/{dealer['id']}").json()["balance"]) == -100000

    # nothing to enter: neither an amount nor goods; goods fully settled
    assert owner.post(url, json={"party_owes": True}).status_code == 422
    r = owner.post(
        url,
        json={
            "party_owes": True,
            "items": [{"description": "Vivo Y19", "qty": 1, "rate": 30000}],
            "settled": 30000,
        },
    )
    assert r.status_code == 422 and r.json()["error"]["code"] == "old_nothing_left"
    bad = {"party_owes": True, "items": [{"description": "X", "qty": 0, "rate": 10}]}
    assert owner.post(url, json=bad).status_code == 422


def test_only_an_old_balance_is_undone_here_and_only_in_its_own_shop(owner, other_owner, cat):
    a = _party(owner, name="Shop A", phone="03001110001", kinds=("shop",))
    g = owner.post(
        f"/api/v1/ledger/parties/{a['id']}/opening-balance",
        json={"party_owes": True, "amount": 5000},
    ).json()
    # another shop sees neither the list nor the entry
    assert other_owner.get(f"/api/v1/ledger/parties/{a['id']}/opening-balances").status_code == 404
    undo = f"/api/v1/ledger/opening-balances/{g['id']}/undo"
    assert other_owner.post(undo, json={"reason": "not mine"}).status_code == 404
    # a purchase bill is not undone through this door
    dealer = _party(owner, name="Dealer", phone="03001110003", kinds=("supplier",))
    pur = owner.post(
        "/api/v1/purchases",
        json={
            "kind": "supplier",
            "party_id": dealer["id"],
            "devices": [
                {
                    "device": {
                        "imei1": "490154203237518",
                        "brand_id": cat["brand"]["id"],
                        "model_id": cat["model"]["id"],
                        "condition": "box_pack",
                        "pta_status": "pta_approved",
                    },
                    "cost": 1000,
                }
            ],
        },
    ).json()
    r = owner.post(
        f"/api/v1/ledger/opening-balances/{pur['ledger_group_id']}/undo",
        json={"reason": "not this"},
    )
    assert r.status_code == 422 and r.json()["error"]["code"] == "not_an_opening_balance"
