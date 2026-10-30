"""Shop Audit P3 (docs/17): periods resolve on shop days; balances come as opening / closing /
as-of / current; a sale from before the period paid inside it is cash now, revenue then."""

import datetime as dt

from app.core.clock import today as shop_today
from app.core.periods import resolve
from tests.conftest import login
from tests.test_purchases import _dev, _party

A, B = "490154203237518", "356938035643809"
D = dt.date


def test_presets_resolve_on_calendar_units():
    t = D(2026, 3, 1)  # a Sunday
    p = resolve("this_week", today=t)
    assert (p.date_from, p.date_to, p.prev_from, p.prev_to) == (
        D(2026, 2, 23),
        t,
        D(2026, 2, 16),
        D(2026, 2, 22),
    )
    p = resolve("last_week", today=t)
    assert (p.date_from, p.date_to) == (D(2026, 2, 16), D(2026, 2, 22))
    p = resolve("this_month", today=t)
    assert (p.date_from, p.date_to, p.prev_from, p.prev_to) == (t, t, D(2026, 2, 1), D(2026, 2, 28))
    p = resolve("last_month", today=t)
    assert (p.date_from, p.date_to, p.prev_from, p.prev_to) == (
        D(2026, 2, 1),
        D(2026, 2, 28),
        D(2026, 1, 1),
        D(2026, 1, 31),
    )
    p = resolve("this_year", today=t)
    assert (p.date_from, p.prev_from, p.prev_to) == (D(2026, 1, 1), D(2025, 1, 1), D(2025, 12, 31))
    p = resolve("yesterday", today=t)
    assert p.date_from == p.date_to == D(2026, 2, 28) and p.prev_from == D(2026, 2, 27)
    p = resolve(None, D(2026, 2, 10), D(2026, 2, 19), today=t)
    assert p.preset == "custom" and p.days == 10
    assert (p.prev_from, p.prev_to) == (D(2026, 1, 31), D(2026, 2, 9))
    assert p.as_of == D(2026, 2, 19)
    p = resolve("custom", D(2026, 2, 19), D(2026, 2, 10), as_of=D(2026, 2, 15), today=t)
    assert (p.date_from, p.date_to, p.as_of) == (D(2026, 2, 10), D(2026, 2, 19), D(2026, 2, 15))
    p = resolve("all_time", first_day=D(2025, 6, 1), today=t)
    assert (p.date_from, p.date_to) == (D(2025, 6, 1), t)
    assert resolve(None, today=t).preset == "this_month"


def _seed(owner, cat):
    """Day 1 (45 days ago, before the period): two phones bought for 800 each, paid in cash; one
    sold on credit for 1,000. Day 2 (10 days ago, inside): the other sold for 1,200 cash and the
    credit customer pays 400."""
    today = shop_today()
    d1, d2 = today - dt.timedelta(days=45), today - dt.timedelta(days=10)
    sup = _party(owner, name="Dealer", phone="03005556666", kinds=("supplier",))
    cus = _party(owner, name="Ahmed", phone="03219876543", kinds=("customer",))
    r = owner.post(
        "/api/v1/purchases",
        json={
            "kind": "supplier",
            "party_id": sup["id"],
            "date": d1.isoformat(),
            "devices": [
                {"device": _dev(cat, A), "cost": 800, "asking_price": 1000},
                {"device": _dev(cat, B), "cost": 800, "asking_price": 1200},
            ],
            "paid": 1600,
        },
    )
    assert r.status_code == 201, r.text
    ids = [ln["device_id"] for ln in r.json()["lines"]]
    inv1 = owner.post(
        "/api/v1/sales",
        json={
            "party_id": cus["id"],
            "date": d1.isoformat(),
            "devices": [{"device_id": ids[0], "price": 1000}],
            "paid": 0,
        },
    )
    assert inv1.status_code == 201, inv1.text
    inv2 = owner.post(
        "/api/v1/sales",
        json={
            "date": d2.isoformat(),
            "devices": [{"device_id": ids[1], "price": 1200}],
            "paid": 1200,
        },
    )
    assert inv2.status_code == 201, inv2.text
    pay = owner.post(
        "/api/v1/payments",
        json={
            "party_id": cus["id"],
            "direction": "in",
            "amount": 400,
            "date": d2.isoformat(),
            "allocations": [
                {"document_type": "invoice", "document_id": inv1.json()["id"], "amount": 400}
            ],
        },
    )
    assert pay.status_code == 201, pay.text
    return today, d1, d2, cus


