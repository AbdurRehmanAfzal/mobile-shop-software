"""Reports audit R2 / R3 (docs/31): the sales report and the purchase report reconcile with the
overview, the P&L-side product figures and each bill; at the counter vs credit, payment status,
per employee / person, filters, cost gating, roles and shop isolation."""

import datetime as dt

from tests.conftest import login
from tests.test_shopaudit_products import _seed


def _win(t):
    return {"date_from": (t - dt.timedelta(days=21)).isoformat(), "date_to": t.isoformat()}


def test_sales_report_reconciles_and_splits_how_bills_were_paid(owner, client, cat):
    t, ali = _seed(owner, client, cat)
    win = _win(t)
    s = owner.get("/api/v1/shop-audit/sales", params=win).json()
    tot = s["totals"]
    # five live bills (the void one is out): 1,000 + 1,000 + 1,200 + 900 + 300
    assert tot["bills"] == 5 and tot["billed"] == "4400.00" and tot["units"] == 4
    ov = owner.get("/api/v1/shop-audit/overview", params=win).json()
    assert ov["sales"]["invoices"] == 5 and ov["sales"]["invoices_total"] == tot["billed"]
    pr = owner.get("/api/v1/shop-audit/products", params=win).json()
    assert tot["profit"] == pr["total_profit"] == "950.00"  # same reading as Products
    # 1,200 bill paid 700 at the counter: the only credit sale
    assert tot["at_counter"] == "3900.00" and tot["on_credit"] == "500.00"
    assert tot["cash_bills"] == 4 and tot["credit_bills"] == 1 and tot["due"] == "500.00"
    st = {r["status"]: r for r in s["by_status"]}
    assert st["paid"]["count"] == 3 and st["paid"]["amount"] == "2300.00"
    assert st["partial"]["count"] == 1 and st["partial"]["due"] == "500.00"
    assert st["returned"]["count"] == 1 and st["unpaid"]["count"] == 0
    assert sum(r["count"] for r in s["by_status"]) == tot["bills"]
    # the series adds up to the period
    assert sum(r["bills"] for r in s["series"]) == 5
    assert sum(float(r["billed"]) for r in s["series"]) == 4400.0
    # per employee: Ali 2 bills (profit 200 + 400), the owner 3 bills and the return
    users = {u["user_name"]: u for u in s["by_user"]}
    a = users["Ali"]
    assert a["bills"] == 2 and a["billed"] == "2200.00" and a["profit"] == "600.00"
    assert a["on_credit"] == "500.00" and a["returns"] == 0
    o = next(u for n, u in users.items() if n != "Ali")
    assert o["bills"] == 3 and o["profit"] == "350.00" and o["returns"] == 1
    assert o["returns_amount"] == "900.00"
    assert sum(float(u["billed"]) for u in s["by_user"]) == 4400.0
    # per customer: the named customer has the 1,200 and the 900 bills
    named = [r for r in s["by_party"] if r["party_id"]]
    assert named[0]["bills"] == 2 and named[0]["billed"] == "2100.00"
    # filters: status, employee, text
    part = owner.get("/api/v1/shop-audit/sales", params={**win, "status": "partial"}).json()
    assert part["totals"]["bills"] == 1 and part["rows"][0]["due"] == "500.00"
    assert part["rows"][0]["pay_status"] == "partial" and part["rows"][0]["user_name"] == "Ali"
    ali_id = a["user_id"]
    only = owner.get("/api/v1/shop-audit/sales", params={**win, "user_id": ali_id}).json()
    assert only["totals"]["billed"] == "2200.00" and len(only["by_user"]) == 1
    no = part["rows"][0]["no"]
    found = owner.get("/api/v1/shop-audit/sales", params={**win, "q": no}).json()
    assert found["rows_total"] == 1 and found["rows"][0]["no"] == no
    # money is never a float on the wire
    assert isinstance(tot["billed"], str) and isinstance(s["rows"][0]["paid"], str)
    # salesman: no reports
    assert ali.get("/api/v1/shop-audit/sales", params=win).status_code == 403
    assert owner.get("/api/v1/shop-audit/sales", params={"status": "nope"}).status_code == 422


