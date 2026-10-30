"""Owner (2026-10-30): the Vivo scenario, exactly as written.

14 Apr: bought a used Vivo from Customer A for 35,000, paid 30,000, 5,000 payable; asking 45,000.
15 Apr: sold it to Customer B for 40,000, received 35,000, 5,000 receivable.
17 Apr: paid A 2,000 against the Vivo → A payable 3,000.
18 Apr: B paid 3,000 against the Vivo → B receivable 2,000.
Every screen must read the same numbers: the phone, A, B, the receipts."""

from tests.conftest import login
from tests.test_purchases import _dev, _party

IMEI = "490154203237518"


def _scenario(owner, cat):
    a = _party(owner, name="Customer A", phone="03001111111", kinds=("customer",))
    b = _party(owner, name="Customer B", phone="03002222222", kinds=("customer",))
    r = owner.post(
        "/api/v1/purchases",
        json={
            "kind": "walk_in",
            "party_id": a["id"],
            "date": "2026-04-14",
            "devices": [
                {"device": _dev(cat, IMEI, condition="used"), "cost": 35000, "asking_price": 45000}
            ],
            "paid": 30000,
        },
    )
    assert r.status_code == 201, r.text
    pur = r.json()
    dev_id = pur["lines"][0]["device_id"]
    owner.post(f"/api/v1/devices/{dev_id}/verification/override", json={"reason": "known seller"})
    r = owner.post(
        "/api/v1/sales",
        json={
            "party_id": b["id"],
            "date": "2026-04-15",
            "devices": [{"device_id": dev_id, "price": 40000}],
            "paid": 35000,
        },
    )
    assert r.status_code == 201, r.text
    inv = r.json()
    r = owner.post(
        "/api/v1/payments",
        json={
            "party_id": a["id"],
            "direction": "out",
            "amount": 2000,
            "date": "2026-04-17",
            "allocations": [
                {"document_type": "purchase", "document_id": pur["id"], "amount": 2000}
            ],
        },
    )
    assert r.status_code == 201, r.text
    pay_out = r.json()
    r = owner.post(
        "/api/v1/payments",
        json={
            "party_id": b["id"],
            "direction": "in",
            "amount": 3000,
            "date": "2026-04-18",
            "allocations": [{"document_type": "invoice", "document_id": inv["id"], "amount": 3000}],
        },
    )
    assert r.status_code == 201, r.text
    pay_in = r.json()
    return a, b, dev_id, pur, inv, pay_out, pay_in


def test_vivo_unit_money_and_timeline(owner, cat):
    a, b, dev_id, pur, inv, pay_out, pay_in = _scenario(owner, cat)  # noqa: RUF059
    m = owner.get(f"/api/v1/devices/{dev_id}/money").json()
    s = m["summary"]
    assert s["cost"] == "35000.00" and s["paid_out"] == "32000.00" and s["payable"] == "3000.00"
    assert (
        s["sold_for"] == "40000.00" and s["received"] == "38000.00" and s["receivable"] == "2000.00"
    )
    assert s["margin"] == "5000.00" and s["status"] == "sold" and s["source"] == "purchase"
    p, sale = m["purchase"], m["sale"]
    assert p["party_name"] == "Customer A" and p["no"] == pur["no"] and p["upfront"] == "30000.00"
    assert [x["amount"] for x in p["payments"]] == ["2000.00"] and p["payments"][0][
        "no"
    ] == pay_out["no"]
    assert (
        sale["party_name"] == "Customer B"
        and sale["upfront"] == "35000.00"
        and sale["remaining"] == "2000.00"
    )
    assert [x["amount"] for x in sale["payments"]] == ["3000.00"]
    kinds = [t["kind"] for t in m["timeline"] if t["kind"] != "event"]
    assert kinds == ["purchase", "sale", "payment_out", "payment_in"]
    dates = [t["date"] for t in m["timeline"] if t["kind"] != "event"]
    assert dates == ["2026-04-14", "2026-04-15", "2026-04-17", "2026-04-18"]
    last = m["timeline"][-1]
    assert last["payable_after"] == "3000.00" and last["receivable_after"] == "2000.00"
    # the sale row knew 5,000 was still to come in; the payment-out row brought A's unit balance to 3,000
    sale_row = next(t for t in m["timeline"] if t["kind"] == "sale")
    assert sale_row["remaining_then"] == "5000.00" and sale_row["receivable_after"] == "5000.00"
    out_row = next(t for t in m["timeline"] if t["kind"] == "payment_out")
    assert out_row["payable_after"] == "3000.00" and out_row["doc_no"] == pur["no"]


