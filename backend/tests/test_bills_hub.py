"""Mock-ups 24 / 25 (owner 2026-11-25): the bills screen and the sales screen's figures, checked
against the bills themselves, the live every-bill list, the khata and the shop audit's sales report.
Cost, profit and purchases only for owner / manager."""

from decimal import Decimal

from app.core.clock import today as shop_today
from tests.conftest import login
from tests.test_returns_audit import A, B, C, _buy, _customer, _khata, _sell, _supplier


def _setup(owner, cat):
    sup = _supplier(owner)
    p = _buy(owner, cat, sup, [A, B, C], cost=65000, paid=100000)  # 95,000 still to pay
    a, b, _c = (ln["device_id"] for ln in p["lines"])
    cust = _customer(owner)
    s1 = _sell(owner, cust, [a], price=70000, paid=50000)  # 5,000 profit, 20,000 udhaar
    other = _customer(owner, name="Bilal", phone="03331112222")
    s2 = owner.post(  # sold below cost by the owner: a 5,000 loss
        "/api/v1/sales",
        json={
            "party_id": other["id"],
            "devices": [{"device_id": b, "price": 60000}],
            "paid": 60000,
            "below_cost_ok": True,
        },
    )
    assert s2.status_code == 201, s2.text
    s2 = s2.json()
    it = owner.post(
        "/api/v1/accessories",
        json={
            "name": "Fast Charger",
            "category": "charger",
            "price": 800,
            "opening_qty": 10,
            "opening_cost": 450,
        },
    ).json()
    s3 = owner.post(
        "/api/v1/sales",
        json={
            "misc": [
                {
                    "description": "Fast Charger",
                    "accessory_id": it["id"],
                    "qty": 2,
                    "unit_price": 800,
                }
            ],
            "paid": 1600,
        },
    )
    assert s3.status_code == 201, s3.text
    # the second sale was put on the wrong person: corrected (ADR-065), so it is an edited bill
    r = owner.post(
        f"/api/v1/sales/{s2['id']}/customer", json={"party_id": cust["id"], "reason": "wrong name"}
    )
    assert r.status_code == 200, r.text
    return sup, cust, p, s1, s2, s3.json()


def test_bills_figures_match_the_bills_and_the_khata(owner, cat):
    sup, cust, p, s1, s2, s3 = _setup(owner, cat)
    day = shop_today().isoformat()
    d = owner.get("/api/v1/bills-hub/bills", params={"date_from": day, "date_to": day}).json()
    f = d["figures"]
    assert f["sales"] == "131600.00" and f["sales_count"] == 3
    assert f["purchases"] == "195000.00" and f["purchases_count"] == 1
    assert f["to_get"] == "20000.00" and f["to_pay"] == "95000.00"
    assert f["profit"] == "700.00"  # 5,000 − 5,000 + 2 × 350
    assert f["edited"] == 1 and f["count"] == 4
    # the same as the live every-bill list and the customer's khata
    live = owner.get("/api/v1/invoices", params={"date_from": day, "date_to": day}).json()
    assert Decimal(live["to_get"]) == Decimal(f["to_get"])
    assert Decimal(live["to_give"]) == Decimal(f["to_pay"])
    assert _khata(owner, cust) == Decimal(20000)
    row = next(r for r in d["rows"] if r["id"] == s1["id"])
    assert row["kinds"] == ["phone"] and row["lines"][0]["code"] == A
    assert row["mode"] == "cash" and row["profit"] == "5000.00" and row["role"] == "customer"
    assert row["money_in"] == "70000.00" and row["money_out"] == "0.00"
    pur = next(r for r in d["rows"] if r["id"] == p["id"])
    assert pur["role"] == "dealer" and pur["money_out"] == "195000.00" and pur["due"] == "95000.00"
    g = next(x for x in d["parties"] if x["party_id"] == cust["id"])
    assert g["bills"] == 2 and g["to_get"] == "20000.00" and g["billed"] == "130000.00"
    s = next(x for x in d["parties"] if x["party_id"] == sup["id"])
    assert s["role"] == "dealer" and s["to_pay"] == "95000.00"

    # filters
    q = lambda **kw: owner.get("/api/v1/bills-hub/bills", params=kw).json()["rows"]
    assert [r["id"] for r in q(type="purchase")] == [p["id"]]
    assert {r["id"] for r in q(state="due")} == {s1["id"], p["id"]}
    assert [r["id"] for r in q(kind="items")] == [s3["id"]]
    assert [r["id"] for r in q(q=A)] and all(A in [ln["code"] for ln in r["lines"]] for r in q(q=A))
    (ed,) = q(edited=True)
    assert ed["id"] == s2["id"] and ed["changes"][0]["type"] == "sale_party_change"
    assert "wrong name" in ed["changes"][0]["memo"]
    assert q(mode="udhaar") == []


