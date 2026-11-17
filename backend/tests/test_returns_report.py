"""Owner 2026-11-17 (ADR-097): the returns report — every phone that came back with when, who,
how much, what was handed back, the cut, the effect on profit, why, where it is now, whether it was
sold again and whether the customer took another phone; counts on the dashboard and the overview."""

from app.core.clock import today as shop_today
from tests.conftest import login
from tests.test_purchases import _dev, _party
from tests.test_returns import IMEI_A, IMEI_B, _customer, _sell

IMEI_C = "352099001761481"


def test_report_of_a_customer_return(client, owner, cat):
    c = _customer(owner)
    # sold for 13,000 (cost 10,000), paid in full; comes back, 12,500 handed back, 500 cut
    d, inv = _sell(owner, cat, c, IMEI_A, 13000, 13000, cost=10000)
    r = owner.post(
        "/api/v1/returns/sale",
        json={
            "invoice_id": inv["id"],
            "line_ids": [inv["lines"][0]["id"]],
            "settlement": "refund",
            "refund_amount": 12500,
            "kept_amount": 500,
            "reason_code": "fault",
            "reason": "mic not working",
        },
    )
    assert r.status_code == 201, r.text
    assert r.json()["reason_code"] == "fault"
    # the reason is on the phone's history too
    hist = owner.get(f"/api/v1/devices/{d['id']}/history").json()
    assert hist[-1]["data"]["reason_code"] == "fault"

    rep = owner.get("/api/v1/returns/report").json()
    today = shop_today().isoformat()
    assert rep["date_to"] == today and rep["show_cost"] is True
    (row,) = rep["sale"]["rows"]
    assert row["no"] == "RET-000001" and row["bill_no"] == inv["no"]
    assert row["date"] == today and row["days_after"] == 0
    assert row["party_name"] == "Ahmed Khan" and row["party_phone"] == "03219876543"
    assert row["by"] and row["reason_code"] == "fault" and row["reason"] == "mic not working"
    assert (row["amount"], row["refund"], row["kept"], row["to_khata"]) == (
        "13000.00",
        "12500.00",
        "500.00",
        "0.00",
    )
    assert row["refund_account"]
    # the sale's 3,000 profit is gone; the 500 cut is what the shop made instead
    assert row["profit_undone"] == "3000.00" and row["net"] == "-2500.00"
    (it,) = row["items"]
    assert it["imei"] == IMEI_A and it["price"] == "13000.00" and it["cost"] == "10000.00"
    assert it["status_now"] == "in_stock" and "sold_again" not in it
    assert row["another_bill"] is None
    t = rep["sale"]["totals"]
    assert (t["count"], t["phones"], t["phones_sold"], t["rate_pct"]) == (1, 1, 1, 100.0)
    assert (t["amount"], t["refund"], t["kept"], t["net"]) == (
        "13000.00",
        "12500.00",
        "500.00",
        "-2500.00",
    )
    assert rep["sale"]["by_reason"] == [{"key": "fault", "count": 1, "amount": "13000.00"}]
    assert rep["sale"]["by_user"][0]["count"] == 1 and rep["sale"]["by_user"][0]["name"]
    assert rep["purchase"]["rows"] == []

    # the customer takes another phone the same day; the returned one is sold again to someone else
    _d2, inv2 = _sell(owner, cat, c, IMEI_B, 9000, 9000, cost=8000)
    other = _party(owner, name="Bilal", phone="03001111111", kinds=("customer",))
    again = owner.post(
        "/api/v1/sales",
        json={
            "party_id": other["id"],
            "devices": [{"device_id": d["id"], "price": 12000}],
            "paid": 12000,
        },
    )
    assert again.status_code == 201, again.text
    (row,) = owner.get("/api/v1/returns/report").json()["sale"]["rows"]
    assert row["another_bill"]["no"] == inv2["no"] and row["another_bill"]["total"] == "9000.00"
    sold_again = row["items"][0]["sold_again"]
    assert sold_again["price"] == "12000.00" and sold_again["profit"] == "2000.00"
    assert row["items"][0]["status_now"] == "sold"
    t = owner.get("/api/v1/returns/report").json()["sale"]["totals"]
    assert t["took_another"] == 1 and t["sold_again"] == 1 and t["phones_sold"] == 3

    # the dashboard and the business overview count it
    dash = owner.get("/api/v1/reports/dashboard").json()
    assert dash["returns_today"] == 1 and dash["returns_month"] == 1
    ov = owner.get("/api/v1/reports/overview").json()["returns"]["sale"]
    assert (ov["count"], ov["phones"], ov["refund"], ov["kept"]) == (
        1,
        1,
        "12500.00",
        "500.00",
    )
    # the shop audit shows the same report for its period
    aud = owner.get("/api/v1/shop-audit/returns", params={"preset": "today"}).json()
    assert aud["sale"]["totals"]["count"] == 1 and aud["sale"]["rows"][0]["no"] == "RET-000001"

    # a salesman sees the returns, never the cost or the profit
    owner.post(
        "/api/v1/staff",
        json={"name": "Sales", "phone": "03451112244", "password": "secret123", "role": "salesman"},
    )
    s = login(client, "03451112244").get("/api/v1/returns/report").json()
    (srow,) = s["sale"]["rows"]
    assert s["show_cost"] is False and srow["refund"] == "12500.00"
    assert "profit_undone" not in srow and "net" not in srow and "cost" not in srow["items"][0]
    assert "net" not in s["sale"]["totals"]

    # the phone was sold again, so this return can no longer be undone: it stays in the report
    void = owner.post(f"/api/v1/returns/{row['id']}/void", json={"reason": "entered by mistake"})
    assert void.status_code == 409, void.text
    assert len(owner.get("/api/v1/returns/report").json()["sale"]["rows"]) == 1


