"""Owner decisions 2026-10-31: a promise date on udhaar bills makes 'overdue' real; remittance fee
and status are recorded and netted; a nightly stock snapshot answers as-of stock for big shops."""

import datetime as dt

from app.core.clock import today as shop_today
from tests.test_devices import _stock
from tests.test_purchases import _dev, _party

A, B, C = "490154203237518", "356938035643809", "352099001761481"


def test_due_dates_make_overdue_real(owner, cat):
    t = shop_today()
    cus = _party(owner, name="Ahmed", phone="03001111111", kinds=("customer",))
    dealer = _party(owner, name="Dealer", phone="03005556666", kinds=("supplier",))
    a = _stock(owner, cat, imei=A, condition="box_pack", cost_price=800, asking_price=1000)
    b = _stock(owner, cat, imei=B, condition="box_pack", cost_price=800, asking_price=1000)
    # a credit sale promised 10 days ago (overdue), one promised in 5 days (not due), one with no promise
    r = owner.post(
        "/api/v1/sales",
        json={
            "party_id": cus["id"],
            "devices": [{"device_id": a["id"], "price": 1000}],
            "paid": 0,
            "due_date": (t - dt.timedelta(days=10)).isoformat(),
        },
    )
    assert r.status_code == 201, r.text
    assert r.json()["due_date"] == (t - dt.timedelta(days=10)).isoformat()
    assert (
        owner.get(f"/api/v1/sales/{r.json()['id']}").json()["due_date"]
        == (t - dt.timedelta(days=10)).isoformat()
    )
    bilal = _party(owner, name="Bilal", phone="03002222222", kinds=("customer",))
    assert (
        owner.post(
            "/api/v1/sales",
            json={
                "party_id": bilal["id"],
                "devices": [{"device_id": b["id"], "price": 1000}],
                "paid": 0,
                "due_date": (t + dt.timedelta(days=5)).isoformat(),
            },
        ).status_code
        == 201
    )
    # a purchase on credit promised 3 days ago
    r = owner.post(
        "/api/v1/purchases",
        json={
            "kind": "supplier",
            "party_id": dealer["id"],
            "devices": [{"device": _dev(cat, C), "cost": 800}],
            "paid": 0,
            "due_date": (t - dt.timedelta(days=3)).isoformat(),
        },
    )
    assert r.status_code == 201, r.text
    assert r.json()["due_date"] == (t - dt.timedelta(days=3)).isoformat()

    u = owner.get("/api/v1/shop-audit/udhaar", params={"preset": "all_time"}).json()
    rows = {r["name"]: r for r in u["receivable_rows"]}
    assert rows["Ahmed"]["overdue_days"] == 10 and rows["Ahmed"]["overdue_band"] == "8-30"
    assert rows["Bilal"]["overdue_days"] == 0 and rows["Bilal"]["overdue_band"] == "not_due"
    assert (
        u["receivable_overdue"] == "1000.00"
        and u["overdue_bands"][0] == "not_due"
        and u["overdue_bands"][-1] == "no_due_date"
    )
    ob = {x["band"]: x for x in u["receivable_overdue_bands"]}
    assert (
        ob["8-30"]["amount"] == "1000.00"
        and ob["not_due"]["amount"] == "1000.00"
        and ob["no_due_date"]["parties"] == 0
    )
    pr = u["payable_rows"][0]
    assert (
        pr["name"] == "Dealer"
        and pr["overdue_days"] == 3
        and pr["overdue_band"] == "0-7"
        and u["payable_overdue"] == "800.00"
    )
    phones = {p["imei1"]: p for p in u["phones"]}
    assert (
        phones[A]["overdue_days"] == 10
        and phones[B]["overdue_days"] == 0
        and phones[C]["due_date"] == (t - dt.timedelta(days=3)).isoformat()
    )
    # the age of the debt is still there for bills without a promise date
    assert rows["Ahmed"]["age_days"] == 0 and rows["Ahmed"]["band"] == "0-7"
    # as of 15 days ago nothing was overdue yet
    u2 = owner.get(
        "/api/v1/shop-audit/udhaar",
        params={"preset": "all_time", "as_of": (t - dt.timedelta(days=15)).isoformat()},
    ).json()
    assert u2["receivable_overdue"] == "0.00"