def test_sales_lines_add_up_to_the_bills(owner, cat):
    sup, cust, _p, s1, s2, _s3 = _setup(owner, cat)
    d = owner.get("/api/v1/bills-hub/sales").json()
    f = d["figures"]
    assert f["sale"] == "131600.00" and f["units"] == 4 and f["bills"] == 3
    assert f["received"] == "111600.00" and f["udhaar"] == "20000.00"
    assert f["cost"] == "130900.00" and f["profit"] == "700.00" and f["net"] == "700.00"
    assert f["gain"] == "5700.00" and f["loss"] == "5000.00"
    # the shop audit's sales report reads the same profit
    day = shop_today().isoformat()
    audit = owner.get("/api/v1/shop-audit/sales", params={"date_from": day, "date_to": day})
    assert audit.status_code == 200, audit.text
    assert Decimal(audit.json()["totals"]["profit"]) == Decimal(f["profit"])
    # lines add up to the bills
    assert sum(Decimal(ln["udhaar"]) for ln in d["lines"]) == sum(
        Decimal(b["due"]) for b in d["bills"]
    )
    phone = next(k for k in d["kinds"] if k["key"] == "phone")
    assert phone["sale"] == "130000.00" and phone["units"] == 2 and phone["profit"] == "0.00"
    items = next(k for k in d["kinds"] if k["key"] == "items")
    assert items["units"] == 2 and items["profit"] == "700.00"
    a_line = next(ln for ln in d["lines"] if ln["code"] == A)
    assert a_line["bought_from"] == sup["name"] and a_line["udhaar"] == "20000.00"
    (pc,) = [pp for pp in d["parties"] if pp["party_id"] == cust["id"]]
    assert pc["bills"] == 2 and pc["sale"] == "130000.00"
    assert len(d["brand_options"]) == 1

    loss = owner.get("/api/v1/bills-hub/sales", params={"deal": "loss"}).json()
    assert [ln["invoice_id"] for ln in loss["lines"]] == [s2["id"]]
    assert loss["figures"]["loss"] == "5000.00"
    udh = owner.get("/api/v1/bills-hub/sales", params={"deal": "udhaar"}).json()
    assert [b["id"] for b in udh["bills"]] == [s1["id"]]
    items = owner.get("/api/v1/bills-hub/sales", params={"kind": "items"}).json()
    assert items["figures"]["sale"] == "1600.00"
    brand = d["brand_options"][0]["key"]
    one = owner.get("/api/v1/bills-hub/sales", params={"brand": brand}).json()
    assert one["figures"]["units"] == 2

    sheet = owner.get("/api/v1/bills-hub/sales/sheet", params={"format": "csv"})
    assert sheet.status_code == 200 and A in sheet.text and "131600" in sheet.text
    page = owner.get("/api/v1/bills-hub/bills/sheet", params={"format": "pdf", "lang": "ur"})
    assert page.status_code == 200 and s1["no"] in page.text


def test_staff_sees_no_cost(owner, client, cat):
    _setup(owner, cat)
    owner.post(
        "/api/v1/staff",
        json={"name": "Ali", "phone": "03211234567", "password": "secret123", "role": "salesman"},
    )
    ali = login(client, "03211234567")
    d = ali.get("/api/v1/bills-hub/bills").json()
    assert d["figures"]["purchases"] is None and d["figures"]["profit"] is None
    assert d["figures"]["to_pay"] is None and all(r["kind"] != "purchase" for r in d["rows"])
    assert all(r["profit"] is None for r in d["rows"])
    s = ali.get("/api/v1/bills-hub/sales").json()
    assert s["figures"]["cost"] is None and s["figures"]["profit"] is None
    assert all(ln["cost"] is None and ln["bought_from"] is None for ln in s["lines"])
    sheet = ali.get("/api/v1/bills-hub/sales/sheet", params={"format": "csv"})
    assert "Profit" not in sheet.text
