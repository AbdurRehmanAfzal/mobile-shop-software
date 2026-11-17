"""Owner 2026-11-17 (ADR-100): before an entry is deleted the app says what stands in the way and
where to undo it. The check is read-only and always agrees with the delete's own verdict."""

from tests.test_purchases import _dev, _party
from tests.test_returns import _customer, _sell

A, B, C, D = "490154203237518", "356938035643809", "352099001761481", "353918057929438"


def _buy(owner, cat, imei, cost=40000, paid=None):
    found = owner.get("/api/v1/parties", params={"q": "Rehman Traders"}).json()
    found = (found["items"] if isinstance(found, dict) else found) or [_party(owner)]
    p = owner.post(
        "/api/v1/purchases",
        json={
            "kind": "supplier",
            "party_id": found[0]["id"],
            "devices": [{"device": _dev(cat, imei), "cost": cost, "asking_price": cost + 5000}],
            "paid": cost if paid is None else paid,
        },
    )
    assert p.status_code == 201, p.text
    return p.json()


def _check(owner, kind, doc_id):
    r = owner.get(f"/api/v1/delete-check/{kind}/{doc_id}")
    assert r.status_code == 200, r.text
    return r.json()


def _codes(c):
    return [b["code"] for b in c["blockers"]]


def test_a_clean_purchase_has_nothing_in_the_way(owner, cat):
    p = _buy(owner, cat, A)
    dev = p["lines"][0]["device_id"]
    # a fault mark is not a blocker (ADR-099)
    owner.post(f"/api/v1/devices/{dev}/events", json={"type": "marked_faulty"})
    assert _check(owner, "purchase", p["id"]) == {"ok": True, "blockers": []}
    # the check changed nothing, and the delete agrees
    assert owner.get(f"/api/v1/devices/{dev}").json()["status"] == "faulty"
    assert (
        owner.post(f"/api/v1/purchases/{p['id']}/void", json={"reason": "wrong"}).status_code == 200
    )


def test_purchase_blockers_say_where_the_phone_is(owner, cat):
    # on loan to another shop
    p1 = _buy(owner, cat, A)
    d1 = p1["lines"][0]["device_id"]
    shop_b = _party(owner, name="Bilal Mobiles", phone="03001111111", kinds=("shop",))
    assert (
        owner.post("/api/v1/loans", json={"device_id": d1, "party_id": shop_b["id"]}).status_code
        == 201
    )
    c = _check(owner, "purchase", p1["id"])
    assert c["ok"] is False and _codes(c) == ["on_loan"]
    b = c["blockers"][0]
    assert b["who"] == "Bilal Mobiles" and b["to"] == "/loans" and A in b["phone"]
    assert (
        owner.post(f"/api/v1/purchases/{p1['id']}/void", json={"reason": "oops"}).status_code == 409
    )

    # sold on to a customer
    p2 = _buy(owner, cat, B)
    d2 = p2["lines"][0]["device_id"]
    cust = _customer(owner)
    inv = owner.post(
        "/api/v1/sales",
        json={
            "party_id": cust["id"],
            "devices": [{"device_id": d2, "price": 46000}],
            "paid": 46000,
        },
    ).json()
    c = _check(owner, "purchase", p2["id"])
    assert _codes(c) == ["sold"]
    assert c["blockers"][0]["ref"] == inv["no"] and c["blockers"][0]["to"] == f"/sales/{inv['id']}"
    assert c["blockers"][0]["who"] == "Ahmed Khan"
    assert (
        owner.post(f"/api/v1/purchases/{p2['id']}/void", json={"reason": "oops"}).status_code == 409
    )

    # reserved for a customer
    p3 = _buy(owner, cat, C)
    d3 = p3["lines"][0]["device_id"]
    res = owner.post(f"/api/v1/devices/{d3}/reserve", json={"party_id": cust["id"]})
    if res.status_code in (200, 201):
        assert _codes(_check(owner, "purchase", p3["id"])) == ["reserved"]
        assert (
            owner.post(f"/api/v1/purchases/{p3['id']}/void", json={"reason": "oops"}).status_code
            == 409
        )


def test_purchase_blocked_by_a_later_payment(owner, cat):
    p = _buy(owner, cat, D, cost=40000, paid=10000)
    sup = p["party_id"]
    pay = owner.post(
        "/api/v1/payments",
        json={
            "party_id": sup,
            "direction": "out",
            "amount": 5000,
            "allocations": [{"document_type": "purchase", "document_id": p["id"], "amount": 5000}],
        },
    )
    assert pay.status_code == 201, pay.text
    c = _check(owner, "purchase", p["id"])
    assert _codes(c) == ["later_payment"]
    assert c["blockers"][0]["ref"] == pay.json()["no"] and float(c["blockers"][0]["amount"]) == 5000
    assert c["blockers"][0]["to"] == f"/parties/{sup}"
    assert (
        owner.post(f"/api/v1/purchases/{p['id']}/void", json={"reason": "oops"}).status_code == 409
    )
    # the payment deleted -> nothing in the way any more
    assert (
        owner.post(f"/api/v1/payments/{pay.json()['id']}/void", json={"reason": "oops"}).status_code
        == 200
    )
    assert _check(owner, "purchase", p["id"])["ok"] is True
    assert (
        owner.post(f"/api/v1/purchases/{p['id']}/void", json={"reason": "oops"}).status_code == 200
    )


def test_sale_and_return_blockers(owner, other_owner, cat):
    c = _customer(owner)
    d, inv = _sell(owner, cat, c, A, 5000, 5000, cost=4000)
    assert _check(owner, "sale", inv["id"])["ok"] is True
    r = owner.post(
        "/api/v1/returns/sale",
        json={"invoice_id": inv["id"], "line_ids": [inv["lines"][0]["id"]], "settlement": "refund"},
    ).json()
    # the sale now has a return against it
    chk = _check(owner, "sale", inv["id"])
    assert "has_return" in _codes(chk) and chk["ok"] is False
    assert owner.post(f"/api/v1/sales/{inv['id']}/void", json={"reason": "oops"}).status_code == 409
    # the return itself is clean until the phone is sold again
    assert _check(owner, "saleReturn", r["id"])["ok"] is True
    again = owner.post(
        "/api/v1/sales",
        json={
            "party_id": c["id"],
            "devices": [{"device_id": d["id"], "price": 4800}],
            "paid": 4800,
        },
    ).json()
    chk = _check(owner, "saleReturn", r["id"])
    assert _codes(chk) == ["sold"] and chk["blockers"][0]["ref"] == again["no"]
    assert owner.post(f"/api/v1/returns/{r['id']}/void", json={"reason": "oops"}).status_code == 409

    # kinds with no rule are always "nothing known"; another shop's entry tells nothing
    assert _check(owner, "expense", inv["id"]) == {"ok": True, "blockers": []}
    assert _check(other_owner, "sale", inv["id"]) == {"ok": True, "blockers": []}
    assert owner.get(f"/api/v1/delete-check/nonsense/{inv['id']}").status_code == 422
