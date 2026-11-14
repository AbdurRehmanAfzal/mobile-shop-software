"""Owner 2026-11-14 (ADR-076): the business overview — every figure of the period on one screen;
read-only; owner / manager only; profit only with cost rights."""

from tests.conftest import login
from tests.test_corrections_after_purchase import _buy
from tests.test_purchases import IMEI_B, _party
from tests.test_returns import _customer


def test_overview_figures(client, owner, cat):
    dealer = _party(owner, name="Overview Dealer", phone="03007779999")
    p = _buy(owner, cat, dealer, cost=10000, paid=4000)  # 6,000 on udhaar
    _buy(owner, cat, dealer, imei=IMEI_B, cost=8000, paid=8000)
    cust = _customer(owner)
    dev = p["lines"][0]["device_id"]
    sale = owner.post(
        "/api/v1/sales",
        json={
            "devices": [{"device_id": dev, "price": 15000}],
            "party_id": cust["id"],
            "paid": 5000,
        },
    )
    assert sale.status_code == 201, sale.text
    pay = owner.post(
        "/api/v1/payments",
        json={"party_id": cust["id"], "direction": "in", "amount": 2000},
    )
    assert pay.status_code == 201, pay.text

    o = owner.get("/api/v1/reports/overview").json()
    assert o["sales"]["total"] == "15000.00" and o["sales"]["count"] == 1
    assert o["sales"]["phones"] == 1
    assert (
        o["sales"]["paid"] == "7000.00" and o["sales"]["credit"] == "8000.00"
    )  # 5,000 + 2,000 later
    assert o["sales"]["profit"] is not None
    pu = o["purchases"]
    assert pu["count"] == 2 and pu["total"] == "18000.00" and pu["paid"] == "12000.00"
    assert pu["credit"] == "6000.00" and pu["phones"] == 2 and pu["top"]
    # received: 5,000 on the bill + 2,000 later, both from the customer; paid: 4,000 + 8,000 on bills
    pin, pout = o["payments"]["in"], o["payments"]["out"]
    assert pin["total"] == "7000.00" and pin["at_bill"] == "5000.00"
    assert pin["people"][0]["party_id"] == cust["id"] and pin["people"][0]["amount"] == "7000.00"
    assert pin["people"][0]["count"] == 2 and pin["people_count"] == 1
    assert pout["total"] == "12000.00" and pout["at_bill"] == "12000.00"
    assert pout["people"][0]["party_id"] == dealer["id"] and pout["people"][0]["count"] == 2
    assert o["people"]["new_customers"] >= 1 and o["people"]["new_dealers"] == 1
    assert o["dues"]["to_get"] == "8000.00" and o["dues"]["to_give"] == "6000.00"
    assert o["dues"]["to_get_list"][0]["party_id"] == cust["id"]
    assert o["top_sold"] and o["alerts"]["on_hand"] == 1
    assert o["counts"]["sales"] == 1 and o["counts"]["purchases"] == 2
    assert o["recent"] and o["month"]["sales"] == "15000.00"

    # a salesman may not open it
    owner.post(
        "/api/v1/staff",
        json={"name": "Sales", "phone": "03451112233", "password": "secret123", "role": "salesman"},
    )
    s = login(client, "03451112233")
    assert s.get("/api/v1/reports/overview").status_code == 403