def test_an_undone_return_leaves_the_report(owner, cat):
    c = _customer(owner)
    _d, inv = _sell(owner, cat, c, IMEI_A, 5000, 5000, cost=4000)
    r = owner.post(
        "/api/v1/returns/sale",
        json={"invoice_id": inv["id"], "line_ids": [inv["lines"][0]["id"]], "settlement": "refund"},
    ).json()
    assert owner.get("/api/v1/reports/dashboard").json()["returns_today"] == 1
    void = owner.post(f"/api/v1/returns/{r['id']}/void", json={"reason": "entered by mistake"})
    assert void.status_code == 200, void.text
    rep = owner.get("/api/v1/returns/report").json()
    assert rep["sale"]["rows"] == [] and rep["sale"]["totals"]["voided"] == 1
    assert owner.get("/api/v1/reports/dashboard").json()["returns_today"] == 0
    assert owner.get("/api/v1/reports/overview").json()["returns"]["sale"]["count"] == 0


def test_report_of_a_return_to_the_supplier_and_other_shops(owner, other_owner, cat):
    sup = _party(owner)
    p = owner.post(
        "/api/v1/purchases",
        json={
            "kind": "supplier",
            "party_id": sup["id"],
            "devices": [{"device": _dev(cat, IMEI_C), "cost": 6000, "asking_price": 7000}],
            "paid": 6000,
        },
    ).json()
    r = owner.post(
        "/api/v1/returns/purchase",
        json={
            "purchase_id": p["id"],
            "line_ids": [p["lines"][0]["id"]],
            "refund_amount": 5700,
            "cut_amount": 300,
            "reason_code": "not_selling",
        },
    )
    assert r.status_code == 201, r.text
    rep = owner.get("/api/v1/returns/report").json()
    (row,) = rep["purchase"]["rows"]
    assert row["party_name"] == "Rehman Traders" and row["reason_code"] == "not_selling"
    assert (row["amount"], row["refund"], row["kept"], row["net"]) == (
        "6000.00",
        "5700.00",
        "300.00",
        "-300.00",
    )
    assert row["items"][0]["imei"] == IMEI_C and row["items"][0]["price"] == "6000.00"
    assert rep["purchase"]["totals"]["net"] == "-300.00" and rep["sale"]["totals"]["count"] == 0
    # unknown reason codes are refused; another shop sees nothing
    bad = owner.post(
        "/api/v1/returns/purchase",
        json={"purchase_id": p["id"], "line_ids": [p["lines"][0]["id"]], "reason_code": "x"},
    )
    assert bad.status_code == 422
    theirs = other_owner.get("/api/v1/returns/report").json()
    assert theirs["purchase"]["rows"] == [] and theirs["sale"]["rows"] == []
    assert other_owner.get("/api/v1/reports/dashboard").json()["returns_month"] == 0
    # dates the wrong way round are refused
    bad = owner.get(
        "/api/v1/returns/report", params={"date_from": "2026-05-02", "date_to": "2026-05-01"}
    )
    assert bad.status_code == 422
