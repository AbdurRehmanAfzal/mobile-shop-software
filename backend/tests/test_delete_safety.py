"""Owner 2026-11-15 (ADR-090): every entry can be deleted, and deleting never leaves the books
half-undone. An exchange is deleted as one (both phones, the refund, the khata as before); one half
alone is refused; a sale or purchase with a later payment against it waits until that payment is
deleted."""

from tests.test_exchange_return_settlement import A, B, _balance, _cash, _exchange, _sold


def _device(owner, imei):
    return owner.get("/api/v1/devices", params={"q": imei}).json()[0]


def test_exchange_deleted_as_one(owner, cat):
    cus, a, b, sale = _sold(owner, cat, paid=80000)
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
    cus, a, b, sale = _sold(owner, cat, paid=50000)  # 30,000 udhaar
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
