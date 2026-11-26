"""Mock-up 20 (owner 2026-11-25): a unit's own ledger — out, in, the net after each line — derived from
its money page, so the two always agree; the A4 sheet and CSV; cost only for owner / manager."""

from tests.conftest import login
from tests.test_returns_audit import A, _buy, _customer, _sale_return, _sell, _supplier
from tests.test_units import _scenario


def test_vivo_ledger_agrees_with_its_money(owner, cat):
    _a, _b, dev_id, pur, inv, _po, _pi = _scenario(owner, cat)
    m = owner.get(f"/api/v1/devices/{dev_id}/money").json()
    led = m["ledger"]
    kinds = [r["kind"] for r in led["rows"]]
    assert kinds == ["purchase", "sale", "payment_out", "payment_in"]
    buy, sale, pay_out, pay_in = led["rows"]
    assert buy["out"] == "35000.00" and buy["in"] is None and buy["net_after"] == "-35000.00"
    assert buy["no"] == pur["no"] and buy["party_name"] == "Customer A"
    assert sale["in"] == "40000.00" and sale["net_after"] == "5000.00" and sale["no"] == inv["no"]
    # a payment moves cash on the bill, never the unit's net
    assert (
        pay_out["cash"] == "2000.00"
        and pay_out["out"] is None
        and pay_out["net_after"] == "5000.00"
    )
    assert pay_in["cash"] == "3000.00" and pay_in["net_after"] == "5000.00"
    assert led["out"] == "35000.00" and led["in"] == "40000.00" and led["net"] == "5000.00"
    # the net of a sold unit is its margin
    assert led["profit"] == m["summary"]["margin"] == "5000.00" and led["expected"] is None
    assert led["paid"] == "2000.00" and led["received"] == "3000.00"


def test_unsold_unit_shows_expected_profit(owner, cat):
    p = _buy(owner, cat, _supplier(owner), [A], cost=65000)
    dev = p["lines"][0]["device_id"]
    led = owner.get(f"/api/v1/devices/{dev}/money").json()["ledger"]
    assert led["net"] == "-65000.00" and led["profit"] is None and led["expected"] == "5000.00"


def test_customer_return_keeps_the_cut(owner, cat):
    p = _buy(owner, cat, _supplier(owner), [A])
    dev = p["lines"][0]["device_id"]
    inv = _sell(owner, _customer(owner), [dev])
    r = _sale_return(owner, inv, refund_amount=68000, kept_amount=2000, reason_code="changed_mind")
    assert r.status_code == 201, r.text
    led = owner.get(f"/api/v1/devices/{dev}/money").json()["ledger"]
    ret = next(x for x in led["rows"] if x["kind"] == "return_sale")
    # the sale (70,000) is undone except the 2,000 the shop kept: back in stock at its cost
    assert ret["out"] == "68000.00"
    assert led["net"] == "-63000.00"


def test_sheet_csv_and_cost_hiding(owner, client, cat):
    _a, _b, dev_id, pur, inv, _po, _pi = _scenario(owner, cat)
    r = owner.get(f"/api/v1/devices/{dev_id}/ledger-sheet?lang=en")
    assert r.status_code == 200
    assert "Item ledger" in r.text and pur["no"] in r.text and inv["no"] in r.text
    assert "35,000" in r.text and "+Rs. 5,000" in r.text.replace(" ", " ")
    r = owner.get(f"/api/v1/devices/{dev_id}/ledger-sheet?lang=ur")
    assert r.status_code == 200 and 'dir="rtl"' in r.text
    c = owner.get(f"/api/v1/devices/{dev_id}/ledger-sheet?format=csv")
    assert c.status_code == 200 and c.headers["content-type"].startswith("text/csv")
    lines = c.text.lstrip("﻿").strip().splitlines()
    assert lines[0].startswith("date,voucher") and len(lines) == 5 and lines[2].endswith("5000.00")

    owner.post(
        "/api/v1/staff",
        json={"name": "Ali", "phone": "03211234567", "password": "secret123", "role": "salesman"},
    )
    ali = login(client, "03211234567")
    assert ali.get(f"/api/v1/devices/{dev_id}/money").json()["ledger"] is None
    assert ali.get(f"/api/v1/devices/{dev_id}/ledger-sheet").status_code == 403
    assert ali.get(f"/api/v1/devices/{dev_id}/ledger-sheet?format=csv").status_code == 403
