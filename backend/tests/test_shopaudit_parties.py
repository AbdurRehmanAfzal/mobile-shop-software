"""Shop Audit P5 (docs/17): a person's journey up to a day, rankings by a named metric, and the
udhaar book with receivables and payables apart and the age of each debt."""

import datetime as dt

from app.core.clock import today as shop_today
from tests.conftest import login
from tests.test_purchases import _dev, _party

A, B, C, D = "490154203237518", "356938035643809", "352099001761481", "358812091717195"


def _seed(owner, cat):
    """Dealer sells us 4 phones (2 × 800, 2 × 30,000) 50 days ago, half paid.
    Ahmed: 45 days ago buys a cheap phone for 1,000 on credit, pays 400 ten days ago;
    today buys a dear phone for 37,000 cash. Bilal: 20 days ago buys a cheap phone for 1,200,
    pays 1,200; returns it 5 days ago with a full refund."""
    t = shop_today()
    d50, d45, d20, d10, d5 = (t - dt.timedelta(days=n) for n in (50, 45, 20, 10, 5))
    dealer = _party(owner, name="Dealer", phone="03005556666", kinds=("supplier",))
    ahmed = _party(owner, name="Ahmed", phone="03001111111", kinds=("customer",))
    bilal = _party(owner, name="Bilal", phone="03002222222", kinds=("customer",))
    r = owner.post(
        "/api/v1/purchases",
        json={
            "kind": "supplier",
            "party_id": dealer["id"],
            "date": d50.isoformat(),
            "devices": [
                {"device": _dev(cat, A), "cost": 800, "asking_price": 1000},
                {"device": _dev(cat, B), "cost": 800, "asking_price": 1200},
                {"device": _dev(cat, C), "cost": 30000, "asking_price": 37000},
                {"device": _dev(cat, D), "cost": 30000, "asking_price": 37000},
            ],
            "paid": 30800,
        },
    )
    assert r.status_code == 201, r.text
    a, b, c, _d = (ln["device_id"] for ln in r.json()["lines"])
    inv1 = owner.post(
        "/api/v1/sales",
        json={
            "party_id": ahmed["id"],
            "date": d45.isoformat(),
            "devices": [{"device_id": a, "price": 1000}],
            "paid": 0,
        },
    ).json()
    owner.post(
        "/api/v1/payments",
        json={
            "party_id": ahmed["id"],
            "direction": "in",
            "amount": 400,
            "date": d10.isoformat(),
            "allocations": [{"document_type": "invoice", "document_id": inv1["id"], "amount": 400}],
        },
    )
    assert (
        owner.post(
            "/api/v1/sales",
            json={
                "party_id": ahmed["id"],
                "devices": [{"device_id": c, "price": 37000}],
                "paid": 37000,
            },
        ).status_code
        == 201
    )
    inv3 = owner.post(
        "/api/v1/sales",
        json={
            "party_id": bilal["id"],
            "date": d20.isoformat(),
            "devices": [{"device_id": b, "price": 1200}],
            "paid": 1200,
        },
    ).json()
    r = owner.post(
        "/api/v1/returns/sale",
        json={
            "invoice_id": inv3["id"],
            "line_ids": [inv3["lines"][0]["id"]],
            "date": d5.isoformat(),
            "settlement": "refund",
            "refund_amount": 1200,
            "kept_amount": 0,
            "reason": "fault",
        },
    )
    assert r.status_code == 201, r.text
    return t, dealer, ahmed, bilal