def test_overview_separates_revenue_from_cash_and_keeps_openings(owner, client, cat):
    today, d1, d2, _cus = _seed(owner, cat)
    q = {"date_from": (today - dt.timedelta(days=30)).isoformat(), "date_to": today.isoformat()}
    o = owner.get("/api/v1/shop-audit/overview", params=q).json()
    assert o["period"]["preset"] == "custom" and o["period"]["days"] == 31
    assert o["coverage"]["first_day"] == d1.isoformat()
    # revenue: only the 1,200 sale is in the period; the 400 is cash, not sales
    assert o["sales"]["net_sales"] == "1200.00" and o["sales"]["invoices"] == 1
    assert o["sales"]["phones_sold"] == 1 and o["purchases"]["purchases"] == 0
    assert o["profit"]["cogs"] == "800.00" and o["profit"]["net_profit"] == "400.00"
    # money: before the period the shop had paid 1,600 out of nothing → −1,600; inside: +1,200 +400
    m = o["money"]
    assert m["opening"] == "-1600.00" and m["inflows"] == "1600.00" and m["outflows"] == "0.00"
    assert m["closing"] == "0.00" and m["current"] == "0.00" and m["transfers"] == "0.00"
    assert m["accounts"][0]["kind"] == "cash" and m["by_kind"]["cash"] == "0.00"
    # debt: Ahmed owed 1,000 at the start, 600 at the end; 400 received inside
    d = o["debt"]
    assert d["receivable"]["opening"] == "1000.00" and d["receivable"]["closing"] == "600.00"
    assert d["receivable"]["current"] == "600.00" and d["receivable"]["parties"] == 1
    assert d["payable"]["opening"] == d["payable"]["closing"] == "0.00"
    assert d["received_in_period"] == "400.00" and d["paid_in_period"] == "0.00"
    # stock: one phone left at the start, none at the end
    s = o["stock"]
    assert s["opening"]["count"] == 1 and s["opening"]["cost_value"] == "800.00"
    assert s["closing"]["count"] == 0 and s["current"]["count"] == 0
    # the period before holds the first sale
    assert o["previous"]["net_sales"] == "1000.00" and o["previous"]["outflows"] == "1600.00"
    # as-of a day inside the period, before the payment: still 1,000 owed and 1 phone in stock
    q2 = {**q, "as_of": (d2 - dt.timedelta(days=1)).isoformat()}
    o2 = owner.get("/api/v1/shop-audit/overview", params=q2).json()
    assert o2["debt"]["receivable"]["as_of"] == "1000.00" and o2["stock"]["as_of"]["count"] == 1
    assert o2["money"]["as_of"] == "-1600.00"

    # presets answer with their dates; all_time starts on the first ledger day
    p = owner.get("/api/v1/shop-audit/period", params={"preset": "all_time"}).json()
    assert p["date_from"] == d1.isoformat() and p["date_to"] == today.isoformat()
    assert owner.get("/api/v1/shop-audit/period", params={"preset": "fortnight"}).status_code == 422
    p = owner.get("/api/v1/shop-audit/period", params={"preset": "last_month"}).json()
    assert p["date_to"] < today.isoformat()

    # the books prove themselves
    rc = owner.get("/api/v1/shop-audit/reconcile", params=q).json()
    assert rc["ok"] is True, rc
    by = {c["key"]: c for c in rc["checks"]}
    assert by["stock_units"]["opening"] == 1 and by["stock_units"]["went_out"] == 1
    assert by["party_balances"]["mismatched"] == 0 and by["cash"]["ok"]

    # a salesman has no audit
    owner.post(
        "/api/v1/staff",
        json={"name": "Ali", "phone": "03211234567", "password": "secret123", "role": "salesman"},
    )
    ali = login(client, "03211234567")
    assert ali.get("/api/v1/shop-audit/overview").status_code == 403
    assert ali.get("/api/v1/shop-audit/reconcile").status_code == 403


def test_overview_on_an_empty_shop(owner):
    o = owner.get("/api/v1/shop-audit/overview", params={"preset": "this_year"}).json()
    assert o["sales"]["net_sales"] == "0.00" and o["coverage"]["first_day"] is None
    assert o["stock"]["current"]["count"] == 0 and o["debt"]["receivable"]["current"] == "0.00"
    assert (
        owner.get("/api/v1/shop-audit/reconcile", params={"preset": "today"}).json()["ok"] is True
    )