def test_remittance_fee_and_status_are_recorded_and_netted(owner, cat):
    cus = _party(owner, name="Ahmed", phone="03001111111", kinds=("customer",))
    d = _stock(owner, cat, imei=A, condition="box_pack", cost_price=30000, asking_price=37100)
    r = owner.post(
        "/api/v1/sales",
        json={
            "party_id": cus["id"],
            "devices": [{"device_id": d["id"], "price": 37100}],
            "paid": 37100,
            "payment": {
                "method": "remittance",
                "currency": "SAR",
                "foreign_amount": 500,
                "rate": 74.2,
                "sender_name": "Ahmed Raza",
                "country": "Saudi Arabia",
                "service": "Western Union",
                "reference": "MTCN 1",
                "fee": 600,
                "status": "received",
            },
        },
    )
    assert r.status_code == 201, r.text
    assert r.json()["payment"]["fee"] == "600.00" and r.json()["payment"]["status"] == "received"
    i = owner.get("/api/v1/shop-audit/international", params={"preset": "this_month"}).json()
    row = i["rows"][0]
    assert row["fee"] == "600.00" and row["net"] == "36500.00" and row["status"] == "received"
    assert (
        i["total_fees"] == "600.00"
        and i["total_net_in"] == "36500.00"
        and i["by_status"]["received"] == 1
    )
    assert i["by_currency"][0]["fees"] == "600.00" and i["by_currency"][0]["net"] == "36500.00"
    assert (
        owner.post(
            "/api/v1/sales",
            json={
                "devices": [],
                "misc": [{"description": "x", "qty": 1, "unit_price": 10, "cost": 1}],
                "paid": 10,
                "payment": {
                    "method": "remittance",
                    "currency": "SAR",
                    "foreign_amount": 1,
                    "rate": 10,
                    "sender_name": "x",
                    "status": "lost",
                },
            },
        ).status_code
        == 422
    )


def test_stock_snapshots_answer_as_of_stock(owner, client, cat, db):
    t = shop_today()
    dealer = _party(owner, name="Dealer", phone="03005556666", kinds=("supplier",))
    r = owner.post(
        "/api/v1/purchases",
        json={
            "kind": "supplier",
            "party_id": dealer["id"],
            "date": (t - dt.timedelta(days=5)).isoformat(),
            "devices": [
                {"device": _dev(cat, A), "cost": 800, "asking_price": 1000},
                {"device": _dev(cat, B), "cost": 800, "asking_price": 1000},
            ],
            "paid": 1600,
        },
    )
    ids = [ln["device_id"] for ln in r.json()["lines"]]
    assert (
        owner.post(
            "/api/v1/sales",
            json={
                "date": (t - dt.timedelta(days=2)).isoformat(),
                "devices": [{"device_id": ids[0], "price": 1000}],
                "paid": 1000,
            },
        ).status_code
        == 201
    )
    # the backfill builds one row per day; the day-before-sale row has 2 phones, after it 1
    r = owner.post("/api/v1/shop-audit/snapshots/backfill", params={"days": 7})
    assert r.status_code == 200 and r.json()["days"] == 7
    snaps = {s["day"]: s for s in owner.get("/api/v1/shop-audit/snapshots").json()}
    assert snaps[(t - dt.timedelta(days=3)).isoformat()]["count"] == 2
    assert snaps[(t - dt.timedelta(days=3)).isoformat()]["cost_value"] == "1600.00"
    assert snaps[(t - dt.timedelta(days=1)).isoformat()]["count"] == 1
    assert snaps[(t - dt.timedelta(days=6)).isoformat()]["count"] == 0
    # the overview as-of reads the snapshot and agrees with the walk
    o = owner.get(
        "/api/v1/shop-audit/overview",
        params={"preset": "all_time", "as_of": (t - dt.timedelta(days=3)).isoformat()},
    ).json()
    assert o["stock"]["as_of"]["count"] == 2 and o["stock"]["as_of"].get("from_snapshot") is True
    o2 = owner.get(
        "/api/v1/shop-audit/overview",
        params={"preset": "all_time", "as_of": (t - dt.timedelta(days=1)).isoformat()},
    ).json()
    assert o2["stock"]["as_of"]["count"] == 1 and o2["stock"]["as_of"]["cost_value"] == "800.00"
    # the nightly tick takes yesterday's snapshot once per shop and day
    from app.modules.notifications import jobs

    ran = jobs.tick(db)
    assert ran["snapshots"] >= 1
    again = jobs.tick(db)
    assert again["snapshots"] == 0
    # a salesman may neither backfill nor list
    owner.post(
        "/api/v1/staff",
        json={"name": "Ali", "phone": "03211234567", "password": "secret123", "role": "salesman"},
    )
    from tests.conftest import login

    ali = login(client, "03211234567")
    assert ali.post("/api/v1/shop-audit/snapshots/backfill").status_code == 403
