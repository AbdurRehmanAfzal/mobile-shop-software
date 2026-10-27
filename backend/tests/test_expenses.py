"""FR-TXN-09, FR-TXN-10: expenses with categories, ledger posting, void; day close with expected vs counted."""

import datetime as dt

from app.modules.expenses.service import seed_categories
from tests.conftest import login
from tests.test_devices import _stock
from tests.test_purchases import _party


def test_categories_seeded_and_custom(db, owner):
    assert seed_categories(db) == 11 and seed_categories(db) == 0
    cats = owner.get("/api/v1/expenses/categories").json()
    rent = next(c for c in cats if c["key"] == "rent")
    assert rent["name_ur"] == "دکان کا کرایہ" and rent["is_global"]
    r = owner.post(
        "/api/v1/expenses/categories", json={"name": "Generator fuel", "name_ur": "جنریٹر کا تیل"}
    )
    assert (
        r.status_code == 201
        and r.json()["key"] == "generator_fuel"
        and r.json()["is_global"] is False
    )
    assert owner.post("/api/v1/expenses/categories", json={"name": "rent"}).status_code == 409


def test_expense_posts_and_voids(db, owner):
    seed_categories(db)
    cats = owner.get("/api/v1/expenses/categories").json()
    rent = next(c for c in cats if c["key"] == "rent")
    r = owner.post(
        "/api/v1/expenses",
        json={"category_id": rent["id"], "amount": 25000, "description": "October"},
    )
    assert r.status_code == 201, r.text
    e = r.json()
    assert e["no"] == "EXP-000001" and e["category_name"] == "Shop rent"
    assert owner.get("/api/v1/ledger/accounts").json()[0]["balance"] == "-25000.00"
    g = owner.get(f"/api/v1/ledger/groups/{e['ledger_group_id']}").json()
    assert next(x for x in g["entries"] if x["account"] == "expense:rent")["debit"] == "25000.00"
    r = owner.post(f"/api/v1/expenses/{e['id']}/void", json={"reason": "duplicate entry"})
    assert r.status_code == 200 and r.json()["status"] == "voided"
    assert owner.get("/api/v1/ledger/accounts").json()[0]["balance"] == "0.00"


def test_salary_to_staff_and_payment_to_technician(db, client, owner):
    seed_categories(db)
    cats = {c["key"]: c for c in owner.get("/api/v1/expenses/categories").json()}
    staff = owner.post(
        "/api/v1/staff",
        json={"name": "Bilal", "phone": "03211112222", "password": "secret123", "role": "salesman"},
    ).json()
    r = owner.post(
        "/api/v1/expenses",
        json={"category_id": cats["salary"]["id"], "amount": 30000, "staff_user_id": staff["id"]},
    )
    assert r.status_code == 201 and r.json()["staff_name"] == "Bilal"
    tech = _party(owner, name="Usman Tech", phone="03331112222", kinds=("technician",))
    r = owner.post(
        "/api/v1/expenses",
        json={
            "category_id": cats["repair_parts"]["id"],
            "amount": 1500,
            "party_id": tech["id"],
            "description": "screen",
        },
    )
    assert r.status_code == 201 and r.json()["party_name"] == "Usman Tech"
    s = login(client, "03211112222")
    assert s.get("/api/v1/expenses").status_code == 403
    assert (
        s.post(
            "/api/v1/expenses", json={"category_id": cats["tea"]["id"], "amount": 100}
        ).status_code
        == 403
    )


def test_day_close_expected_vs_counted(db, owner, cat):
    seed_categories(db)
    cats = {c["key"]: c for c in owner.get("/api/v1/expenses/categories").json()}
    c = _party(owner, name="Ahmed", phone="03219876543", kinds=("customer",))
    d = _stock(
        owner, cat, imei="490154203237518", condition="box_pack", cost_price=800, asking_price=1000
    )
    owner.post(
        "/api/v1/sales",
        json={
            "party_id": c["id"],
            "devices": [{"device_id": d["id"], "price": 1000}],
            "paid": 1000,
        },
    )
    owner.post("/api/v1/expenses", json={"category_id": cats["tea"]["id"], "amount": 150})
    pv = owner.get("/api/v1/expenses/day-close/preview").json()
    assert (
        pv["opening"] == "0.00"
        and pv["cash_in"] == "1000.00"
        and pv["cash_out"] == "150.00"
        and pv["expected"] == "850.00"
        and pv["closed"] is False
    )
    r = owner.post("/api/v1/expenses/day-close", json={"counted": 800, "notes": "50 short"})
    assert r.status_code == 201, r.text
    assert r.json()["difference"] == "-50.00" and r.json()["expected"] == "850.00"
    assert owner.post("/api/v1/expenses/day-close", json={"counted": 800}).status_code == 409
    assert owner.get("/api/v1/expenses/day-close/preview").json()["closed"] is True
    assert len(owner.get("/api/v1/expenses/day-close").json()) == 1
    tomorrow = (dt.date.today() + dt.timedelta(days=1)).isoformat()
    pv2 = owner.get("/api/v1/expenses/day-close/preview", params={"date": tomorrow}).json()
    assert pv2["opening"] == "850.00" and pv2["expected"] == "850.00"
