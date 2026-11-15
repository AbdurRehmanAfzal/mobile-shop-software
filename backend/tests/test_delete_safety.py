"""Owner 2026-11-15 (ADR-090): every entry can be deleted, and deleting never leaves the books
half-undone. An exchange is deleted as one (both phones, the refund, the khata as before); one half
alone is refused; a sale or purchase with a later payment against it waits until that payment is
deleted."""

from tests.test_exchange_return_settlement import A, B, _balance, _cash, _exchange, _sold


def _device(owner, imei):
    return owner.get("/api/v1/devices", params={"q": imei}).json()[0]


def test_exchange_deleted_as_one(owner, cat):
    cus, _a, b, _sale = _sold(owner, cat, paid=80000)
    cash0, bal0 = _cash(owner), _balance(owner, cus)
    # trade-in 70,000 for B at 60,000: the shop owes 10,000 and pays it out
    r = _exchange(owner, cat, cus, b, price=60000, refund=10000)
    assert r.status_code == 201, r.text
    ex = r.json()
    assert _cash(owner) != cash0

    # both bills know their exchange (the app offers "Delete this exchange" there)
    assert owner.get(f"/api/v1/sales/{ex['invoice_id']}").json()["exchange_id"] == ex["id"]
    assert owner.get(f"/api/v1/purchases/{ex['purchase_id']}").json()["exchange_id"] == ex["id"]
    # one half alone is refused
    half = owner.post(f"/api/v1/sales/{ex['invoice_id']}/void", json={"reason": "mistake"})
    assert half.status_code == 409 and half.json()["error"]["code"] == "sale_has_later_money"
    half = owner.post(f"/api/v1/purchases/{ex['purchase_id']}/void", json={"reason": "mistake"})
    assert half.status_code == 409 and half.json()["error"]["code"] == "purchase_has_later_money"

    d = owner.post(f"/api/v1/exchanges/{ex['id']}/void", json={"reason": "entered by mistake"})
    assert d.status_code == 200, d.text
    assert d.json()["deleted"] is True
    # the galla and the khata are back where they were; B is in stock again; both bills Deleted
    assert _cash(owner) == cash0
    assert _balance(owner, cus) == bal0
    assert _device(owner, B)["status"] == "in_stock"
    assert owner.get(f"/api/v1/sales/{ex['invoice_id']}").json()["status"] == "void"
    assert owner.get(f"/api/v1/purchases/{ex['purchase_id']}").json()["status"] == "voided"
    again = owner.post(f"/api/v1/exchanges/{ex['id']}/void", json={"reason": "twice"})
    assert again.status_code == 409


