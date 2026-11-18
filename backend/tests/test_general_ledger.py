"""Owner 2026-11-18 (ADR-104): the chart of accounts and the general ledger — every line of one
account, and its closing balance equal to the trial balance's figure for the same account."""

import csv
import datetime as dt
import io
from decimal import Decimal

from app.core.clock import today as shop_today
from app.modules.expenses.service import seed_categories
from tests.conftest import login
from tests.test_purchases import _dev, _party

A, B = "490154203237518", "356938035643809"


def _gl(actor, account, **params):
    return actor.get("/api/v1/reports/general-ledger", params={"account": account, **params})


def _busy_shop(owner, db, cat):
    seed_categories(db)
    sup = _party(owner, name="Hafeez Centre", phone="03005550001", kinds=("supplier",))
    cust = _party(owner, name="Ahmed Khan", phone="03219876543", kinds=("customer",))
    p = owner.post(
        "/api/v1/purchases",
        json={
            "kind": "supplier",
            "party_id": sup["id"],
            "devices": [
                {"device": _dev(cat, A), "cost": 65000, "asking_price": 70000},
                {"device": _dev(cat, B), "cost": 40000, "asking_price": 45000},
            ],
            "paid": 80000,
        },
    ).json()
    d1, d2 = (ln["device_id"] for ln in p["lines"])
    inv = owner.post(
        "/api/v1/sales",
        json={
            "party_id": cust["id"],
            "devices": [{"device_id": d1, "price": 70000}],
            "paid": 50000,
        },
    ).json()
    tea = next(c for c in owner.get("/api/v1/expenses/categories").json() if c["key"] == "tea")
    assert (
        owner.post("/api/v1/expenses", json={"category_id": tea["id"], "amount": 300}).status_code
        == 201
    )
    # a sale entered by mistake and deleted: its entry and the reversal both stay in the ledger
    wrong = owner.post(
        "/api/v1/sales",
        json={
            "party_id": cust["id"],
            "devices": [{"device_id": d2, "price": 45000}],
            "paid": 45000,
        },
    ).json()
    assert (
        owner.post(f"/api/v1/sales/{wrong['id']}/void", json={"reason": "wrong phone"}).status_code
        == 200
    )
    return sup, cust, p, inv


def test_every_account_reconciles_with_the_trial_balance(client, owner, other_owner, db, cat):
    _sup, _cust, _p, inv = _busy_shop(owner, db, cat)
    today = shop_today().isoformat()
    chart = owner.get("/api/v1/reports/chart-of-accounts").json()
    keys = {a["key"] for a in chart}
    assert {"receivable", "payable", "inventory", "sales", "cogs", "expense:tea"} <= keys
    assert any(k.startswith("cash:") for k in keys)
    trial = {
        r["key"]: Decimal(r["debit"]) - Decimal(r["credit"])
        for r in owner.get("/api/v1/reports/trial-balance").json()["rows"]
    }

    # every account's ledger closes on the figure the chart and the trial balance show for it
    party_total = Decimal(0)
    for a in chart:
        r = _gl(owner, a["key"])
        assert r.status_code == 200, (a["key"], r.text)
        g = r.json()
        assert g["date_to"] == today and g["truncated"] is False
        closing = Decimal(g["closing"])
        assert closing == Decimal(g["opening"]) + Decimal(g["debit"]) - Decimal(g["credit"]), a[
            "key"
        ]
        if g["rows"]:
            assert Decimal(g["rows"][-1]["balance"]) == closing, a["key"]
        if a["key"] in ("receivable", "payable"):
            # one sub-ledger for everyone's khata: its closing is what people owe less what we owe
            party_total = closing
            continue
        assert closing == Decimal(a["balance"]), a["key"]
        if a["key"] in trial:
            assert closing == trial[a["key"]], a["key"]
    assert party_total == trial["receivable"] + trial["payable"]

    # the sales account: the good sale, the wrong one and its reversal (both marked)
    sales = _gl(owner, "sales").json()
    assert sales["account"]["kind"] == "income" and sales["count"] == 3
    assert [r["reversed"] for r in sales["rows"]] == [False, True, True]
    assert sales["rows"][0]["no"] == inv["no"] and sales["rows"][0]["credit"] == "70000.00"
    assert sales["rows"][0]["type"] == "invoice"
    assert (sales["debit"], sales["credit"], sales["closing"]) == (
        "45000.00",
        "115000.00",
        "-70000.00",
    )
    # stock at cost: one phone sold, one back in stock after the deleted sale
    assert _gl(owner, "inventory").json()["closing"] == "40000.00"
    assert _gl(owner, "cogs").json()["closing"] == "65000.00"
    assert _gl(owner, "expense:tea").json()["closing"] == "300.00"

    # the galla: its ledger closes on the balance every cash screen shows
    acct = owner.get("/api/v1/ledger/accounts").json()[0]
    cash = _gl(owner, f"cash:{acct['id']}").json()
    assert cash["closing"] == acct["balance"] and cash["account"]["name"] == acct["name"]
    assert cash["rows"][0]["party_name"] is None or isinstance(cash["rows"][0]["party_name"], str)

    # pages: the running balance carries on across them
    first = _gl(owner, "sales", limit=2).json()
    rest = _gl(owner, "sales", limit=2, offset=2).json()
    assert len(first["rows"]) == 2 and len(rest["rows"]) == 1 and rest["count"] == 3
    assert rest["rows"][0]["balance"] == sales["closing"]
    # a later period: everything before it is the opening balance
    tomorrow = (shop_today() + dt.timedelta(days=1)).isoformat()
    later = _gl(owner, "sales", date_from=tomorrow, date_to=tomorrow).json()
    assert later["rows"] == [] and later["opening"] == later["closing"] == "-70000.00"

    # Excel / CSV / print
    out = owner.get("/api/v1/exports/general-ledger", params={"account": "sales", "format": "csv"})
    rows = list(csv.reader(io.StringIO(out.content.decode("utf-8-sig"))))
    assert rows[0][:3] == ["Date", "Type", "No."] and rows[1][1] == "Opening balance"
    assert rows[2][2] == inv["no"] and "(deleted)" in rows[3][1]
    assert rows[-1][1] == "Closing balance" and rows[-1][-1] == "-70000.00"
    page = owner.get("/api/v1/exports/general-ledger", params={"account": "sales"})
    assert page.status_code == 200 and "General ledger" in page.text

    # a salesman has no books; another shop sees its own (empty) accounts and not this galla
    owner.post(
        "/api/v1/staff",
        json={"name": "Sales", "phone": "03451112244", "password": "secret123", "role": "salesman"},
    )
    s = login(client, "03451112244")
    assert _gl(s, "sales").status_code == 403
    assert s.get("/api/v1/reports/chart-of-accounts").status_code == 403
    theirs = _gl(other_owner, "sales").json()
    assert theirs["rows"] == [] and theirs["closing"] == "0.00"
    assert _gl(other_owner, f"cash:{acct['id']}").status_code == 404
    # dates the wrong way round are refused
    assert _gl(owner, "sales", date_from=tomorrow, date_to=today).status_code == 422