def test_journey_counts_money_and_as_of(owner, client, cat):
    t, dealer, ahmed, bilal = _seed(owner, cat)
    j = owner.get(f"/api/v1/shop-audit/parties/{ahmed['id']}/journey").json()
    assert (
        j["party"]["name"] == "Ahmed"
        and j["first_transaction"] == (t - dt.timedelta(days=45)).isoformat()
    )
    assert j["last_transaction"] == t.isoformat()
    assert j["sold"] == {"bills": 2, "phones": 2, "value": "38000.00", "profit": "7200.00"}
    assert j["bought"]["bills"] == 0 and j["bought"]["phones"] == 0
    m = j["money"]
    assert (
        m["received_at_counter"] == "37000.00"
        and m["received_later"] == "400.00"
        and m["received_total"] == "37400.00"
    )
    assert m["payments"] == 1 and m["refunded_to_them"] == "0.00"
    assert (
        j["balance_as_of"] == "600.00"
        and j["receivable_open"] == "600.00"
        and j["payable_open"] == "0.00"
    )
    kinds = [x["kind"] for x in j["timeline"]]
    assert kinds == ["sale", "payment_in", "sale"]
    assert j["timeline"][0]["devices"][0]["imei1"] == C
    # as of 20 days ago: one bill, nothing received yet, 1,000 owed
    j2 = owner.get(
        f"/api/v1/shop-audit/parties/{ahmed['id']}/journey",
        params={"as_of": (t - dt.timedelta(days=20)).isoformat()},
    ).json()
    assert (
        j2["sold"]["bills"] == 1
        and j2["money"]["received_total"] == "0.00"
        and j2["balance_as_of"] == "1000.00"
    )
    assert j2["last_transaction"] == (t - dt.timedelta(days=45)).isoformat()
    # Bilal: bought and returned, refunded in full, nothing owed either way
    jb = owner.get(f"/api/v1/shop-audit/parties/{bilal['id']}/journey").json()
    assert (
        jb["sold"]["phones"] == 0
        and jb["sold"]["value"] == "0.00"
        and jb["sold"]["profit"] == "0.00"
    )
    assert (
        jb["returns"]["sale"] == {"count": 1, "amount": "1200.00"}
        and jb["money"]["refunded_to_them"] == "1200.00"
    )
    assert jb["balance_as_of"] == "0.00" and [x["kind"] for x in jb["timeline"]] == [
        "sale_return",
        "sale",
    ]
    # the dealer: 4 phones supplied, 30,800 paid at the counter, 30,800 still owed; profit on sourced phones
    jd = owner.get(f"/api/v1/shop-audit/parties/{dealer['id']}/journey").json()
    assert jd["bought"] == {
        "bills": 1,
        "phones": 4,
        "value": "61600.00",
        "sourced_sold": 2,
        "sourced_profit": "7200.00",
    }
    assert (
        jd["money"]["paid_at_counter"] == "30800.00"
        and jd["balance_as_of"] == "-30800.00"
        and jd["payable_open"] == "30800.00"
    )
    # a salesman: no journey
    owner.post(
        "/api/v1/staff",
        json={"name": "Ali", "phone": "03211234567", "password": "secret123", "role": "salesman"},
    )
    ali = login(client, "03211234567")
    assert ali.get(f"/api/v1/shop-audit/parties/{ahmed['id']}/journey").status_code == 403


def test_rankings_name_their_metric(owner, cat):
    _t, _dealer, _ahmed, _bilal = _seed(owner, cat)
    q = {"preset": "all_time"}
    r = owner.get("/api/v1/shop-audit/rankings", params={**q, "metric": "customers_sales"}).json()
    assert r["metric"] == "customers_sales" and r["total"] == "38000.00"
    assert [x["name"] for x in r["rows"]] == ["Ahmed", "Bilal"] and r["rows"][0][
        "value"
    ] == "38000.00"
    assert r["rows"][0]["share"] == 100.0 and r["rows"][1]["value"] == "0.00"
    r = owner.get("/api/v1/shop-audit/rankings", params={**q, "metric": "customers_bills"}).json()
    assert r["rows"][0]["name"] == "Ahmed" and r["rows"][0]["count"] == 2
    r = owner.get("/api/v1/shop-audit/rankings", params={**q, "metric": "customers_profit"}).json()
    assert [(x["name"], x["value"]) for x in r["rows"]] == [
        ("Ahmed", "7200.00")
    ]  # a returned phone earns nothing
    r = owner.get(
        "/api/v1/shop-audit/rankings", params={**q, "metric": "suppliers_purchases"}
    ).json()
    assert r["rows"][0]["name"] == "Dealer" and r["rows"][0]["value"] == "61600.00"
    r = owner.get("/api/v1/shop-audit/rankings", params={**q, "metric": "suppliers_devices"}).json()
    assert r["rows"][0]["count"] == 4
    r = owner.get("/api/v1/shop-audit/rankings", params={**q, "metric": "suppliers_profit"}).json()
    assert r["rows"][0]["value"] == "7200.00" and r["rows"][0]["count"] == 2
    r = owner.get("/api/v1/shop-audit/rankings", params={**q, "metric": "receivable"}).json()
    assert [(x["name"], x["value"]) for x in r["rows"]] == [("Ahmed", "600.00")]
    r = owner.get("/api/v1/shop-audit/rankings", params={**q, "metric": "payable"}).json()
    assert [(x["name"], x["value"]) for x in r["rows"]] == [("Dealer", "30800.00")]
    # this month only: the 37,000 sale
    r = owner.get(
        "/api/v1/shop-audit/rankings", params={"preset": "this_month", "metric": "customers_sales"}
    ).json()
    assert r["total"] == "37000.00"
    assert owner.get("/api/v1/shop-audit/rankings", params={"metric": "biggest"}).status_code == 422