def test_sale_with_later_payment_waits_for_it(owner, cat):
    cus, _a, _b, sale = _sold(owner, cat, paid=50000)  # 30,000 udhaar
    pay = owner.post(
        "/api/v1/payments",
        json={"party_id": cus["id"], "direction": "in", "amount": 30000},
    )
    assert pay.status_code == 201, pay.text
    r = owner.post(f"/api/v1/sales/{sale['id']}/void", json={"reason": "mistake"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "sale_has_later_money"
    # delete the payment first, then the sale goes
    assert (
        owner.post(f"/api/v1/payments/{pay.json()['id']}/void", json={"reason": "mistake"})
    ).status_code == 200
    r = owner.post(f"/api/v1/sales/{sale['id']}/void", json={"reason": "mistake"})
    assert r.status_code == 200, r.text
    assert _balance(owner, cus) == "0.00"
    assert _device(owner, A)["status"] == "in_stock"


def test_payment_and_lending_edited_in_place(owner, cat):
    cus, _a, _b, sale = _sold(owner, cat, paid=50000)  # 30,000 udhaar
    cash0 = _cash(owner)
    pay = owner.post(
        "/api/v1/payments", json={"party_id": cus["id"], "direction": "in", "amount": 3000}
    ).json()
    # typed 3,000 instead of 30,000: Edit
    r = owner.put(f"/api/v1/payments/{pay['id']}", json={"amount": 30000, "reason": "typo"})
    assert r.status_code == 200, r.text
    new = r.json()
    assert new["id"] != pay["id"] and new["amount"] == "30000.00"
    assert _balance(owner, cus) == "0.00"
    assert float(_cash(owner)) == float(cash0) + 30000
    old = owner.get(f"/api/v1/payments/{pay['id']}").json()
    assert old["status"] == "voided" and new["no"] in old["void_reason"]
    assert owner.get(f"/api/v1/sales/{sale['id']}").json()["status"] == "paid"
    # editing the replaced one again is refused
    assert (
        owner.put(f"/api/v1/payments/{pay['id']}", json={"amount": 1, "reason": "again"})
    ).status_code == 409

    # len-den keeps its purpose and direction
    lend = owner.post(
        "/api/v1/payments",
        json={"party_id": cus["id"], "direction": "out", "amount": 5000, "purpose": "lending"},
    ).json()
    e = owner.put(f"/api/v1/payments/{lend['id']}", json={"amount": 500, "reason": "was 500"})
    assert e.status_code == 200, e.text
    assert (e.json()["purpose"], e.json()["direction"]) == ("lending", "out")
    assert _balance(owner, cus) == "500.00"


def test_sale_return_undone(owner, cat):
    from tests.test_exchange_return_settlement import _return

    cus, _a, _b, sale = _sold(owner, cat, paid=80000)
    cash0, bal0 = _cash(owner), _balance(owner, cus)
    r = _return(owner, sale, settlement="refund", refund_amount=30000, kept_amount=0)
    assert r.status_code == 201, r.text
    ret = r.json()
    assert _device(owner, A)["status"] == "in_stock"
    u = owner.post(f"/api/v1/returns/{ret['id']}/void", json={"reason": "returned by mistake"})
    assert u.status_code == 200, u.text
    assert u.json()["status"] == "voided"
    # back as it was before the return: sold to Ali, the bill paid, the galla and khata unchanged
    assert _device(owner, A)["status"] == "sold"
    assert _cash(owner) == cash0 and _balance(owner, cus) == bal0
    bill = owner.get(f"/api/v1/sales/{sale['id']}").json()
    assert bill["status"] == "paid" and bill["returned_total"] == "0.00"
    assert not bill["lines"][0]["returned_at"]
    again = owner.post(f"/api/v1/returns/{ret['id']}/void", json={"reason": "twice"})
    assert again.status_code == 409
    # it can be returned again afterwards, properly
    assert _return(owner, sale, settlement="credit").status_code == 201


def test_purchase_return_undone_and_refused_once_moved(owner, cat):
    from tests.test_purchase_return_cut import _balance as pbal
    from tests.test_purchase_return_cut import _buy

    sup, pur = _buy(owner, cat)
    cash0, bal0 = _cash(owner), pbal(owner, sup["id"])
    line = pur["lines"][0]
    r = owner.post(
        "/api/v1/returns/purchase",
        json={"purchase_id": pur["id"], "line_ids": [line["id"]], "refund_amount": 25000},
    )
    assert r.status_code == 201, r.text
    u = owner.post(f"/api/v1/returns/{r.json()['id']}/void", json={"reason": "wrong phone"})
    assert u.status_code == 200, u.text
    dev = owner.get(f"/api/v1/devices/{line['device_id']}").json()
    assert dev["status"] == "in_stock"
    assert _cash(owner) == cash0 and pbal(owner, sup["id"]) == bal0
    p = owner.get(f"/api/v1/purchases/{pur['id']}").json()
    assert p["returned_total"] == "0.00" and not p["lines"][0]["returned_at"]

    # returned again, then the undo of a return whose phone moved on is refused
    r2 = owner.post(
        "/api/v1/returns/purchase",
        json={"purchase_id": pur["id"], "line_ids": [line["id"]], "refund_amount": 25000},
    ).json()
    owner.post(
        "/api/v1/purchases",
        json={
            "kind": "supplier",
            "party_id": sup["id"],
            "devices": [
                {
                    "device": {
                        "imei1": dev["imei1"],
                        "brand_id": cat["brand"]["id"],
                        "model_id": cat["model"]["id"],
                        "condition": "used",
                    },
                    "cost": 40000,
                }
            ],
            "paid": 40000,
        },
    )
    bad = owner.post(f"/api/v1/returns/{r2['id']}/void", json={"reason": "late"})
    assert bad.status_code == 409 and bad.json()["error"]["code"] == "device_changed"


def test_stock_adjustment_undone(owner):
    from tests.test_accessories import _acc

    a = _acc(owner, opening_qty=10, opening_cost=450)
    r = owner.post(f"/api/v1/accessories/{a['id']}/adjust", json={"qty_delta": -3, "note": "lost?"})
    assert r.status_code == 200, r.text
    mv = next(
        m
        for m in owner.get(f"/api/v1/accessories/{a['id']}/movements").json()
        if m["reason"] == "adjust"
    )
    u = owner.post(
        f"/api/v1/accessories/{a['id']}/movements/{mv['id']}/undo", json={"reason": "found them"}
    )
    assert u.status_code == 200, u.text
    assert u.json()["qty"] == 10
    # the stock loss is gone from the books: the stock value is back to 10 x 450
    assert u.json()["avg_cost"] == "450.00"
    again = owner.post(
        f"/api/v1/accessories/{a['id']}/movements/{mv['id']}/undo", json={"reason": "twice"}
    )
    assert again.status_code == 409
    moves = owner.get(f"/api/v1/accessories/{a['id']}/movements").json()
    assert any(m["document_type"] == "adjust_undo" and m["document_id"] == mv["id"] for m in moves)


def test_loan_cancelled(owner, cat):
    from tests.test_devices import _stock
    from tests.test_loans import _shop_b

    d = _stock(owner, cat, imei="490154203237518", condition="box_pack")
    loan = owner.post(
        "/api/v1/loans", json={"device_id": d["id"], "party_id": _shop_b(owner)["id"]}
    )
    assert loan.status_code == 201, loan.text
    r = owner.post(f"/api/v1/loans/{loan.json()['id']}/cancel", json={"reason": "wrong shop"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "cancelled"
    assert owner.get(f"/api/v1/devices/{d['id']}").json()["status"] == "in_stock"
    again = owner.post(f"/api/v1/loans/{loan.json()['id']}/cancel", json={"reason": "twice"})
    assert again.status_code == 409


def test_branch_transfer_sent_back(client, owner, cat):
    from tests.test_branch_transfers import _branch, _status
    from tests.test_devices import _stock

    d = _stock(owner, cat, imei="490154203237518", condition="box_pack", cost_price=1000)
    item = owner.post(
        "/api/v1/accessories",
        json={"name": "Type-C cable", "price": 300, "opening_qty": 10, "opening_cost": 120},
    ).json()
    two = _branch(owner)
    t = owner.post(
        "/api/v1/transfers",
        json={"to_shop_id": two, "devices": [d["id"]], "items": [{"id": item["id"], "qty": 4}]},
    ).json()
    u = owner.post(f"/api/v1/transfers/{t['id']}/undo", json={"reason": "wrong branch"})
    assert u.status_code == 200, u.text
    assert u.json()["undone_by"]
    # everything is back home, at the same cost; the branch has nothing left of it
    assert _status(owner, d["id"]) == "in_stock"
    assert owner.get(f"/api/v1/accessories/{item['id']}").json()["qty"] == 10
    cable = next(
        i for i in owner.get("/api/v1/accessories", shop_id=two).json() if i["sku"] == item["sku"]
    )
    assert cable["qty"] == 0
    for sid in (owner.shop_id, two):
        bs = owner.get("/api/v1/reports/balance-sheet", shop_id=sid).json()
        assert bs["balanced"] is True
        assert next(x["amount"] for x in bs["owner"] if x["key"] == "profit") == "0.00"
    again = owner.post(f"/api/v1/transfers/{t['id']}/undo", json={"reason": "twice"})
    assert again.status_code == 409


def test_installment_plan_cancelled_then_sale_deleted(owner, cat):
    from tests.test_devices import _stock
    from tests.test_purchases import _party

    c = _party(owner, name="Ahmed Khan", phone="03219876543", kinds=("customer",))
    d = _stock(
        owner,
        cat,
        imei="490154203237518",
        condition="box_pack",
        cost_price=40000,
        asking_price=60000,
    )
    sale = owner.post(
        "/api/v1/sales",
        json={
            "party_id": c["id"],
            "devices": [{"device_id": d["id"], "price": 60000}],
            "paid": 15000,
            "installments": {"months": 5, "due_day": 10},
        },
    ).json()
    plan = owner.get("/api/v1/installments").json()[0]
    # on installments: the sale waits for the plan
    r = owner.post(f"/api/v1/sales/{sale['id']}/void", json={"reason": "mistake"})
    assert r.status_code == 409
    x = owner.post(f"/api/v1/installments/{plan['id']}/cancel", json={"reason": "no qist"})
    assert x.status_code == 200, x.text
    assert x.json()["status"] == "cancelled"
    assert owner.get("/api/v1/installments", params={"view": "active"}).json() == []
    # the balance is normal udhaar now; the sale can be deleted
    assert _balance(owner, c) == "45000.00"
    r = owner.post(f"/api/v1/sales/{sale['id']}/void", json={"reason": "mistake"})
    assert r.status_code == 200, r.text
    assert _balance(owner, c) == "0.00"
    assert (
        owner.post(f"/api/v1/installments/{plan['id']}/cancel", json={"reason": "twice"})
    ).status_code == 409


def test_sale_edited_by_replacing(owner, cat):
    cus, a, _b, sale = _sold(owner, cat, paid=80000)
    cash0 = float(_cash(owner))
    body = {
        "party_id": cus["id"],
        "devices": [{"device_id": a["id"], "price": 75000}],
        "paid": 75000,
        "reason": "price was 75,000",
    }
    r = owner.post(f"/api/v1/sales/{sale['id']}/replace", json=body)
    assert r.status_code == 201, r.text
    new = r.json()
    assert new["id"] != sale["id"] and new["total"] == "75000.00"
    old = owner.get(f"/api/v1/sales/{sale['id']}").json()
    assert old["status"] == "void" and new["no"] in old["void_reason"]
    assert float(_cash(owner)) == cash0 - 5000
    assert _balance(owner, cus) == "0.00"
    assert _device(owner, A)["status"] == "sold"
    # the replaced one cannot be edited again
    assert owner.post(f"/api/v1/sales/{sale['id']}/replace", json=body).status_code == 409


def test_purchase_edited_by_replacing(owner, cat):
    from tests.test_purchase_return_cut import _balance as pbal
    from tests.test_purchase_return_cut import _buy

    sup, pur = _buy(owner, cat)  # 50,000, paid 25,000
    line = pur["lines"][0]
    dev = owner.get(f"/api/v1/devices/{line['device_id']}").json()
    body = {
        "kind": "supplier",
        "party_id": sup["id"],
        "devices": [
            {
                "device": {
                    "imei1": dev["imei1"],
                    "brand_id": cat["brand"]["id"],
                    "model_id": cat["model"]["id"],
                    "condition": "used",
                },
                "cost": 45000,
            }
        ],
        "paid": 25000,
        "reason": "cost was 45,000",
    }
    r = owner.post(f"/api/v1/purchases/{pur['id']}/replace", json=body)
    assert r.status_code == 201, r.text
    new = r.json()
    assert new["total"] == "45000.00"
    assert owner.get(f"/api/v1/purchases/{pur['id']}").json()["status"] == "voided"
    assert pbal(owner, sup["id"]) == "-20000.00"
    d2 = owner.get(f"/api/v1/devices/{new['lines'][0]['device_id']}").json()
    assert d2["status"] == "in_stock" and d2["imei1"] == dev["imei1"]
