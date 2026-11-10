"""Owner 2026-11-10 (ADR-057): a customer brings back a phone bought days earlier. Exchanged for
another phone at an agreed trade-in value, or returned with no replacement; whoever owes the balance
pays all of it, part of it or nothing now, and pays the rest later against the same balance.

Every case checks the khata (party balance: + the customer owes, − the shop owes), the cash, both
bills, the stock / IMEI history and the receipt."""

import uuid

import pytest

from tests.test_devices import _stock
from tests.test_purchases import _party

A = "490154203237518"  # the phone sold first, brought back
B = "356938035643809"  # the replacement


def _cash(owner):
    return owner.get("/api/v1/ledger/accounts").json()[0]["balance"]


def _balance(owner, party):
    return owner.get(f"/api/v1/parties/{party['id']}").json()["balance"]


def _sold(owner, cat, paid=80000):
    """Ali bought phone A for 80,000 (paid `paid`); phone B (90,000 / 55,000 / 70,000) is in stock"""
    cus = _party(owner, name="Ali", phone="03211111111", kinds=("customer",))
    a = _stock(owner, cat, imei=A, cost_price=60000, asking_price=80000, condition="box_pack")
    b = _stock(owner, cat, imei=B, cost_price=40000, asking_price=90000, condition="box_pack")
    r = owner.post(
        "/api/v1/sales",
        json={
            "party_id": cus["id"],
            "devices": [{"device_id": a["id"], "price": 80000}],
            "paid": paid,
        },
    )
    assert r.status_code == 201, r.text
    return cus, a, b, r.json()


def _trade_line(cat, value=70000):
    return {
        "device": {
            "imei1": A,
            "brand_id": cat["brand"]["id"],
            "model_id": cat["model"]["id"],
            "condition": "used",
            "pta_status": "pta_approved",
        },
        "cost": value,
    }


def _exchange(owner, cat, cus, b, price, paid=0, refund=0, **extra):
    return owner.post(
        "/api/v1/exchanges",
        json={
            "party_id": cus["id"],
            "trade_in": [_trade_line(cat)],
            "devices": [{"device_id": b["id"], "price": price}],
            "paid": paid,
            "refund": refund,
            **extra,
        },
    )


# replacement price, customer pays now, shop pays now → khata after, cash moved, new bill due,
# trade-in bill still to give
CASES = [
    (90000, 20000, 0, "0.00", 20000, "0.00", "0.00"),
    (90000, 8000, 0, "12000.00", 8000, "12000.00", "0.00"),
    (90000, 0, 0, "20000.00", 0, "20000.00", "0.00"),
    (55000, 0, 15000, "0.00", -15000, "0.00", "0.00"),
    (55000, 0, 5000, "-10000.00", -5000, "0.00", "10000.00"),
    (55000, 0, 0, "-15000.00", 0, "0.00", "15000.00"),
    (70000, 0, 0, "0.00", 0, "0.00", "0.00"),
]


@pytest.mark.parametrize("price,paid,refund,khata,cash_moved,bill_due,owe_customer", CASES)
def test_exchange_table(owner, cat, price, paid, refund, khata, cash_moved, bill_due, owe_customer):
    cus, _a, b, sale = _sold(owner, cat)
    cash_before = float(_cash(owner))
    r = _exchange(owner, cat, cus, b, price, paid, refund)
    assert r.status_code == 201, r.text
    ex = r.json()
    assert ex["new_balance"] == khata and _balance(owner, cus) == khata
    assert float(_cash(owner)) - cash_before == cash_moved  # only real money in the cash book
    # each bill shows only what is really open
    new_bill = owner.get(f"/api/v1/sales/{ex['invoice_id']}").json()
    assert new_bill["total"] == f"{price}.00" and new_bill["balance_due"] == bill_due
    trade_bill = owner.get(f"/api/v1/purchases/{ex['purchase_id']}").json()
    assert trade_bill["total"] == "70000.00" and trade_bill["balance_due"] == owe_customer
    # the old sale stays; the phone came back at the agreed value, linked to its first bill
    assert owner.get(f"/api/v1/sales/{sale['id']}").json()["total"] == "80000.00"
    assert ex["original_invoice_id"] == sale["id"] and ex["original_invoice_no"] == sale["no"]
    d = owner.get(f"/api/v1/devices/imei/{A}").json()["device"]
    assert d["status"] == "in_stock" and d["cost_price"] == "70000.00"
    hist = [e["type"] for e in owner.get(f"/api/v1/devices/{d['id']}/history").json()]
    assert hist[:3] == ["purchased", "sold", "purchased"] or hist[-3:] == [
        "purchased",
        "sold",
        "purchased",
    ]
    assert owner.get(f"/api/v1/devices/imei/{B}").json()["device"]["status"] == "sold"
    # the receipt says it in words
    page = owner.get(f"/api/v1/sales/{ex['invoice_id']}/receipt", params={"lang": "en"}).text
    assert "Old phone taken back" in page
    if khata != "0.00":
        assert ("To get from customer" if float(khata) > 0 else "To give to customer") in page


