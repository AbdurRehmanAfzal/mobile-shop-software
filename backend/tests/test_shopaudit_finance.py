"""Shop Audit P4 (docs/17): P&L with its series and the period before; cash & bank by reason and
channel; remittances; expenses; tax rows. Reasons and channels must add up to the account
movements, expenses must never be counted twice, and the tax rows must sum to the summary."""

import datetime as dt

from app.core.clock import today as shop_today
from app.modules.expenses.service import seed_categories
from tests.conftest import login
from tests.test_devices import _stock
from tests.test_purchases import _dev, _party
from tests.test_returns import _customer

A, B, C = "490154203237518", "356938035643809", "352099001761481"


def _month():
    t = shop_today()
    return {"date_from": t.replace(day=1).isoformat(), "date_to": t.isoformat()}


def test_pnl_series_and_previous_period(owner, cat, db):
    seed_categories(db)
    cats = {x["key"]: x for x in owner.get("/api/v1/expenses/categories").json()}
    today = shop_today()
    d_prev = today - dt.timedelta(days=40)
    sup = _party(owner, name="Dealer", phone="03005556666", kinds=("supplier",))
    r = owner.post(
        "/api/v1/purchases",
        json={
            "kind": "supplier",
            "party_id": sup["id"],
            "date": d_prev.isoformat(),
            "devices": [
                {"device": _dev(cat, A), "cost": 800, "asking_price": 1000},
                {"device": _dev(cat, B), "cost": 800, "asking_price": 1000},
            ],
            "paid": 1600,
        },
    )
    ids = [ln["device_id"] for ln in r.json()["lines"]]
    # 40 days ago: a sale for 1,000; today: a sale for 1,200, tea 100, owner took 500
    owner.post(
        "/api/v1/sales",
        json={
            "date": d_prev.isoformat(),
            "devices": [{"device_id": ids[0], "price": 1000}],
            "paid": 1000,
        },
    )
    owner.post(
        "/api/v1/sales", json={"devices": [{"device_id": ids[1], "price": 1200}], "paid": 1200}
    )
    owner.post("/api/v1/expenses", json={"category_id": cats["tea"]["id"], "amount": 100})
    owner.post("/api/v1/expenses", json={"category_id": cats["owner_drawing"]["id"], "amount": 500})

    q = {"date_from": (today - dt.timedelta(days=30)).isoformat(), "date_to": today.isoformat()}
    o = owner.get("/api/v1/shop-audit/pnl", params=q).json()
    assert o["granularity"] == "day" and len(o["series"]) == 31
    cur, prev = o["current"], o["previous"]
    assert cur["net_sales"] == "1200.00" and cur["cogs"] == "800.00"
    assert cur["operating_expenses"] == "100.00" and cur["net_profit"] == "300.00"
    assert cur["owner_drawing"] == "500.00"
    assert prev["net_sales"] == "1000.00" and prev["net_profit"] == "200.00"
    last = o["series"][-1]
    assert last["bucket"] == today.isoformat() and last["net_sales"] == "1200.00"
    assert last["expenses"] == "100.00" and last["net_profit"] == "300.00"
    assert sum(float(s["net_sales"]) for s in o["series"]) == 1200.0
    # a year is bucketed by month; the series still sums to the period
    y = owner.get("/api/v1/shop-audit/pnl", params={"preset": "this_year"}).json()
    assert y["granularity"] in ("week", "month")
    assert round(sum(float(s["net_profit"]) for s in y["series"]), 2) == float(
        y["current"]["net_profit"]
    )


