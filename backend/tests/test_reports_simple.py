"""Owner's plain questions: how much is my stock worth (by brand and model) and any day's hisaab."""

from app.core.clock import today as shop_today
from app.modules.expenses.service import seed_categories
from tests.conftest import login
from tests.test_devices import _stock
from tests.test_purchases import _party

A, B, C = "490154203237518", "356938035643809", "352099001761481"


def _other_model(owner, cat):
    models = owner.get("/api/v1/catalogue/models", params={"brand_id": cat["brand"]["id"]}).json()
    return next(m for m in models if m["id"] != cat["model"]["id"])


def test_stock_summary_by_brand_and_model(client, owner, cat):
    other = _other_model(owner, cat)
    _stock(owner, cat, imei=A, cost_price=1000, asking_price=1500)
    _stock(owner, cat, imei=B, cost_price=2000, asking_price=2500)
    _stock(owner, cat, imei=C, model_id=other["id"], cost_price=500, asking_price=700)
    s = owner.get("/api/v1/reports/stock-summary").json()
    assert s["basis"] == "cost" and s["count"] == 3 and s["value"] == "3500.00"
    (brand,) = s["brands"]
    assert brand["count"] == 3 and brand["value"] == "3500.00"
    assert [(m["name"], m["count"], m["value"]) for m in brand["models"]] == [
        (cat["model"]["name"], 2, "3000.00"),
        (other["name"], 1, "500.00"),
    ]
    # a salesman never sees cost: worth is shown at asking price
    owner.post(
        "/api/v1/staff",
        json={"name": "Sales", "phone": "03451112244", "password": "secret123", "role": "salesman"},
    )
    s2 = login(client, "03451112244").get("/api/v1/reports/stock-summary").json()
    assert s2["basis"] == "asking" and s2["value"] == "4700.00"


def test_day_report(db, owner, cat):
    seed_categories(db)
    tea = next(c for c in owner.get("/api/v1/expenses/categories").json() if c["key"] == "tea")
    ali = _party(owner, name="Ali", phone="03217654321", kinds=("customer",))
    d1 = _stock(owner, cat, imei=A, condition="box_pack", cost_price=1000, asking_price=1500)
    d2 = _stock(owner, cat, imei=B, condition="box_pack", cost_price=800, asking_price=1200)
    # part udhaar: 1500 sale, 1000 paid now, 500 on credit
    r = owner.post(
        "/api/v1/sales",
        json={
            "party_id": ali["id"],
            "devices": [{"device_id": d1["id"], "price": 1500}],
            "paid": 1000,
        },
    )
    assert r.status_code == 201, r.text
    # walk-in cash sale
    r = owner.post(
        "/api/v1/sales", json={"devices": [{"device_id": d2["id"], "price": 1200}], "paid": 1200}
    )
    assert r.status_code == 201, r.text
    # Ali pays back 200 of his udhaar; tea 100
    owner.post("/api/v1/payments", json={"party_id": ali["id"], "direction": "in", "amount": 200})
    owner.post("/api/v1/expenses", json={"category_id": tea["id"], "amount": 100})

    d = owner.get("/api/v1/reports/day").json()
    assert d["sales_count"] == 2 and d["phones_sold"] == 2 and d["sales_total"] == "2700.00"
    assert d["received"]["cash"] == "2200.00"
    assert d["udhaar_given"] == "500.00" and d["udhaar_received"] == "200.00"
    assert d["expenses"] == "100.00"
    # 2,200 at the counter + 200 udhaar back in, 100 tea out
    assert d["money_in"] == "2400.00" and d["money_out"] == "100.00" and d["cash_net"] == "2300.00"
    # profit = (1500-1000) + (1200-800) - 100 tea
    assert d["profit"] == "800.00"
    assert [(i["how"], i["amount"], i["party_name"]) for i in d["items"]] == [
        ("part", "1500.00", "Ali"),
        ("cash", "1200.00", None),
    ]
    # another day is empty
    empty = owner.get("/api/v1/reports/day", params={"date": "2020-01-01"}).json()
    assert empty["sales_count"] == 0 and empty["items"] == [] and empty["sales_total"] == "0.00"


def test_hisaab_for_a_period(owner, cat):
    """Owner: hisaab for a week, a month or from-to, not just one day."""
    import datetime as dt

    today = shop_today()
    yesterday = today - dt.timedelta(days=1)
    d1 = _stock(owner, cat, imei=A, condition="box_pack", cost_price=800, asking_price=1000)
    d2 = _stock(owner, cat, imei=B, condition="box_pack", cost_price=800, asking_price=1200)
    for d, price, day in ((d1, 1000, yesterday), (d2, 1200, today)):
        r = owner.post(
            "/api/v1/sales",
            json={
                "date": str(day),
                "devices": [{"device_id": d["id"], "price": price}],
                "paid": price,
            },
        )
        assert r.status_code == 201, r.text
    one = owner.get("/api/v1/reports/day").json()
    assert one["sales_total"] == "1200.00" and one["phones_sold"] == 1
    both = owner.get(
        "/api/v1/reports/day", params={"date_from": str(yesterday), "date_to": str(today)}
    ).json()
    assert both["sales_total"] == "2200.00" and both["phones_sold"] == 2 and len(both["items"]) == 2
    assert both["date_from"] == str(yesterday) and both["date_to"] == str(today)
    x = owner.get(
        "/api/v1/exports/day",
        params={"format": "csv", "date_from": str(yesterday), "date_to": str(today)},
    )
    assert x.status_code == 200 and "-to-" in x.headers["content-disposition"]