def test_exchange_rest_paid_later_both_ways(owner, cat):
    """12,000 to get: 5,000 then 7,000 close it. 10,000 to give: 4,000 then 6,000 close it.
    No new sale, no stock move."""
    cus, _a, b, _ = _sold(owner, cat)
    ex = _exchange(owner, cat, cus, b, 90000, paid=8000).json()
    cash0 = float(_cash(owner))
    for amt in (5000, 7000):
        r = owner.post(
            "/api/v1/payments", json={"party_id": cus["id"], "direction": "in", "amount": amt}
        )
        assert r.status_code == 201, r.text
    assert _balance(owner, cus) == "0.00" and float(_cash(owner)) - cash0 == 12000
    bill = owner.get(f"/api/v1/sales/{ex['invoice_id']}").json()
    assert bill["balance_due"] == "0.00" and bill["status"] == "paid"
    assert len(owner.get("/api/v1/sales").json()) == 2  # the first sale and the exchange's

    # the other way, a separate customer
    cus2 = _party(owner, name="Bilal", phone="03212222222", kinds=("customer",))
    c = _stock(
        owner,
        cat,
        imei="353456789012348",
        cost_price=50000,
        asking_price=55000,
        condition="box_pack",
    )
    s = owner.post(
        "/api/v1/sales",
        json={
            "party_id": cus2["id"],
            "devices": [{"device_id": c["id"], "price": 80000}],
            "paid": 80000,
        },
    ).json()
    d = _stock(
        owner,
        cat,
        imei="353456789012355",
        cost_price=40000,
        asking_price=55000,
        condition="box_pack",
    )
    line = _trade_line(cat)
    line["device"]["imei1"] = "353456789012348"
    ex2 = owner.post(
        "/api/v1/exchanges",
        json={
            "party_id": cus2["id"],
            "trade_in": [line],
            "devices": [{"device_id": d["id"], "price": 55000}],
            "refund": 5000,
        },
    ).json()
    assert ex2["new_balance"] == "-10000.00" and ex2["original_invoice_no"] == s["no"]
    cash1 = float(_cash(owner))
    for amt in (4000, 6000):
        r = owner.post(
            "/api/v1/payments", json={"party_id": cus2["id"], "direction": "out", "amount": amt}
        )
        assert r.status_code == 201, r.text
    assert _balance(owner, cus2) == "0.00" and float(_cash(owner)) - cash1 == -10000
    assert owner.get(f"/api/v1/purchases/{ex2['purchase_id']}").json()["balance_due"] == "0.00"
    assert (
        owner.get("/api/v1/devices/imei/353456789012348").json()["device"]["status"] == "in_stock"
    )


def test_exchange_refund_cannot_exceed_what_the_shop_owes_and_nothing_is_kept(owner, cat):
    """a wrong amount is refused and leaves nothing behind (one transaction)"""
    cus, _a, b, _sale = _sold(owner, cat)
    cash0 = _cash(owner)
    r = _exchange(owner, cat, cus, b, 55000, refund=20000)  # the shop owes only 15,000
    assert r.status_code == 422 and r.json()["error"]["code"] == "refund_exceeds"
    assert _cash(owner) == cash0 and _balance(owner, cus) == "0.00"
    assert owner.get(f"/api/v1/devices/imei/{A}").json()["device"]["status"] == "sold"
    assert owner.get(f"/api/v1/devices/imei/{B}").json()["device"]["status"] == "in_stock"
    assert owner.get("/api/v1/exchanges").json() == []
    assert owner.get("/api/v1/purchases").json() == []  # no trade-in bill was left behind


def test_exchange_sent_twice_is_posted_once(owner, cat):
    cus, _a, b, _ = _sold(owner, cat)
    key = {"Idempotency-Key": str(uuid.uuid4())}
    body = {
        "party_id": cus["id"],
        "trade_in": [_trade_line(cat)],
        "devices": [{"device_id": b["id"], "price": 90000}],
        "paid": 8000,
    }
    first = owner.post("/api/v1/exchanges", json=body, headers=key)
    again = owner.post("/api/v1/exchanges", json=body, headers=key)
    assert first.status_code == 201 and again.status_code == 201
    assert first.json()["id"] == again.json()["id"]
    assert len(owner.get("/api/v1/exchanges").json()) == 1
    assert _balance(owner, cus) == "12000.00"


