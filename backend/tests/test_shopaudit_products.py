"""Shop Audit P7 (docs/17): product performance from the bill lines with transparent classes,
purchases vs sales per bucket, and the invoice audit by kind / status / employee."""

import datetime as dt

from app.core.clock import today as shop_today
from tests.conftest import login
from tests.test_purchases import _dev, _party
from tests.test_returns import _customer

IMEIS = [
    "490154203237518",
    "356938035643809",
    "352099001761481",
    "358812091717195",
    "358812091717196",
]


def _seed(owner, client, cat):
    """Five Nokia 105s bought 20 days ago (800 each); four sold this month by the owner and a
    salesman (1,000 / 1,000 / 1,200 / 900), one of them returned; a charger sold for 300."""
    t = shop_today()
    d20 = t - dt.timedelta(days=20)
    dealer = _party(owner, name="Dealer", phone="03005556666", kinds=("supplier",))
    cus = _customer(owner)
    r = owner.post(
        "/api/v1/purchases",
        json={
            "kind": "supplier",
            "party_id": dealer["id"],
            "date": d20.isoformat(),
            "devices": [{"device": _dev(cat, i), "cost": 800, "asking_price": 1000} for i in IMEIS],
            "paid": 4000,
        },
    )
    assert r.status_code == 201, r.text
    ids = [ln["device_id"] for ln in r.json()["lines"]]
    owner.post(
        "/api/v1/staff",
        json={"name": "Ali", "phone": "03211234567", "password": "secret123", "role": "salesman"},
    )
    ali = login(client, "03211234567")
    assert (
        owner.post(
            "/api/v1/sales", json={"devices": [{"device_id": ids[0], "price": 1000}], "paid": 1000}
        ).status_code
        == 201
    )
    assert (
        ali.post(
            "/api/v1/sales", json={"devices": [{"device_id": ids[1], "price": 1000}], "paid": 1000}
        ).status_code
        == 201
    )
    assert (
        ali.post(
            "/api/v1/sales",
            json={
                "party_id": cus["id"],
                "devices": [{"device_id": ids[2], "price": 1200}],
                "paid": 700,
            },
        ).status_code
        == 201
    )
    inv = owner.post(
        "/api/v1/sales",
        json={"party_id": cus["id"], "devices": [{"device_id": ids[3], "price": 900}], "paid": 900},
    ).json()
    r = owner.post(
        "/api/v1/returns/sale",
        json={
            "invoice_id": inv["id"],
            "line_ids": [inv["lines"][0]["id"]],
            "settlement": "refund",
            "refund_amount": 900,
            "kept_amount": 0,
            "reason": "fault",
        },
    )
    assert r.status_code == 201, r.text
    assert (
        owner.post(
            "/api/v1/sales",
            json={
                "misc": [{"description": "Charger", "qty": 1, "unit_price": 300, "cost": 150}],
                "paid": 300,
            },
        ).status_code
        == 201
    )
    void = ali.post(
        "/api/v1/sales", json={"devices": [{"device_id": ids[4], "price": 1000}], "paid": 1000}
    ).json()
    assert owner.post(
        f"/api/v1/sales/{void['id']}/void", json={"reason": "typed twice"}
    ).status_code in (200, 201)
    return t, ali


def test_products_by_model_with_classes_and_series(owner, client, cat):
    _t, ali = _seed(owner, client, cat)
    pr = owner.get("/api/v1/shop-audit/products", params={"preset": "this_month"}).json()
    assert pr["group"] == "model" and pr["total_units"] == 4 and pr["total_revenue"] == "3500.00"
    assert (
        pr["total_profit"] == "950.00"
    )  # 3 phones × (price − 800) = 200 + 200 + 400 + charger 150
    rows = {r["label"]: r for r in pr["rows"]}
    nokia = next(r for r in rows.values() if r["kind"] == "device")
    assert nokia["label"].startswith("Nokia ")
    assert nokia["units"] == 3 and nokia["revenue"] == "3200.00" and nokia["cost"] == "2400.00"
    assert nokia["profit"] == "800.00" and nokia["margin_pct"] == 33.3
    assert nokia["avg_price"] == "1066.67" and nokia["avg_holding_days"] == 20.0
    assert nokia["returns"] == 1 and nokia["returns_amount"] == "900.00" and nokia["in_stock"] == 2
    assert nokia["share"] == 75.0 and nokia["performance"] == "top"
    charger = rows["Charger"]
    assert charger["kind"] == "misc" and charger["units"] == 1 and charger["profit"] == "150.00"
    assert charger["performance"] == "low" and pr["classes"] == {"top": 1, "average": 0, "low": 1}
    assert pr["thresholds"] == {"top_share": 20, "low_units": 1}
    today = [s for s in pr["series"] if s["units"]]
    assert (
        sum(s["units"] for s in pr["series"]) == 4
        and sum(s["bought_units"] for s in pr["series"]) == 5
    )
    assert today[-1]["revenue"] == "3500.00" and today[-1]["profit"] == "950.00"
    # brand and type roll-ups hold the phones only
    br = owner.get(
        "/api/v1/shop-audit/products", params={"preset": "this_month", "group": "brand"}
    ).json()
    assert [r["label"] for r in br["rows"]] == ["Nokia"] and br["rows"][0]["units"] == 3
    ct = owner.get(
        "/api/v1/shop-audit/products", params={"preset": "this_month", "group": "category"}
    ).json()
    assert ct["rows"][0]["label"] == "phone" and ct["total_units"] == 3
    assert owner.get("/api/v1/shop-audit/products", params={"group": "colour"}).status_code == 422
    # the owner lowers the top threshold: a 25 % share item is now "top" too
    owner.patch("/api/v1/shops/current", json={"audit_prefs": {"top_share": 25, "low_units": 0}})
    pr = owner.get("/api/v1/shop-audit/products", params={"preset": "this_month"}).json()
    assert [r["performance"] for r in pr["rows"]] == ["top", "top"]
    assert ali.get("/api/v1/shop-audit/products").status_code == 403


def test_invoice_audit_by_kind_status_and_employee(owner, client, cat):
    _t, ali = _seed(owner, client, cat)
    a = owner.get("/api/v1/shop-audit/invoices", params={"preset": "this_month"}).json()
    kinds = {k["kind"]: k for k in a["by_kind"]}
    assert (
        kinds["sale"]["count"] == 5
        and kinds["sale"]["voided"] == 1
        and kinds["sale"]["amount"] == "4400.00"
    )
    assert kinds["purchase"]["count"] in (
        0,
        1,
    )  # the purchase 20 days ago may or may not fall in this month
    assert kinds["sale_return"] == {
        "kind": "sale_return",
        "count": 1,
        "amount": "900.00",
        "voided": 0,
    }
    status = {s["status"]: s for s in a["by_status"]}
    assert status["partially_paid"]["count"] == 1 and status["partially_paid"]["due"] == "500.00"
    assert status["void"]["count"] == 1 and status["returned"]["count"] == 1
    users = {u["user_name"]: u for u in a["by_user"]}
    assert (
        users["Ali"]["sales"] == 2
        and users["Ali"]["sales_amount"] == "2200.00"
        and users["Ali"]["voids"] == 1
    )
    assert users[owner.me["user"]["name"]]["sales"] == 3
    assert (
        a["voided"][0]["kind"] == "sale"
        and a["voided"][0]["reason"] == "typed twice"
        and a["voided"][0]["by"]
    )
    assert a["totals"]["voided"] == 1
    assert ali.get("/api/v1/shop-audit/invoices").status_code == 403