def test_cash_by_reason_channel_and_remittance(owner, cat, db):
    seed_categories(db)
    cats = {x["key"]: x for x in owner.get("/api/v1/expenses/categories").json()}
    cus = _customer(owner)
    # cash sale 1,000; credit sale 2,000 then 500 received; remittance sale 37,100 (SAR 500 @ 74.2)
    d1 = _stock(owner, cat, imei=A, condition="box_pack", cost_price=800, asking_price=1000)
    d2 = _stock(owner, cat, imei=B, condition="box_pack", cost_price=1500, asking_price=2000)
    d3 = _stock(owner, cat, imei=C, condition="box_pack", cost_price=30000, asking_price=37100)
    owner.post(
        "/api/v1/sales", json={"devices": [{"device_id": d1["id"], "price": 1000}], "paid": 1000}
    )
    inv = owner.post(
        "/api/v1/sales",
        json={
            "party_id": cus["id"],
            "devices": [{"device_id": d2["id"], "price": 2000}],
            "paid": 0,
        },
    ).json()
    owner.post(
        "/api/v1/payments",
        json={
            "party_id": cus["id"],
            "direction": "in",
            "amount": 500,
            "method": "cash",
            "allocations": [{"document_type": "invoice", "document_id": inv["id"], "amount": 500}],
        },
    )
    r = owner.post(
        "/api/v1/sales",
        json={
            "party_id": cus["id"],
            "devices": [{"device_id": d3["id"], "price": 37100}],
            "paid": 37100,
            "payment": {
                "method": "remittance",
                "currency": "SAR",
                "foreign_amount": 500,
                "rate": 74.2,
                "sender_name": "Ahmed Raza",
                "country": "Saudi Arabia",
                "service": "Western Union",
                "reference": "MTCN 1234567890",
            },
        },
    )
    assert r.status_code == 201, r.text
    owner.post("/api/v1/expenses", json={"category_id": cats["tea"]["id"], "amount": 100})
    accounts = {a["kind"]: a for a in owner.get("/api/v1/ledger/accounts").json()}
    owner.post(
        "/api/v1/ledger/transfers",
        json={
            "from_account_id": accounts["cash"]["id"],
            "to_account_id": accounts["remittance"]["id"],
            "amount": 300,
        },
    )

    c = owner.get("/api/v1/shop-audit/cash", params=_month()).json()
    cash = next(a for a in c["accounts"] if a["kind"] == "cash")
    assert cash["in"]["sales_now"] == "1000.00" and cash["in"]["udhaar_received"] == "500.00"
    assert cash["out"]["expenses"] == "100.00" and cash["out"]["transfer_out"] == "300.00"
    # reasons add up to the account's movement
    assert sum(float(v) for v in cash["in"].values()) == float(cash["cash_in"]) == 1500.0
    assert sum(float(v) for v in cash["out"].values()) == float(cash["cash_out"]) == 400.0
    assert cash["closing"] == "1100.00" and cash["transfers_out"] == "300.00"
    remit = next(a for a in c["accounts"] if a["kind"] == "remittance")
    assert remit["in"]["sales_now"] == "37100.00" and remit["in"]["transfer_in"] == "300.00"
    assert c["in"]["sales_now"] == "38100.00" and c["in_total"] == "38900.00"
    assert c["out_total"] == "400.00" and c["closing"] == "38500.00"
    kinds = {k["kind"]: k for k in c["by_kind"]}
    # channels exclude the transfer on both sides
    assert kinds["cash"]["in"] == "1500.00" and kinds["cash"]["out"] == "100.00"
    assert kinds["remittance"]["in"] == "37100.00"
    methods = {m["method"]: m for m in c["payments_by_method"]}
    assert methods["cash"]["in"] == "500.00" and methods["cash"]["count"] == 1

    i = owner.get("/api/v1/shop-audit/international", params=_month()).json()
    assert len(i["rows"]) == 1 and i["total_pkr_in"] == "37100.00"
    row = i["rows"][0]
    assert row["currency"] == "SAR" and row["foreign_amount"] == "500.00" and row["rate"] == "74.20"
    assert row["sender_name"] == "Ahmed Raza" and row["service"] == "Western Union"
    assert row["party_name"] == cus["name"] and row["fee"] is None
    assert i["by_currency"][0] == {
        "currency": "SAR",
        "foreign_amount": "500.00",
        "pkr_amount": "37100.00",
        "fees": "0.00",
        "net": "37100.00",
        "count": 1,
    }

    # the expense is in the P&L once and in the cash-out once; the transfer is in neither P&L side
    pnl = owner.get("/api/v1/shop-audit/pnl", params=_month()).json()["current"]
    assert pnl["operating_expenses"] == "100.00"
    assert float(pnl["net_sales"]) == 1000 + 2000 + 37100


def test_expenses_and_tax_views(owner, cat, db, client):
    seed_categories(db)
    cats = {x["key"]: x for x in owner.get("/api/v1/expenses/categories").json()}
    owner.post("/api/v1/expenses", json={"category_id": cats["tea"]["id"], "amount": 100})
    owner.post("/api/v1/expenses", json={"category_id": cats["tea"]["id"], "amount": 60})
    owner.post(
        "/api/v1/expenses",
        json={"category_id": cats["rent"]["id"], "amount": 5000, "description": "October"},
    )
    owner.post("/api/v1/expenses", json={"category_id": cats["owner_drawing"]["id"], "amount": 900})
    e = owner.get("/api/v1/shop-audit/expenses", params=_month()).json()
    assert e["total"] == "5160.00" and e["owner_drawing"] == "900.00" and e["count"] == 4
    assert e["by_category"][0]["key"] == "rent" and e["by_category"][0]["amount"] == "5000.00"
    tea = next(x for x in e["by_category"] if x["key"] == "tea")
    assert tea["amount"] == "160.00" and tea["count"] == 2
    assert e["largest"][0]["description"] == "October" and e["largest"][0]["user_name"]
    assert all(x["category"] != "owner_drawing" for x in e["largest"])
    assert e["by_account"][0]["kind"] == "cash" and e["by_user"][0]["count"] == 4
    assert sum(float(s["amount"]) for s in e["series"]) == 6060.0
    assert e["previous_total"] == "0.00"

    cus = _customer(owner)
    owner.patch(
        "/api/v1/shops/current", json={"tax_enabled": True, "tax_rate": 18, "tax_inclusive": False}
    )
    d = _stock(owner, cat, imei=A, condition="box_pack", cost_price=800, asking_price=1000)
    owner.post(
        "/api/v1/sales",
        json={
            "party_id": cus["id"],
            "devices": [{"device_id": d["id"], "price": 1000}],
            "paid": 1180,
        },
    )
    owner.patch("/api/v1/shops/current", json={"tax_enabled": False})
    d2 = _stock(owner, cat, imei=B, condition="box_pack", cost_price=800, asking_price=1000)
    owner.post(
        "/api/v1/sales", json={"devices": [{"device_id": d2["id"], "price": 1000}], "paid": 1000}
    )
    t = owner.get("/api/v1/shop-audit/tax", params=_month()).json()
    assert t["invoices"] == 2 and t["taxed_invoices"] == 1 and len(t["rows"]) == 1
    row = t["rows"][0]
    assert (
        row["taxable"] == "1000.00" and row["tax_amount"] == "180.00" and row["tax_rate"] == "18.00"
    )
    assert row["party_name"] == cus["name"] and row["tax_inclusive"] is False
    assert t["tax_on_invoices"] == "180.00" and t["tax_net_of_returns"] == "180.00"
    assert any("purchases" in n for n in t["notes"])

    # a salesman sees none of it
    owner.post(
        "/api/v1/staff",
        json={"name": "Ali", "phone": "03211234567", "password": "secret123", "role": "salesman"},
    )
    ali = login(client, "03211234567")
    for path in ("pnl", "cash", "international", "expenses", "tax"):
        assert ali.get(f"/api/v1/shop-audit/{path}").status_code == 403
