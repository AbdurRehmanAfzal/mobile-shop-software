"""FR-TXN-07 (S5 exchange) and FR-RPT-01/02, FR-TAX-03 reports."""

from app.modules.expenses.service import seed_categories
from tests.conftest import login
from tests.test_devices import _stock
from tests.test_purchases import _party

OLD = "490154203237518"
NEW = "356938035643809"


def _dev(cat, imei, **extra):
    return {
        "imei1": imei,
        "brand_id": cat["brand"]["id"],
        "model_id": cat["model"]["id"],
        "condition": "used",
        "pta_status": "pta_approved",
        **extra,
    }


def test_exchange_s5_arithmetic(owner, cat):
    """Previous balance 50,000; trade-in 80,000; new phone 200,000; pays 0 → new balance 170,000.
    (docs example also subtracts an earlier 50,000 payment already inside the previous balance.)"""
    c = _party(owner, name="Ahmed Khan", phone="03219876543", kinds=("customer",))
    owner.post(
        f"/api/v1/ledger/parties/{c['id']}/opening-balance",
        json={"amount": 50000, "party_owes": True},
    )
    new = _stock(owner, cat, imei=NEW, condition="box_pack", cost_price=180000, asking_price=200000)
    r = owner.post(
        "/api/v1/exchanges",
        json={
            "party_id": c["id"],
            "trade_in": [{"device": _dev(cat, OLD), "cost": 80000}],
            "devices": [{"device_id": new["id"], "price": 200000}],
            "paid": 0,
        },
    )
    assert r.status_code == 201, r.text
    ex = r.json()
    assert (
        ex["no"] == "EXC-000001"
        and ex["previous_balance"] == "50000.00"
        and ex["trade_in_value"] == "80000.00"
    )
    assert ex["new_total"] == "200000.00" and ex["new_balance"] == "170000.00"
    assert ex["purchase_no"].startswith("PUR-") and ex["invoice_no"].startswith("INV-")
    old = owner.get(f"/api/v1/devices/imei/{OLD}").json()["device"]
    assert (
        old["status"] == "in_stock"
        and old["verification_status"] == "pending"
        and old["cost_price"] == "80000.00"
    )
    assert owner.get(f"/api/v1/devices/{new['id']}").json()["status"] == "sold"


def test_exchange_with_refund_and_atomic_failure(owner, cat):
    c = _party(owner, name="Ahmed Khan", phone="03219876543", kinds=("customer",))
    cheap = _stock(owner, cat, imei=NEW, condition="box_pack", cost_price=3000, asking_price=5000)
    r = owner.post(
        "/api/v1/exchanges",
        json={
            "party_id": c["id"],
            "trade_in": [{"device": _dev(cat, OLD), "cost": 8000}],
            "devices": [{"device_id": cheap["id"], "price": 5000}],
            "refund": 3000,
        },
    )
    assert r.status_code == 201, r.text
    assert r.json()["new_balance"] == "0.00"
    assert owner.get("/api/v1/ledger/accounts").json()[0]["balance"] == "-3000.00"
    # failure in the sale half must not leave the trade-in purchase behind
    c2 = _party(owner, name="Sara", phone="03002222222", kinds=("customer",))
    before = len(owner.get("/api/v1/purchases").json())
    r = owner.post(
        "/api/v1/exchanges",
        json={
            "party_id": c2["id"],
            "trade_in": [{"device": _dev(cat, "356789104552375"), "cost": 1000}],
            "devices": [{"device_id": cheap["id"], "price": 5000}],
        },
    )
    assert r.status_code == 409  # cheap device already sold
    assert len(owner.get("/api/v1/purchases").json()) == before
    assert owner.get("/api/v1/devices/imei/356789104552375").json()["found"] is False


def test_reports_pnl_cash_tax_dashboard(db, owner, cat):
    seed_categories(db)
    cats = {x["key"]: x for x in owner.get("/api/v1/expenses/categories").json()}
    c = _party(owner, name="Ahmed", phone="03219876543", kinds=("customer",))
    d = _stock(owner, cat, imei=NEW, condition="box_pack", cost_price=800, asking_price=1000)
    owner.patch(
        "/api/v1/shops/current", json={"tax_enabled": True, "tax_rate": 18, "tax_inclusive": False}
    )
    owner.post(
        "/api/v1/sales",
        json={
            "party_id": c["id"],
            "devices": [{"device_id": d["id"], "price": 1000}],
            "paid": 1180,
        },
    )
    owner.post("/api/v1/expenses", json={"category_id": cats["tea"]["id"], "amount": 100})
    owner.post("/api/v1/expenses", json={"category_id": cats["owner_drawing"]["id"], "amount": 500})
    j = owner.post(
        "/api/v1/repairs", json={"party_id": c["id"], "device_desc": "A54", "fault_codes": ["mic"]}
    ).json()
    owner.patch(f"/api/v1/repairs/{j['id']}", json={"labour": 300})
    owner.post(f"/api/v1/repairs/{j['id']}/deliver", json={"paid": 300})
    pnl = owner.get("/api/v1/reports/profit-loss").json()
    assert pnl["sales"] == "1000.00" and pnl["cogs"] == "800.00" and pnl["gross_profit"] == "200.00"
    assert (
        pnl["repair_income"] == "300.00"
        and pnl["expenses"] == {"tea": "100.00"}
        and pnl["owner_drawing"] == "500.00"
    )
    assert pnl["net_profit"] == "400.00" and pnl["tax_collected"] == "180.00"
    cf = owner.get("/api/v1/reports/cash-flow").json()
    assert (
        cf[0]["cash_in"] == "1480.00"
        and cf[0]["cash_out"] == "600.00"
        and cf[0]["closing"] == "880.00"
    )
    tax = owner.get("/api/v1/reports/tax").json()
    assert (
        tax["taxed_invoices"] == 1
        and tax["taxable_sales"] == "1000.00"
        and tax["tax_on_invoices"] == "180.00"
    )
    dash = owner.get("/api/v1/reports/dashboard").json()
    assert (
        dash["sales_count"] == 1
        and dash["sales_total"] == "1180.00"
        and dash["profit_today"] == "400.00"
        and dash["cash_in_hand"] == "880.00"
    )
    ageing = owner.get("/api/v1/reports/stock-ageing").json()
    assert [b["bucket"] for b in ageing] == ["0-15", "16-30", "31-60", "60+"]


def test_reports_roles(client, owner):
    owner.post(
        "/api/v1/staff",
        json={"name": "Sales", "phone": "03451112233", "password": "secret123", "role": "salesman"},
    )
    s = login(client, "03451112233")
    assert s.get("/api/v1/reports/profit-loss").status_code == 403
    dash = s.get("/api/v1/reports/dashboard").json()
    assert dash["profit_today"] is None and dash["stock_value_cost"] is None