def test_purchase_report_reconciles_and_is_cost_only(owner, other_owner, client, cat):
    t, ali = _seed(owner, client, cat)
    win = _win(t)
    p = owner.get("/api/v1/shop-audit/purchases", params=win).json()
    tot = p["totals"]
    ov = owner.get("/api/v1/shop-audit/overview", params=win).json()
    assert tot["bills"] == ov["purchases"]["purchases"] == 1
    assert tot["total"] == ov["purchases"]["purchases_total"] == "4000.00"
    assert tot["phones"] == 5 and tot["at_counter"] == "4000.00" and tot["on_credit"] == "0.00"
    assert tot["owed"] == "0.00" and tot["cash_bills"] == 1 and tot["credit_bills"] == 0
    assert p["by_party"][0]["name"] == "Dealer" and p["by_party"][0]["phones"] == 5
    assert sum(r["bills"] for r in p["series"]) == 1
    assert p["rows"][0]["pay_status"] == "paid"
    # a supplier bill on credit: half paid now
    from tests.test_purchases import _dev, _party

    dealer2 = _party(owner, name="Dealer Two", phone="03007778888", kinds=("supplier",))
    r = owner.post(
        "/api/v1/purchases",
        json={
            "kind": "supplier",
            "party_id": dealer2["id"],
            "devices": [{"device": _dev(cat, "353918052371111"), "cost": 2000}],
            "paid": 500,
        },
    )
    assert r.status_code == 201, r.text
    p = owner.get("/api/v1/shop-audit/purchases", params=win).json()
    assert p["totals"]["total"] == "6000.00" and p["totals"]["on_credit"] == "1500.00"
    assert p["totals"]["owed"] == "1500.00" and p["totals"]["credit_bills"] == 1
    owed = owner.get("/api/v1/shop-audit/purchases", params={**win, "status": "partial"}).json()
    assert owed["rows_total"] == 1 and owed["rows"][0]["party_name"] == "Dealer Two"
    # salesman: 403; another shop sees nothing of this one
    assert ali.get("/api/v1/shop-audit/purchases", params=win).status_code == 403
    other = other_owner.get("/api/v1/shop-audit/purchases", params=win).json()
    assert other["totals"]["bills"] == 0 and other["rows"] == []
    other_s = other_owner.get("/api/v1/shop-audit/sales", params=win).json()
    assert other_s["totals"]["bills"] == 0 and other_s["totals"]["billed"] == "0.00"


def test_manager_sees_both_reports(owner, client, cat):
    _seed(owner, client, cat)
    owner.post(
        "/api/v1/staff",
        json={"name": "Mo", "phone": "03219998888", "password": "secret123", "role": "manager"},
    )
    mgr = login(client, "03219998888")
    assert mgr.get("/api/v1/shop-audit/sales", params={"preset": "this_year"}).status_code == 200
    assert mgr.get("/api/v1/shop-audit/purchases", params={"preset": "all_time"}).status_code == 200


def test_staff_report_agrees_with_sales_and_hides_security_from_the_manager(owner, client, cat):
    t, ali = _seed(owner, client, cat)
    win = _win(t)
    st = owner.get("/api/v1/shop-audit/staff", params=win).json()
    s = owner.get("/api/v1/shop-audit/sales", params=win).json()
    rows = {r["user_name"]: r for r in st["rows"]}
    a = rows["Ali"]
    assert a["sales"]["bills"] == 2 and a["sales"]["profit"] == "600.00"
    assert a["sales"]["on_credit"] == "500.00"
    assert st["totals"]["sales_billed"] == s["totals"]["billed"] == "4400.00"
    assert sum(float(r["sales"]["billed"]) for r in st["rows"] if r["sales"]) == 4400.0
    o = next(r for n, r in rows.items() if n != "Ali")
    assert o["purchases"]["bills"] == 1 and o["purchases"]["total"] == "4000.00"
    assert o["sales"]["returns"] == 1
    # owner sees the security counts: the void Ali typed is voided by the owner
    assert st["security_shown"] is True
    assert o["security"] and o["security"]["kinds"].get("void", 0) >= 1
    owner.post(
        "/api/v1/staff",
        json={"name": "Mo", "phone": "03219998888", "password": "secret123", "role": "manager"},
    )
    mgr = login(client, "03219998888")
    m = mgr.get("/api/v1/shop-audit/staff", params=win).json()
    assert m["security_shown"] is False and all(r["security"] is None for r in m["rows"])
    assert m["totals"]["sales_billed"] == "4400.00"
    assert ali.get("/api/v1/shop-audit/staff", params=win).status_code == 403


