"""Trial balance and balance sheet (docs/35 §5 item 1): read-only from the ledger, always balanced,
profit the same as the profit and loss report."""

import datetime as dt
import uuid

from sqlalchemy import select

from app.core.clock import today as shop_today
from app.modules.expenses.service import seed_categories
from app.modules.ledger.models import CashAccount
from tests.conftest import login
from tests.test_devices import _stock
from tests.test_purchases import _party

A, B = "490154203237518", "356938035643809"


def _amount(rows, key):
    return next(r["amount"] for r in rows if r["key"] == key)


def test_trial_balance_and_balance_sheet(client, db, owner, cat):
    seed_categories(db)
    cats = {c["key"]: c["id"] for c in owner.get("/api/v1/expenses/categories").json()}
    # the galla started with Rs. 5,000 (kept on the account, outside the ledger)
    galla = db.scalars(select(CashAccount).where(CashAccount.shop_id == uuid.UUID(owner.shop_id))).first()
    galla.opening_balance = 5000
    db.commit()
    ali = _party(owner, name="Ali", phone="03217654321", kinds=("customer",))
    d1 = _stock(owner, cat, imei=A, condition="box_pack", cost_price=1000, asking_price=1500)
    d2 = _stock(owner, cat, imei=B, condition="box_pack", cost_price=800, asking_price=1200)
    assert owner.post("/api/v1/sales", json={"party_id": ali["id"], "devices": [{"device_id": d1["id"], "price": 1500}], "paid": 1000}).status_code == 201
    assert owner.post("/api/v1/sales", json={"devices": [{"device_id": d2["id"], "price": 1200}], "paid": 1200}).status_code == 201
    owner.post("/api/v1/payments", json={"party_id": ali["id"], "direction": "in", "amount": 200})
    owner.post("/api/v1/expenses", json={"category_id": cats["tea"], "amount": 100})
    owner.post("/api/v1/expenses", json={"category_id": cats["owner_drawing"], "amount": 300})

    tb = owner.get("/api/v1/reports/trial-balance").json()
    assert tb["balanced"] is True and tb["debit"] == tb["credit"]
    rows = {r["key"]: r for r in tb["rows"]}
    assert rows["receivable"]["debit"] == "300.00" and rows["receivable"]["count"] == 1
    assert rows["opening_cash"]["credit"] == "5000.00"
    assert rows["owner_drawing"]["debit"] == "300.00"
    assert any(r["group"] == "expense" and r["name"] == "Tea & refreshments" and r["debit"] == "100.00" for r in tb["rows"])

    bs = owner.get("/api/v1/reports/balance-sheet").json()
    assert bs["balanced"] is True
    # profit: (1500 − 1000) + (1200 − 800) − 100 tea; drawing is not an expense here
    assert _amount(bs["owner"], "profit") == "800.00"
    assert _amount(bs["owner"], "owner_drawing") == "-300.00"
    assert _amount(bs["assets"], "receivable") == "300.00"
    assert _amount(bs["assets"], "inventory") == "0.00"
    pnl = owner.get("/api/v1/reports/profit-loss", params={"date_from": "2000-01-01"}).json()
    assert pnl["net_profit"] == _amount(bs["owner"], "profit")
    # the galla: 5000 + 1000 + 1200 + 200 − 100 − 300
    galla_row = next(r for r in bs["assets"] if r["group"] == "cash" and r["key"] == f"cash:{galla.id}")
    assert galla_row["amount"] == "7000.00"

    # before anything happened: still balanced, only the opening cash
    before = (shop_today() - dt.timedelta(days=400)).isoformat()
    old = owner.get("/api/v1/reports/balance-sheet", params={"as_of": before}).json()
    assert old["balanced"] is True and _amount(old["owner"], "profit") == "0.00"

    # owner and manager only: a salesman never sees the shop's books
    owner.post("/api/v1/staff", json={"name": "Sales", "phone": "03451112244", "password": "secret123", "role": "salesman"})
    s = login(client, "03451112244")
    assert s.get("/api/v1/reports/trial-balance").status_code == 403
    assert s.get("/api/v1/reports/balance-sheet").status_code == 403
