"""Mock-ups 17 / 20 (owner 2026-11-25): money spent on a unit after its purchase is added to its cost —
stock up and cash down, the unit's true net cost and its profit at sale include it, an expense is
undone with a reason while the unit is the shop's, and a unit returned to its seller leaves nothing
of itself in stock (the added cost is written off). The books stay balanced throughout."""

from decimal import Decimal

from tests.conftest import login
from tests.test_returns_audit import (
    A,
    B,
    _books,
    _buy,
    _cash,
    _customer,
    _profit,
    _sell,
    _stock_at_cost,
    _supplier,
)


def _expense(owner, dev, amount, kind="screen_guard", note=None):
    return owner.post(
        f"/api/v1/devices/{dev}/expenses", json={"amount": amount, "kind": kind, "note": note}
    )


def test_expense_adds_to_cost_stock_and_profit(owner, cat):
    p = _buy(owner, cat, _supplier(owner), [A], cost=30000)
    dev = p["lines"][0]["device_id"]
    cash0, stock0 = _cash(owner), _stock_at_cost(owner)
    r = _expense(owner, dev, 1500, note="Glass protector")
    assert r.status_code == 201, r.text
    assert Decimal(r.json()["cost_price"]) == 31500
    assert _cash(owner) == cash0 - 1500 and _stock_at_cost(owner) == stock0 + 1500
    _books(owner)  # balanced
    m = owner.get(f"/api/v1/devices/{dev}/money").json()
    s = m["summary"]
    assert s["cost"] == "30000.00" and s["added"] == "1500.00" and s["net_cost"] == "31500.00"
    (c,) = m["costs"]
    assert (
        c["source"] == "unit_expense"
        and c["kind"] == "screen_guard"
        and c["note"] == "Glass protector"
    )
    kinds = [x["kind"] for x in m["ledger"]["rows"]]
    assert kinds == ["purchase", "added_cost"] and m["ledger"]["net"] == "-31500.00"
    assert any(
        e["type"] == "cost_added" for e in owner.get(f"/api/v1/devices/{dev}/history").json()
    )

    # sold for 40,000: the profit is after the expense
    _sell(owner, _customer(owner), [dev], price=40000)
    assert _profit(owner) == 8500 and _stock_at_cost(owner) == stock0 - 30000
    led = owner.get(f"/api/v1/devices/{dev}/money").json()["ledger"]
    assert led["net"] == "8500.00" and led["profit"] == "8500.00"
    # a sold unit takes no more expenses
    r = _expense(owner, dev, 500)
    assert r.status_code == 409 and r.json()["error"]["code"] == "unit_not_owned"


def test_undo_with_a_reason(owner, cat):
    p = _buy(owner, cat, _supplier(owner), [A], cost=30000)
    dev = p["lines"][0]["device_id"]
    cash0, stock0 = _cash(owner), _stock_at_cost(owner)
    g = _expense(owner, dev, 1000, kind="parts").json()["group_id"]
    r = owner.post(f"/api/v1/devices/{dev}/expenses/{g}/undo", json={"reason": "x"})
    assert r.status_code == 422
    r = owner.post(f"/api/v1/devices/{dev}/expenses/{g}/undo", json={"reason": "typed twice"})
    assert r.status_code == 200, r.text
    assert Decimal(r.json()["cost_price"]) == 30000
    assert _cash(owner) == cash0 and _stock_at_cost(owner) == stock0
    _books(owner)
    m = owner.get(f"/api/v1/devices/{dev}/money").json()
    assert m["summary"]["added"] == "0.00" and m["costs"][0]["undone"] is True
    assert [x["kind"] for x in m["ledger"]["rows"]] == ["purchase"]
    r = owner.post(f"/api/v1/devices/{dev}/expenses/{g}/undo", json={"reason": "again please"})
    assert r.status_code == 409


def test_return_to_seller_writes_off_the_added_cost(owner, cat):
    sup = _supplier(owner)
    p = _buy(owner, cat, sup, [A, B], cost=30000)
    dev = p["lines"][0]["device_id"]
    stock0 = _stock_at_cost(owner)
    assert _expense(owner, dev, 2000, kind="transport").status_code == 201
    profit0 = _profit(owner)
    r = owner.post(
        "/api/v1/returns/purchase", json={"purchase_id": p["id"], "line_ids": [p["lines"][0]["id"]]}
    )
    assert r.status_code == 201, r.text
    # the unit is gone from stock entirely; the 2,000 the seller does not refund is a cost
    assert _stock_at_cost(owner) == stock0 - 30000
    assert _profit(owner) == profit0 - 2000
    _books(owner)


def test_who_may_add(owner, client, cat):
    p = _buy(owner, cat, _supplier(owner), [A], cost=30000)
    dev = p["lines"][0]["device_id"]
    # never through the generic events endpoint
    r = owner.post(f"/api/v1/devices/{dev}/events", json={"type": "cost_added"})
    assert r.status_code in (400, 409, 422)
    assert _expense(owner, dev, 100, kind="nonsense").status_code == 422
    owner.post(
        "/api/v1/staff",
        json={"name": "Ali", "phone": "03211234567", "password": "secret123", "role": "salesman"},
    )
    ali = login(client, "03211234567")
    assert _expense(ali, dev, 100).status_code == 403
    m = ali.get(f"/api/v1/devices/{dev}/money").json()
    assert m["costs"] == [] and m["summary"]["added"] is None and m["summary"]["net_cost"] is None


def test_cost_added_in_the_evening_stays_after_its_purchase():
    """a bill is stamped 00:01 UTC of the shop's date; a cost added at 19:30 UTC the day
    before (00:30 the same day in Pakistan) must still come after the purchase"""
    import datetime as dt
    from types import SimpleNamespace

    from app.modules.units.ledger import item_ledger

    utc = dt.UTC
    bill = {
        "kind": "purchase",
        "at": dt.datetime(2026, 11, 26, 0, 1, tzinfo=utc),
        "date": dt.date(2026, 11, 26),
        "amount": Decimal(30000),
        "upfront": Decimal(0),
    }
    cost = {
        "at": dt.datetime(2026, 11, 25, 19, 30, tzinfo=utc),
        "amount": Decimal(1500),
        "source": "unit_expense",
        "note": None,
        "undone": False,
    }
    led = item_ledger([bill], {"source": "purchase"}, SimpleNamespace(), [cost])
    assert [r["kind"] for r in led["rows"]] == ["purchase", "added_cost"]