def test_people_counts_and_supplier_wise_stock(owner, client, cat):
    t, _ali = _seed(owner, client, cat)
    win = _win(t)
    rk = owner.get("/api/v1/shop-audit/rankings", params=win).json()
    c = rk["counts"]
    # one customer and one supplier were added today, both dealt with the shop in the window
    assert c["customer"]["total"] >= 1 and c["customer"]["new"] >= 1
    assert c["customer"]["active"] == 1
    assert c["supplier"]["total"] == 1 and c["supplier"]["active"] == 1
    # a window that ends before they existed counts nothing
    old = owner.get(
        "/api/v1/shop-audit/rankings",
        params={"date_from": "2020-01-01", "date_to": "2020-01-31"},
    ).json()["counts"]
    assert old["customer"]["total"] == 0 and old["supplier"]["new"] == 0
    inv = owner.get("/api/v1/shop-audit/inventory").json()
    sup = inv["by_supplier"]
    # the voided and the returned Nokia are back in stock, both from Dealer; counts add up
    assert sum(r["count"] for r in sup) == inv["count"] == 2
    assert sup[0]["name"] == "Dealer" and sup[0]["cost"] == "1600.00"


def test_overview_attention_and_udhaar_installments(owner, db, cat):
    import uuid

    from app.core.clock import today
    from app.modules.installments.models import InstallmentPlan
    from tests.test_devices import _stock
    from tests.test_purchases import _party

    c = _party(owner, name="Ahmed Khan", phone="03219876543", kinds=("customer",))
    d = _stock(owner, cat, imei="490154203237518", condition="box_pack", cost_price=40000, asking_price=60000)
    used = _stock(owner, cat, imei="356938035643809", condition="used", cost_price=10000, asking_price=None)
    r = owner.post(
        "/api/v1/sales",
        json={
            "party_id": c["id"],
            "devices": [{"device_id": d["id"], "price": 60000}],
            "paid": 15000,
            "installments": {"months": 5, "due_day": 10},
        },
    )
    assert r.status_code == 201, r.text
    plan_id = owner.get("/api/v1/installments").json()[0]["id"]
    plan = db.get(InstallmentPlan, uuid.UUID(plan_id))
    plan.first_due = today() - dt.timedelta(days=40)
    db.commit()
    ov = owner.get("/api/v1/shop-audit/overview", params={"preset": "this_month"}).json()
    at = ov["attention"]
    assert at["installments_overdue"] == 1 and float(at["installments_late_amount"]) > 0
    # the used phone in stock has no asking price → an alert; its ID check state is counted
    stock = owner.get(f"/api/v1/devices/{used['id']}").json()
    assert at["alerts_total"] >= 1 and at["alerts"].get("missing_asking", 0) >= 1
    vs = stock["verification_status"]
    assert at["verification_pending"] == (1 if vs == "pending" else 0)
    ud = owner.get("/api/v1/shop-audit/udhaar", params={"preset": "this_month"}).json()
    ins = ud["installments"]
    assert ins["open"] == 1 and ins["remaining"] == "45000.00" and ins["late_plans"] == 1
    assert ins["rows"][0]["invoice_no"] and ins["rows"][0]["party_name"] == "Ahmed Khan"
    # the plan's bill is part of the receivable, not added on top of it
    assert float(ud["receivable"]["current"]) >= 45000.0


def test_complete_report_has_sales_purchases_staff_and_insights(owner, client, cat):
    t, _ali = _seed(owner, client, cat)
    win = _win(t)
    secs = "summary,insights,sales,purchases,staff"
    j = owner.get(
        "/api/v1/shop-audit/report", params={**win, "sections": secs, "format": "json"}
    ).json()
    keys = [s["key"] for s in j["sections"]]
    assert keys[:2] == ["summary", "insights"]
    assert {"sales", "sales_users", "purchases", "purchase_parties", "staff"} <= set(keys)
    by = {s["key"]: s for s in j["sections"]}
    sales_kv = {r[0]: r[1] for r in by["sales"]["rows"]}
    assert sales_kv["Billed (tax included)"] == "4400.00"
    assert sales_kv["At the counter / on credit"] == "3,900.00 / 500.00"
    topics = [r[0] for r in by["insights"]["rows"]]
    assert "checks" in topics and "top_product" in topics
    assert all(r[1] in ("good", "watch", "info") for r in by["insights"]["rows"])
    # detail adds the bill list; Excel has a sheet per section
    d = owner.get(
        "/api/v1/shop-audit/report",
        params={**win, "sections": "sales", "mode": "detail", "format": "json"},
    ).json()
    rows = next(s for s in d["sections"] if s["key"] == "sales_rows")["rows"]
    assert len(rows) == 5
    x = owner.get("/api/v1/shop-audit/report", params={**win, "sections": secs, "format": "xlsx"})
    assert x.status_code == 200 and x.content[:2] == b"PK"
    pdf = owner.get("/api/v1/shop-audit/report", params={**win, "sections": secs, "format": "pdf"})
    assert pdf.status_code == 200 and "Important business insights" in pdf.text
    assert "Employee activity" in pdf.text
