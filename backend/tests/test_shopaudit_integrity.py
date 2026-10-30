"""Shop Audit P2 (docs/17 §3): money moved between the shop's own accounts is not income or
expense; the P&L spells out discounts and returns; a phone's age counts from the day it came in,
not from its last note."""

import datetime as dt

from app.core.clock import today as shop_today
from tests.conftest import login
from tests.test_devices import _stock
from tests.test_purchases import _dev, _party

A, B = "490154203237518", "356938035643809"


def _bank(owner, name="HBL"):
    r = owner.post("/api/v1/ledger/accounts", json={"kind": "bank", "name": name})
    assert r.status_code == 201, r.text
    return r.json()


def _default_cash(owner):
    return next(a for a in owner.get("/api/v1/ledger/accounts").json() if a["is_default"])


def test_transfer_moves_money_without_touching_profit(owner, client, cat):
    cash, bank = _default_cash(owner), _bank(owner)
    d = _stock(owner, cat, imei=A, condition="box_pack", cost_price=800, asking_price=1000)
    owner.post(
        "/api/v1/sales", json={"devices": [{"device_id": d["id"], "price": 1000}], "paid": 1000}
    )
    before = owner.get("/api/v1/reports/profit-loss").json()

    # 600 of the counter cash goes to the bank
    r = owner.post(
        "/api/v1/ledger/transfers",
        json={
            "from_account_id": cash["id"],
            "to_account_id": bank["id"],
            "amount": 600,
            "note": "deposit",
        },
    )
    assert r.status_code == 201, r.text
    t = r.json()
    assert t["from_name"] == cash["name"] and t["to_name"] == "HBL" and t["amount"] == "600.00"
    assert t["reversed"] is False and t["posted_by_name"]
    accounts = {a["id"]: a for a in owner.get("/api/v1/ledger/accounts").json()}
    assert (
        accounts[cash["id"]]["balance"] == "400.00" and accounts[bank["id"]]["balance"] == "600.00"
    )

    # profit unchanged, cash flow shows the move as a transfer on both sides
    after = owner.get("/api/v1/reports/profit-loss").json()
    assert after["net_profit"] == before["net_profit"] == "200.00"
    assert after["sales"] == before["sales"] and after["total_expenses"] == before["total_expenses"]
    flows = {f["cash_account_id"]: f for f in owner.get("/api/v1/reports/cash-flow").json()}
    assert (
        flows[cash["id"]]["cash_out"] == "600.00" and flows[cash["id"]]["transfers_out"] == "600.00"
    )
    assert (
        flows[bank["id"]]["cash_in"] == "600.00" and flows[bank["id"]]["transfers_in"] == "600.00"
    )
    assert flows[cash["id"]]["closing"] == "400.00" and flows[bank["id"]]["closing"] == "600.00"
    day = owner.get("/api/v1/reports/day").json()
    assert day["came_in"]["transfer"] == "600.00" and day["went_out"]["transfer"] == "600.00"
    assert day["came_in"]["sales"] == "1000.00" and day["went_out"]["expenses"] == "0.00"
    assert day["sales_total"] == "1000.00" and day["expenses"] == "0.00"
    assert owner.get("/api/v1/ledger/transfers").json()[0]["id"] == t["id"]

    # undone by a reversal: balances back, the row says so; the audit log remembers both
    r = owner.post(f"/api/v1/ledger/groups/{t['id']}/reverse", json={"reason": "typed wrong"})
    assert r.status_code == 201, r.text
    accounts = {a["id"]: a for a in owner.get("/api/v1/ledger/accounts").json()}
    assert (
        accounts[cash["id"]]["balance"] == "1000.00" and accounts[bank["id"]]["balance"] == "0.00"
    )
    assert owner.get("/api/v1/ledger/transfers").json()[0]["reversed"] is True
    flows = {f["cash_account_id"]: f for f in owner.get("/api/v1/reports/cash-flow").json()}
    assert (
        flows[cash["id"]]["transfers_in"] == "600.00"
        and flows[cash["id"]]["transfers_out"] == "600.00"
    )
    kinds = [a["entity"] + "/" + a["action"] for a in owner.get("/api/v1/audit").json()]
    assert "cash_transfer/create" in kinds and "ledger_group/reverse" in kinds

    # guards: same account, zero, a salesman
    assert (
        owner.post(
            "/api/v1/ledger/transfers",
            json={"from_account_id": cash["id"], "to_account_id": cash["id"], "amount": 10},
        ).status_code
        == 422
    )
    assert (
        owner.post(
            "/api/v1/ledger/transfers",
            json={"from_account_id": cash["id"], "to_account_id": bank["id"], "amount": 0},
        ).status_code
        == 422
    )
    owner.post(
        "/api/v1/staff",
        json={"name": "Ali", "phone": "03211234567", "password": "secret123", "role": "salesman"},
    )
    ali = login(client, "03211234567")
    assert (
        ali.post(
            "/api/v1/ledger/transfers",
            json={"from_account_id": cash["id"], "to_account_id": bank["id"], "amount": 10},
        ).status_code
        == 403
    )
    assert ali.get("/api/v1/ledger/transfers").status_code == 403