def test_vivo_from_both_customers(owner, cat):
    a, b, dev_id, pur, inv, pay_out, pay_in = _scenario(owner, cat)  # noqa: RUF059
    ua = owner.get(f"/api/v1/parties/{a['id']}/units").json()
    assert (
        ua["payable"] == "3000.00"
        and ua["receivable"] == "0.00"
        and ua["balance"] == "-3000.00"
        and ua["other"] == "0.00"
    )
    assert ua["bought_count"] == 1 and ua["sold_count"] == 0 and ua["pending_count"] == 1
    row = ua["rows"][0]
    assert row["role"] == "bought_from" and row["imei1"] == IMEI and row["agreed"] == "35000.00"
    assert (
        row["paid"] == "32000.00"
        and row["remaining"] == "3000.00"
        and row["settled"] is False
        and row["payments"] == 1
    )
    ub = owner.get(f"/api/v1/parties/{b['id']}/units").json()
    assert ub["receivable"] == "2000.00" and ub["payable"] == "0.00" and ub["balance"] == "2000.00"
    rb = ub["rows"][0]
    assert (
        rb["role"] == "sold_to"
        and rb["agreed"] == "40000.00"
        and rb["paid"] == "38000.00"
        and rb["remaining"] == "2000.00"
    )
    # backdated documents sit on their own day in the statement (owner: correct timestamps)
    st = owner.get(f"/api/v1/ledger/parties/{a['id']}/statement").json()
    assert [r["at"][:10] for r in st["rows"]] == ["2026-04-14", "2026-04-14", "2026-04-17"]
    # the khata agrees with the unit view
    assert owner.get(f"/api/v1/parties/{a['id']}").json()["balance"] == "-3000.00"
    assert owner.get(f"/api/v1/parties/{b['id']}").json()["balance"] == "2000.00"


def test_vivo_receipts_and_cost_hiding(owner, client, cat):
    a, b, dev_id, pur, inv, pay_out, pay_in = _scenario(owner, cat)  # noqa: RUF059
    r = owner.get(f"/api/v1/payments/{pay_in['id']}/receipt?lang=en")
    assert r.status_code == 200
    assert "Payment received" in r.text and pay_in["no"] in r.text and "Rs. 3,000" in r.text
    assert inv["no"] in r.text and IMEI in r.text and "2,000" in r.text  # left now
    assert "Account balance after" in r.text and "2,000 (they owe)" in r.text
    r = owner.get(f"/api/v1/payments/{pay_out['id']}/receipt?lang=en&format=a4")
    assert (
        "Payment voucher" in r.text
        and "Paid to" in r.text
        and "Customer A" in r.text
        and "3,000 (shop owes)" in r.text
    )
    # a salesman sees the sale side but no buying money
    owner.post(
        "/api/v1/staff",
        json={"name": "Ali", "phone": "03211234567", "password": "secret123", "role": "salesman"},
    )
    ali = login(client, "03211234567")
    m = ali.get(f"/api/v1/devices/{dev_id}/money").json()
    assert (
        m["summary"]["cost"] is None
        and m["summary"]["payable"] is None
        and m["summary"]["margin"] is None
    )
    assert m["summary"]["receivable"] == "2000.00" and m["purchase"]["line_total"] is None
    assert all("amount" not in t for t in m["timeline"] if t["kind"] in ("purchase", "payment_out"))
    ua = ali.get(f"/api/v1/parties/{a['id']}/units").json()
    assert ua["payable"] is None and ua["rows"][0]["agreed"] is None


def test_opening_stock_and_shared_bill(owner, cat):
    """No purchase bill (old stock) → cost from the device; two phones on one bill share a payment."""
    from tests.test_devices import _stock

    d = _stock(
        owner, cat, imei="356938035643809", condition="used", cost_price=8000, asking_price=9500
    )
    m = owner.get(f"/api/v1/devices/{d['id']}/money").json()
    assert (
        m["purchase"] is None
        and m["summary"]["source"] == "opening_stock"
        and m["summary"]["cost"] == "8000.00"
    )
    sup = _party(owner, name="Rehman Traders", phone="03005555555", kinds=("supplier",))
    r = owner.post(
        "/api/v1/purchases",
        json={
            "kind": "supplier",
            "party_id": sup["id"],
            "devices": [
                {"device": _dev(cat, "353879234567891"), "cost": 10000},
                {"device": _dev(cat, "358812091717195"), "cost": 30000},
            ],
            "paid": 0,
        },
    )
    assert r.status_code == 201, r.text
    pur = r.json()
    owner.post(
        "/api/v1/payments",
        json={
            "party_id": sup["id"],
            "direction": "out",
            "amount": 20000,
            "allocations": [
                {"document_type": "purchase", "document_id": pur["id"], "amount": 20000}
            ],
        },
    )
    cheap = next(ln["device_id"] for ln in pur["lines"] if ln["unit_cost"] == "10000.00")
    m = owner.get(f"/api/v1/devices/{cheap}/money").json()
    # 20,000 on a 40,000 bill → a quarter of it, 5,000, belongs to the 10,000 phone
    assert (
        m["purchase"]["shared_bill"] is True
        and m["purchase"]["paid"] == "5000.00"
        and m["purchase"]["remaining"] == "5000.00"
    )
    u = owner.get(f"/api/v1/parties/{sup['id']}/units").json()
    assert u["payable"] == "20000.00" and sorted(r["remaining"] for r in u["rows"]) == [
        "15000.00",
        "5000.00",
    ]