def test_exchange_paid_online(owner, cat):
    """the money paid now carries its method like a sale"""
    cus, _a, b, _ = _sold(owner, cat)
    acc = owner.post("/api/v1/ledger/accounts", json={"name": "Meezan", "kind": "bank"})
    assert acc.status_code in (200, 201), acc.text
    r = _exchange(
        owner,
        cat,
        cus,
        b,
        90000,
        paid=20000,
        payment={"method": "online", "bank": "Meezan", "reference": "TID9"},
    )
    assert r.status_code == 201, r.text
    page = owner.get(f"/api/v1/sales/{r.json()['invoice_id']}/receipt", params={"lang": "en"}).text
    assert "Online" in page and "TID9" in page and "Paid now" in page


def _return(owner, sale, **body):
    return owner.post(
        "/api/v1/returns/sale",
        json={"invoice_id": sale["id"], "line_ids": [sale["lines"][0]["id"]], **body},
    )


@pytest.mark.parametrize(
    "refund,khata,cash_moved",
    [(80000, "0.00", -80000), (30000, "-50000.00", -30000), (0, "-80000.00", 0)],
)
def test_return_fully_paid(owner, cat, refund, khata, cash_moved):
    cus, _a, _b, sale = _sold(owner, cat)
    cash0 = float(_cash(owner))
    body = (
        {"settlement": "refund", "refund_amount": refund, "kept_amount": 0}
        if refund
        else {"settlement": "credit"}
    )
    r = _return(owner, sale, **body)
    assert r.status_code == 201, r.text
    assert _balance(owner, cus) == khata and float(_cash(owner)) - cash0 == cash_moved
    assert r.json()["document_no"] == sale["no"]  # linked to its bill
    assert owner.get(f"/api/v1/devices/imei/{A}").json()["device"]["status"] == "in_stock"


def test_return_partly_paid(owner, cat):
    """80,000 bill, 50,000 paid: a full credit clears the 30,000 owed and leaves 50,000 to give"""
    cus, _a, _b, sale = _sold(owner, cat, paid=50000)
    assert _balance(owner, cus) == "30000.00"
    r = _return(owner, sale, settlement="credit")
    assert r.status_code == 201, r.text
    assert _balance(owner, cus) == "-50000.00"


def test_return_with_smaller_credit_leaves_the_rest_due(owner, cat):
    """same start, the shop's rules give only 25,000 credit: 5,000 still to get"""
    cus, _a, _b, sale = _sold(owner, cat, paid=50000)
    cash0 = _cash(owner)
    r = _return(owner, sale, settlement="income", refund_amount=0, kept_amount=55000)
    assert r.status_code == 201, r.text
    assert _balance(owner, cus) == "5000.00" and _cash(owner) == cash0


def test_return_cut_rules(owner, cat):
    """money can be handed back only from what the customer paid beyond the cut"""
    _cus, _a, _b, sale = _sold(owner, cat, paid=50000)
    r = _return(owner, sale, settlement="refund", refund_amount=1000, kept_amount=55000)
    assert r.status_code == 422 and r.json()["error"]["code"] == "exceeds_excess"
    r = _return(owner, sale, settlement="income", refund_amount=0, kept_amount=90000)
    assert r.status_code == 422 and r.json()["error"]["code"] == "cut_exceeds_value"


def test_negotiated_buyback(owner, cat):
    """the shop buys the phone back for 70,000 and pays 20,000 today: 50,000 to give"""
    cus, _a, _b, sale = _sold(owner, cat)
    cash0 = float(_cash(owner))
    r = owner.post(
        "/api/v1/purchases",
        json={
            "kind": "walk_in",
            "party_id": cus["id"],
            "devices": [_trade_line(cat)],
            "paid": 20000,
        },
    )
    assert r.status_code == 201, r.text
    assert _balance(owner, cus) == "-50000.00" and float(_cash(owner)) - cash0 == -20000
    d = owner.get(f"/api/v1/devices/imei/{A}").json()["device"]
    assert d["status"] == "in_stock" and d["cost_price"] == "70000.00"
    assert owner.get(f"/api/v1/sales/{sale['id']}").json()["status"] == "paid"  # the sale stays


def test_dashboard_counts_only_real_money(owner, cat):
    """the trade-in put against the new bill is not money received today"""
    cus, _a, b, _ = _sold(owner, cat)
    _exchange(owner, cat, cus, b, 90000, paid=8000)
    dash = owner.get("/api/v1/reports/dashboard").json()
    assert dash["received_today"] == "88000.00"  # 80,000 first sale + 8,000 now