def test_pnl_spells_out_discounts_and_returns(owner, cat):
    """Two phones at 1,000 (cost 800). One sold with a 100 discount, one sold and returned with a
    full refund. Gross 2,000 − discount 100 − return 1,000 = net sales 900; COGS 800 (the returned
    phone's cost came back); gross profit 100."""
    c = _party(owner, name="Ahmed", phone="03219876543", kinds=("customer",))
    d1 = _stock(owner, cat, imei=A, condition="box_pack", cost_price=800, asking_price=1000)
    d2 = _stock(owner, cat, imei=B, condition="box_pack", cost_price=800, asking_price=1000)
    r = owner.post(
        "/api/v1/sales",
        json={
            "party_id": c["id"],
            "devices": [{"device_id": d1["id"], "price": 1000}],
            "discount": 100,
            "paid": 900,
        },
    )
    assert r.status_code == 201, r.text
    inv = owner.post(
        "/api/v1/sales",
        json={
            "party_id": c["id"],
            "devices": [{"device_id": d2["id"], "price": 1000}],
            "paid": 1000,
        },
    ).json()
    r = owner.post(
        "/api/v1/returns/sale",
        json={
            "invoice_id": inv["id"],
            "line_ids": [inv["lines"][0]["id"]],
            "settlement": "refund",
            "refund_amount": 1000,
            "kept_amount": 0,
            "reason": "changed mind",
        },
    )
    assert r.status_code == 201, r.text
    pnl = owner.get("/api/v1/reports/profit-loss").json()
    assert pnl["gross_sales"] == "2000.00" and pnl["discounts"] == "100.00"
    assert pnl["sales_returns"] == "1000.00" and pnl["net_sales"] == pnl["sales"] == "900.00"
    assert pnl["cogs"] == "800.00" and pnl["gross_profit"] == "100.00"
    assert pnl["operating_expenses"] == "0.00" and pnl["operating_profit"] == "100.00"
    assert pnl["net_profit"] == "100.00"
    # a void is not a return: void the discounted bill → gross and discount both drop
    first = owner.get("/api/v1/sales", params={"limit": 10}).json()
    first_id = next(i["id"] for i in first if i["discount"] == "100.00")
    r = owner.post(f"/api/v1/sales/{first_id}/void", json={"reason": "wrong customer"})
    assert r.status_code in (200, 201), r.text
    pnl = owner.get("/api/v1/reports/profit-loss").json()
    assert pnl["gross_sales"] == "1000.00" and pnl["discounts"] == "0.00"
    assert pnl["sales_returns"] == "1000.00" and pnl["net_sales"] == "0.00"


def test_stock_age_counts_from_intake_not_last_event(owner, cat):
    sup = _party(owner, name="Dealer", phone="03005556666", kinds=("supplier",))
    day = (shop_today() - dt.timedelta(days=40)).isoformat()
    r = owner.post(
        "/api/v1/purchases",
        json={
            "kind": "supplier",
            "party_id": sup["id"],
            "date": day,
            "devices": [{"device": _dev(cat, A), "cost": 800, "asking_price": 1000}],
            "paid": 800,
        },
    )
    assert r.status_code == 201, r.text
    dev_id = r.json()["lines"][0]["device_id"]
    ages = {b["bucket"]: b["count"] for b in owner.get("/api/v1/reports/stock-ageing").json()}
    assert ages["31-60"] == 1
    # a note and a price change today do not make it a fresh phone
    owner.post(f"/api/v1/devices/{dev_id}/events", json={"type": "note", "note": "screen guard"})
    owner.patch(f"/api/v1/devices/{dev_id}", json={"asking_price": 950})
    ages = {b["bucket"]: b["count"] for b in owner.get("/api/v1/reports/stock-ageing").json()}
    assert ages["31-60"] == 1 and ages["0-15"] == 0
