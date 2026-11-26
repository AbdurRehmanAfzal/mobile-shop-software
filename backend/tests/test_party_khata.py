"""Mock-up 21 (owner 2026-11-25): a person's khata beside its statement — their phones and where each
is now, by model, money by channel, the old balance, the promised date; and the A4 report. Every
figure is checked against the documents it is read from; cost only for owner / manager."""

import datetime as dt

from app.core.clock import today as shop_today
from tests.conftest import login
from tests.test_returns_audit import A, B, C, _buy, _customer, _sell, _supplier


def _setup(owner, cat):
    sup = _supplier(owner)
    p = _buy(owner, cat, sup, [A, B, C], cost=50000, paid=100000)  # 50,000 left on the khata
    a, b, c = (ln["device_id"] for ln in p["lines"])
    _sell(owner, _customer(owner), [a], price=56000)  # profit 6,000
    r = owner.post(
        "/api/v1/returns/purchase", json={"purchase_id": p["id"], "line_ids": [p["lines"][2]["id"]]}
    )
    assert r.status_code == 201, r.text
    r = owner.post(
        "/api/v1/payments",
        json={"party_id": sup["id"], "direction": "out", "amount": 20000, "method": "bank"},
    )
    assert r.status_code == 201, r.text
    r = owner.post(
        f"/api/v1/ledger/parties/{sup['id']}/opening-balance",
        json={"amount": 7000, "party_owes": False, "memo": "old diary"},
    )
    assert r.status_code == 201, r.text
    due = (shop_today() + dt.timedelta(days=3)).isoformat()
    r = owner.post(
        "/api/v1/payments",
        json={
            "party_id": sup["id"],
            "direction": "out",
            "amount": 4000,
            "purpose": "lending",
            "due_date": due,
        },
    )
    assert r.status_code == 201, r.text
    return sup, p, (a, b, c), due


def test_units_models_and_stock(owner, cat):
    sup, _p, (a, b, c), _due = _setup(owner, cat)
    k = owner.get(f"/api/v1/parties/{sup['id']}/khata").json()
    by = {u["device_id"]: u for u in k["units"]}
    assert (
        by[a]["state"] == "sold"
        and by[a]["sold_for"] == "56000.00"
        and by[a]["profit"] == "6000.00"
    )
    assert (
        by[b]["state"] == "in_shop" and by[b]["cost"] == "50000.00" and by[b]["days_in_shop"] == 0
    )
    assert by[c]["state"] == "returned"
    s = k["stock"]
    assert s["bought"] == 3 and s["in_shop"] == {"count": 1, "cost": "50000.00"}
    assert (
        s["sold"]["count"] == 1
        and s["sold"]["value"] == "56000.00"
        and s["sold"]["profit"] == "6000.00"
    )
    assert s["returned"]["count"] == 1 and s["dearest"]["device_id"] == b
    # the stock card's profit is the shop audit's own (journey)
    j = owner.get(f"/api/v1/shop-audit/parties/{sup['id']}/journey").json()
    assert j["bought"]["sourced_profit"] == s["sold"]["profit"]
    (m,) = k["models"]
    assert (m["bought"], m["in_shop"], m["sold"], m["returned"]) == (3, 1, 1, 1)
    assert m["total_cost"] == "150000.00" and m["highest_cost"] == "50000.00"


def test_channels_old_balance_promise(owner, cat):
    sup, _p, _ids, due = _setup(owner, cat)
    k = owner.get(f"/api/v1/parties/{sup['id']}/khata").json()
    ch = {c["method"]: c for c in k["channels"]}
    # 100,000 in cash at the purchase, then 20,000 by bank and 4,000 len-den in cash
    assert ch["cash"]["out"] == "104000.00" and ch["bank"]["out"] == "20000.00"
    assert k["money_out"] == "124000.00" and k["money_in"] == "0.00"
    assert k["old_balance"] == "-7000.00"
    assert k["promise"]["date"] == due and len(k["promise"]["entries"]) == 1
    assert {x["method"] for x in k["payments"]} == {"bank", "cash"}
    assert k["balance"] == owner.get(f"/api/v1/parties/{sup['id']}").json()["balance"]


def test_report_and_cost_hiding(owner, client, cat):
    sup, p, _ids, _due = _setup(owner, cat)
    r = owner.get(f"/api/v1/parties/{sup['id']}/khata-report?lang=en&profit=true")
    assert r.status_code == 200
    t = r.text
    assert "Khata statement" in t and p["no"] in t and "Money by channel" in t and "Bank" in t
    assert "Every phone, where it is now" in t and "Profit" in t and "6,000" in t
    r = owner.get(f"/api/v1/parties/{sup['id']}/khata-report?lang=ur&sections=ledger")
    assert r.status_code == 200 and 'dir="rtl"' in r.text and "رقم کس ذریعے سے" not in r.text
    day = shop_today().isoformat()
    r = owner.get(f"/api/v1/parties/{sup['id']}/khata-report?lang=en&date_from={day}&date_to={day}")
    assert r.status_code == 200 and day in r.text

    owner.post(
        "/api/v1/staff",
        json={"name": "Ali", "phone": "03211234567", "password": "secret123", "role": "salesman"},
    )
    ali = login(client, "03211234567")
    k = ali.get(f"/api/v1/parties/{sup['id']}/khata").json()
    assert k["stock"]["in_shop"]["cost"] is None and k["stock"]["sold"]["profit"] is None
    assert all(u["cost"] is None and u["profit"] is None for u in k["units"])
    assert k["money_out"] is None and all(c["out"] is None for c in k["channels"])
    assert k["old_balance"] is None and k["stock"]["dearest"] is None
    t = ali.get(f"/api/v1/parties/{sup['id']}/khata-report?lang=en&profit=true").text
    assert "Profit" not in t and "Cost" not in t
