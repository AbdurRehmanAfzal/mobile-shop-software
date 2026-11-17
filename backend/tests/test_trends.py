"""Owner 2026-11-18 (ADR-096): the graphs on the home screen and the business overview read one
day-by-day series — sales, purchases, profit / loss, to get / to give — for 7 or 30 days. Every
figure equals the screen it comes from."""

from app.core.clock import today as shop_today
from tests.conftest import login
from tests.test_purchases import _dev, _party

A, B = "490154203237518", "356938035643809"


def test_trends_match_the_bills_the_ledger_and_the_khata(client, owner, cat):
    sup = _party(owner)
    ali = _party(owner, name="Ali", phone="03217654321", kinds=("customer",))
    r = owner.post(
        "/api/v1/purchases",
        json={
            "kind": "supplier",
            "party_id": sup["id"],
            "devices": [
                {"device": _dev(cat, A), "cost": 4000, "asking_price": 5000},
                {"device": _dev(cat, B), "cost": 4200, "asking_price": 5200},
            ],
            "paid": 5000,
        },
    )
    assert r.status_code == 201, r.text
    first = owner.get("/api/v1/devices", params={"q": A}).json()
    dev = (first["items"] if isinstance(first, dict) else first)[0]
    r = owner.post(
        "/api/v1/sales",
        json={
            "party_id": ali["id"],
            "devices": [{"device_id": dev["id"], "price": 5000}],
            "paid": 3000,
        },
    )
    assert r.status_code == 201, r.text

    t = owner.get("/api/v1/reports/trends").json()
    today = shop_today().isoformat()
    assert t["days"] == 7 and len(t["rows"]) == 7 and t["rows"][-1]["date"] == today
    last, before = t["rows"][-1], t["rows"][-2]
    assert last["sales"] == "5000.00" and last["purchases"] == "8200.00"
    # the supplier is still owed 3,200; Ali still owes 2,000 — the dashboard's own two figures
    dash = owner.get("/api/v1/reports/dashboard").json()
    assert (last["to_get"], last["to_give"]) == ("2000.00", "3200.00")
    assert (last["to_get"], last["to_give"]) == (dash["receivable"], dash["payable"])
    # profit is the profit report's figure for the day: 5,000 - 4,000
    pl = owner.get(
        "/api/v1/reports/profit-loss", params={"date_from": today, "date_to": today}
    ).json()
    assert last["profit"] == pl["net_profit"] == "1000.00"
    # nothing happened the day before
    assert before == {
        "date": before["date"],
        "sales": "0.00",
        "to_get": "0.00",
        "to_give": "0.00",
        "purchases": "0.00",
        "profit": "0.00",
    }
    assert t["totals"] == {
        "sales": "5000.00",
        "to_get": "2000.00",
        "to_give": "3200.00",
        "purchases": "8200.00",
        "profit": "1000.00",
    }
    # 30 days; anything else is refused
    assert len(owner.get("/api/v1/reports/trends", params={"days": 30}).json()["rows"]) == 30
    assert owner.get("/api/v1/reports/trends", params={"days": 5}).status_code == 422

    # a salesman: sales and the khata totals, never purchases or profit
    owner.post(
        "/api/v1/staff",
        json={"name": "Sales", "phone": "03451112244", "password": "secret123", "role": "salesman"},
    )
    s = login(client, "03451112244").get("/api/v1/reports/trends").json()
    assert s["show_cost"] is False and s["rows"][-1]["sales"] == "5000.00"
    assert "purchases" not in s["rows"][-1] and "profit" not in s["rows"][-1]
    assert "profit" not in s["totals"]


def test_trends_of_another_shop_are_not_seen(owner, other_owner, cat):
    ali = _party(owner, name="Ali", phone="03217654321", kinds=("customer",))
    r = owner.post(
        "/api/v1/payments",
        json={"party_id": ali["id"], "direction": "out", "amount": 700, "purpose": "lending"},
    )
    assert r.status_code == 201, r.text
    mine = owner.get("/api/v1/reports/trends").json()["rows"][-1]
    theirs = other_owner.get("/api/v1/reports/trends").json()["rows"][-1]
    assert theirs["to_get"] == "0.00" and theirs["sales"] == "0.00"
    assert mine["to_get"] == "700.00"  # money given with no bill (len-den) is "to get"