def test_udhaar_book_keeps_sides_apart_and_ages_debts(owner, cat):
    t, _dealer, _ahmed, _bilal = _seed(owner, cat)
    u = owner.get("/api/v1/shop-audit/udhaar", params={"preset": "all_time"}).json()
    assert u["receivable"]["current"] == "600.00" and u["payable"]["current"] == "30800.00"
    assert u["receivable"]["parties"] == 1 and u["payable"]["parties"] == 1
    mv = u["movement"]
    assert (
        mv["udhaar_given"] == "1000.00"
        and mv["received"] == "400.00"
        and mv["udhaar_taken"] == "30800.00"
    )
    assert mv["paid"] == "0.00" and mv["sale_returns"] == "0.00"
    rr = u["receivable_rows"][0]
    assert (
        rr["name"] == "Ahmed"
        and rr["amount"] == "600.00"
        and rr["age_days"] == 45
        and rr["band"] == "31-60"
    )
    assert rr["last_payment"] == (t - dt.timedelta(days=10)).isoformat()
    pr = u["payable_rows"][0]
    assert pr["name"] == "Dealer" and pr["amount"] == "30800.00" and pr["age_days"] == 50
    bands = {b["band"]: b for b in u["receivable_bands"]}
    assert (
        bands["31-60"]["amount"] == "600.00"
        and bands["31-60"]["parties"] == 1
        and bands["0-7"]["parties"] == 0
    )
    assert u["bands"][-1] == "no_bill"
    recv = {p["imei1"]: p for p in u["phones"] if p["side"] == "receivable"}
    pay = {p["imei1"]: p for p in u["phones"] if p["side"] == "payable"}
    assert list(recv) == [A] and recv[A]["doc_remaining"] == "600.00" and recv[A]["age_days"] == 45
    # the dealer's bill is half paid: all four phones sit on it, each with the bill's remaining
    assert sorted(pay) == sorted([A, B, C, D]) and pay[D]["party_name"] == "Dealer"
    assert pay[D]["doc_remaining"] == "30800.00" and pay[A]["age_days"] == 50
    # a period inside: last 30 days hold only the 400 received
    u2 = owner.get(
        "/api/v1/shop-audit/udhaar",
        params={"date_from": (t - dt.timedelta(days=30)).isoformat(), "date_to": t.isoformat()},
    ).json()
    assert u2["movement"]["received"] == "400.00" and u2["movement"]["udhaar_given"] == "0.00"
    assert u2["receivable"]["opening"] == "1000.00" and u2["receivable"]["closing"] == "600.00"
    # as of 15 days ago: Ahmed still owed 1,000 and the band is 0-30 days old from the bill
    u3 = owner.get(
        "/api/v1/shop-audit/udhaar",
        params={"preset": "all_time", "as_of": (t - dt.timedelta(days=15)).isoformat()},
    ).json()
    assert (
        u3["receivable_rows"][0]["amount"] == "1000.00"
        and u3["receivable_rows"][0]["age_days"] == 30
    )
