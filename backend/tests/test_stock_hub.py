"""Mock-up 23 (owner 2026-11-25): the stock screen's figures — a card per kind, per brand and model,
per dealer, and the stock ledger whose stock at cost after the last movement equals the books' stock
(inventory) when nothing was added to a unit later. Cost only for owner / manager."""

from decimal import Decimal

from tests.conftest import login
from tests.test_returns_audit import A, B, C, _buy, _customer, _sell, _stock_at_cost, _supplier


def _setup(owner, cat):
    sup = _supplier(owner)
    p = _buy(owner, cat, sup, [A, B, C], cost=65000, paid=100000)
    a, _b, _c = (ln["device_id"] for ln in p["lines"])
    _sell(owner, _customer(owner), [a], price=70000)
    r = owner.post(
        "/api/v1/returns/purchase", json={"purchase_id": p["id"], "line_ids": [p["lines"][2]["id"]]}
    )
    assert r.status_code == 201, r.text
    it = owner.post(
        "/api/v1/accessories",
        json={
            "name": "Fast Charger",
            "category": "charger",
            "price": 800,
            "opening_qty": 10,
            "opening_cost": 450,
        },
    )
    assert it.status_code == 201, it.text
    it = it.json()
    r = owner.post(
        "/api/v1/sales",
        json={
            "misc": [
                {
                    "description": "Fast Charger",
                    "accessory_id": it["id"],
                    "qty": 2,
                    "unit_price": 800,
                }
            ],
            "paid": 1600,
        },
    )
    assert r.status_code == 201, r.text
    return sup, p, it


def test_overview_models_parties(owner, cat):
    sup, _p, it = _setup(owner, cat)
    o = owner.get("/api/v1/stock-hub/overview").json()
    phone = next(k for k in o["kinds"] if k["key"] == "phone")
    assert phone["in_shop"] == 1 and phone["sold"] == 1 and phone["cost"] == "65000.00"
    assert phone["asking"] == "70000.00"
    items = next(k for k in o["kinds"] if k["key"] == "items")
    assert items["in_shop"] == 8 and items["sold"] == 2 and items["cost"] == "3600.00"
    assert o["cost"] == "68600.00" and Decimal(o["cost"]) == _stock_at_cost(owner)
    (b,) = o["brands"]
    assert (
        b["in_shop"] == 1
        and b["sold"] == 1
        and b["bought"] == "195000.00"
        and b["sold_value"] == "70000.00"
    )
    # the supplier: 195,000 billed, 100,000 paid, 65,000 returned → 30,000 still owed
    assert o["payable"] == "30000.00"

    (m,) = owner.get("/api/v1/stock-hub/models", params={"category": "phone"}).json()
    assert m["in_shop"] == 1 and m["sold"] == 1 and m["avg_cost"] == "65000.00"
    (im,) = owner.get("/api/v1/stock-hub/models", params={"category": "items"}).json()
    assert im["item_id"] == it["id"] and im["in_shop"] == 8 and im["sold"] == 2

    rows = owner.get("/api/v1/stock-hub/parties").json()
    s = next(r for r in rows if r["party_id"] == sup["id"])
    assert (s["in_shop"], s["sold"], s["returned"]) == (1, 1, 1)
    assert s["billed"] == "195000.00" and s["cost"] == "65000.00" and s["balance"] == "-30000.00"


def test_ledger_ends_at_the_books_stock(owner, cat):
    _setup(owner, cat)
    led = owner.get("/api/v1/stock-hub/ledger").json()
    kinds = [r["kind"] for r in led["rows"]]
    assert kinds.count("in") == 3 and kinds.count("out") == 2 and kinds.count("return_out") == 1
    # newest first; the stock at cost after the last movement is the books' stock
    assert Decimal(led["rows"][0]["worth_after"]) == _stock_at_cost(owner)
    sale = next(r for r in led["rows"] if r["kind"] == "out" and r["device_id"])
    assert (
        sale["price"] == "70000.00" and sale["profit"] == "5000.00" and sale["no"].startswith("INV")
    )
    assert led["in_units"] == 3 and led["out_units"] == 3  # one phone and two chargers
    assert led["returned_count"] == 1 and led["returned_value"] == "65000.00"
    assert led["profit"] == "5700.00"  # 5,000 on the phone, 2 × 350 on the chargers
    only = owner.get("/api/v1/stock-hub/ledger", params={"category": "items"}).json()
    assert {r["category"] for r in only["rows"]} == {"items"}
    outs = owner.get("/api/v1/stock-hub/ledger", params={"move": "out"}).json()
    assert {r["kind"] for r in outs["rows"]} == {"out"}


def test_staff_sees_no_cost(owner, client, cat):
    _setup(owner, cat)
    owner.post(
        "/api/v1/staff",
        json={"name": "Ali", "phone": "03211234567", "password": "secret123", "role": "salesman"},
    )
    ali = login(client, "03211234567")
    o = ali.get("/api/v1/stock-hub/overview").json()
    assert o["cost"] is None and o["payable"] is None and all(k["cost"] is None for k in o["kinds"])
    assert all(b["avg_cost"] is None and b["bought"] is None for b in o["brands"])
    led = ali.get("/api/v1/stock-hub/ledger").json()
    assert all(
        r["unit_cost"] is None and r["profit"] is None and r["worth_after"] is None
        for r in led["rows"]
    )
    assert all(r["balance"] is None for r in ali.get("/api/v1/stock-hub/parties").json())
