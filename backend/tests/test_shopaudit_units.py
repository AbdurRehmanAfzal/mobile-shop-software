"""Model-wise sales and purchases with each phone's trail (mock-up 22, ADR-134): the units and
totals agree with the products audit and the bills; the supplier, buyer, cost, profit and the
bill's paid / due are the documents' own; cost only with VIEW_COST."""

import datetime as dt

from tests.test_shopaudit_products import _seed


def test_sold_units_by_model_against_the_products_audit(owner, client, cat):
    t, ali = _seed(owner, client, cat)
    win = {"date_from": (t - dt.timedelta(days=21)).isoformat(), "date_to": t.isoformat()}
    u = owner.get("/api/v1/shop-audit/sales/units", params=win).json()
    pr = owner.get("/api/v1/shop-audit/products", params=win).json()
    nokia = next(r for r in pr["rows"] if r["kind"] == "device")
    assert len(u["models"]) == 1 and u["units"] == 3 and u["truncated"] is False
    m = u["models"][0]
    assert m["key"] == nokia["key"] and m["label"] == nokia["label"]
    # the same figures as the products audit: 3 phones not returned, the void left out
    assert m["units"] == nokia["units"] == 3
    assert m["revenue"] == nokia["revenue"] == "3200.00"
    assert m["cost"] == nokia["cost"] == "2400.00" and m["profit"] == nokia["profit"] == "800.00"
    rows = sorted(m["rows"], key=lambda r: r["price"])
    assert [r["price"] for r in rows] == ["1000.00", "1000.00", "1200.00"]
    assert all(r["supplier"] == "Dealer" and r["purchase_no"] for r in rows)
    assert all(r["cost"] == "800.00" for r in rows)
    credit = rows[-1]
    assert credit["buyer"] and credit["profit"] == "400.00"
    assert credit["pay_status"] == "partial" and credit["bill_paid"] == "700.00"
    assert credit["bill_due"] == "500.00"
    assert rows[0]["buyer"] is None and rows[0]["pay_status"] == "paid"
    assert m["highest_profit"]["invoice_id"] == credit["invoice_id"]
    assert m["lowest_cost"]["cost"] == "800.00"
    # a salesman may not open the audit at all
    assert ali.get("/api/v1/shop-audit/sales/units").status_code == 403


def test_bought_units_by_model_with_where_they_are_now(owner, client, cat):
    t, ali = _seed(owner, client, cat)
    win = {"date_from": (t - dt.timedelta(days=21)).isoformat(), "date_to": t.isoformat()}
    b = owner.get("/api/v1/shop-audit/purchases/units", params=win).json()
    assert b["units"] == 5 and len(b["models"]) == 1
    m = b["models"][0]
    assert m["units"] == 5 and m["invested"] == "4000.00"
    # three sold and kept, one came back, one sale voided: two in stock
    assert m["sold"] == 3 and m["in_stock"] == 2 and m["profit"] == "800.00"
    rows = m["rows"]
    assert all(r["supplier"] == "Dealer" and r["cost"] == "800.00" for r in rows)
    # the purchase bill: 4,000 billed, 4,000 paid
    assert {r["pay_status"] for r in rows} == {"paid"} and rows[0]["bill_owed"] == "0.00"
    sold = [r for r in rows if r["sold"]]
    assert sorted(r["sold_for"] for r in sold) == ["1000.00", "1000.00", "1200.00"]
    assert all(r["invoice_no"] for r in sold)
    assert m["lowest_cost"]["cost"] == m["highest_cost"]["cost"] == "800.00"
    # cost of purchases: owner / manager only
    assert ali.get("/api/v1/shop-audit/purchases/units").status_code == 403
