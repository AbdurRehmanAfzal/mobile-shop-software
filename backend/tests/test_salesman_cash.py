"""Owner 2026-11-13 (ADR-072): a salesman sees only today's cash in hand and bank — not the galla
and bank totals, not another day's hisaab, not account balances. Owner / manager as before."""

import datetime as dt

from tests.conftest import login
from tests.test_devices import _stock
from tests.test_reports_owner import A, B


def _salesman(client, owner):
    owner.post(
        "/api/v1/staff",
        json={"name": "Sales", "phone": "03451117788", "password": "secret123", "role": "salesman"},
    )
    return login(client, "03451117788")


def test_salesman_sees_today_only(client, owner, cat):
    d1 = _stock(owner, cat, imei=A, condition="box_pack", cost_price=500, asking_price=1000)
    d2 = _stock(owner, cat, imei=B, condition="box_pack", cost_price=500, asking_price=2000)
    owner.post(
        "/api/v1/sales", json={"devices": [{"device_id": d1["id"], "price": 1000}], "paid": 1000}
    )
    owner.post(
        "/api/v1/sales",
        json={
            "devices": [{"device_id": d2["id"], "price": 2000}],
            "paid": 2000,
            "payment": {"method": "online", "bank": "Meezan Bank"},
        },
    )
    s = _salesman(client, owner)

    dash = s.get("/api/v1/reports/dashboard").json()
    assert dash["cash_in_hand"] is None
    assert dash["today_cash"] == "1000.00" and dash["today_bank"] == "2000.00"
    own = owner.get("/api/v1/reports/dashboard").json()
    assert own["cash_in_hand"] is not None and own["today_cash"] == "1000.00"

    # another day is turned into today for the salesman
    yesterday = (dt.date.today() - dt.timedelta(days=1)).isoformat()
    r = s.get(f"/api/v1/reports/day?date={yesterday}").json()
    assert r["date_from"] == dash["date"] and r["date_to"] == dash["date"]
    week = s.get(f"/api/v1/reports/day?date_from={yesterday}").json()
    assert week["date_from"] == week["date_to"]
    # the owner still picks any day
    assert owner.get(f"/api/v1/reports/day?date={yesterday}").json()["date_from"] == yesterday

    # account names, no balances
    accs = s.get("/api/v1/ledger/accounts").json()
    assert accs and all(a["balance"] is None and a["opening_balance"] is None for a in accs)
    assert owner.get("/api/v1/ledger/accounts").json()[0]["balance"] is not None
