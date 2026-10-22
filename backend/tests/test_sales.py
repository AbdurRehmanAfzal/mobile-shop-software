"""FR-TXN-04, FR-TXN-12, FR-TAX-02, FR-VER-04: sales invoices, COGS, tax, sale block, void, receipt."""

from decimal import Decimal

from app.modules.sales.service import compute_tax
from tests.conftest import login
from tests.test_devices import _stock
from tests.test_purchases import _party

IMEI_A = "490154203237518"
IMEI_B = "356938035643809"


def _customer(actor, phone="03219876543"):
    return _party(actor, name="Ahmed Khan", phone=phone, kinds=("customer",))


def _boxpack(owner, cat, imei=IMEI_A, cost=40000, asking=50000):
    return _stock(owner, cat, imei=imei, condition="box_pack", cost_price=cost, asking_price=asking)


def test_compute_tax():
    assert compute_tax(Decimal(1000), Decimal(18), True) == (Decimal("152.54"), Decimal("1000.00"))
    assert compute_tax(Decimal(1000), Decimal(18), False) == (Decimal("180.00"), Decimal("1180.00"))
    assert compute_tax(Decimal(1000), Decimal(0), True) == (Decimal("0.00"), Decimal("1000.00"))


def test_credit_sale_s4_posts_cogs_and_balances(owner, cat):
    d = _boxpack(owner, cat)
    c = _customer(owner)
    r = owner.post(
        "/api/v1/sales",
        json={
            "party_id": c["id"],
            "devices": [
                {
                    "device_id": d["id"],
                    "price": 50000,
                    "warranty_days": 7,
                    "accessories_given": ["box"],
                    "accessories_pending": [{"kind": "charger", "promised_at": "2026-10-25"}],
                }
            ],
            "paid": 30000,
        },
    )
    assert r.status_code == 201, r.text
    inv = r.json()
    assert (
        inv["no"] == "INV-000001"
        and inv["total"] == "50000.00"
        and inv["paid"] == "30000.00"
        and inv["balance_due"] == "20000.00"
    )
    assert (
        inv["status"] == "partially_paid"
        and inv["profit"] == "10000.00"
        and inv["cost_total"] == "40000.00"
    )
    assert inv["party_balance_after"] == "20000.00"
    assert owner.get(f"/api/v1/parties/{c['id']}").json()["balance"] == "20000.00"
    assert owner.get("/api/v1/ledger/accounts").json()[0]["balance"] == "30000.00"
    g = owner.get(f"/api/v1/ledger/groups/{inv['ledger_group_id']}").json()
    accts = {
        e["account"]: (e["debit"], e["credit"])
        for e in g["entries"]
        if e["account"] in ("sales", "cogs", "inventory")
    }
    assert (
        accts["sales"] == ("0.00", "50000.00")
        and accts["cogs"] == ("40000.00", "0.00")
        and accts["inventory"] == ("0.00", "40000.00")
    )
    dev = owner.get(f"/api/v1/devices/{d['id']}").json()
    assert dev["status"] == "sold" and dev["current_party_name"] == "Ahmed Khan"
    acc_by_kind = {a["kind"]: a for a in dev["accessories"]}
    assert acc_by_kind["box"]["given_at_sale"] is True
    assert (
        acc_by_kind["charger"]["pending_from"] == "shop"
        and acc_by_kind["charger"]["promised_to_customer_at"] == "2026-10-25"
    )
    hist = owner.get(f"/api/v1/devices/{d['id']}/history").json()
    assert (
        hist[-1]["type"] == "sold"
        and hist[-1]["amount"] == "50000.00"
        and hist[-1]["data"]["invoice_no"] == "INV-000001"
    )
    # payments: two more of 10,000 clear the account (ledger-level, payments module adds the API)
    st = owner.get(f"/api/v1/ledger/parties/{c['id']}/statement").json()
    assert st["closing_balance"] == "20000.00" and [row["document_type"] for row in st["rows"]] == [
        "invoice",
        "invoice",
    ]


def test_tax_inclusive_and_exclusive(owner, cat):
    d1 = _boxpack(owner, cat, imei=IMEI_A, cost=800, asking=1000)
    d2 = _boxpack(owner, cat, imei=IMEI_B, cost=800, asking=1000)
    owner.patch(
        "/api/v1/shops/current", json={"tax_enabled": True, "tax_rate": 18, "tax_inclusive": True}
    )
    inv = owner.post(
        "/api/v1/sales", json={"devices": [{"device_id": d1["id"], "price": 1000}], "paid": 1000}
    ).json()
    assert (
        inv["total"] == "1000.00"
        and inv["tax_amount"] == "152.54"
        and inv["status"] == "paid"
        and inv["party_id"] is None
    )
    assert inv["profit"] == "47.46"  # 1000 - 152.54 tax - 800 cost
    owner.patch("/api/v1/shops/current", json={"tax_inclusive": False})
    inv = owner.post(
        "/api/v1/sales",
        json={"devices": [{"device_id": d2["id"], "price": 1000}], "discount": 100, "paid": 1062},
    ).json()
    assert (
        inv["subtotal"] == "1000.00"
        and inv["discount"] == "100.00"
        and inv["tax_amount"] == "162.00"
        and inv["total"] == "1062.00"
    )
    g = owner.get(f"/api/v1/ledger/groups/{inv['ledger_group_id']}").json()
    assert next(e for e in g["entries"] if e["account"] == "tax_payable")["credit"] == "162.00"
    assert next(e for e in g["entries"] if e["account"] == "sales")["credit"] == "900.00"


def test_cash_sale_without_customer_must_be_fully_paid(owner, cat):
    d = _boxpack(owner, cat)
    r = owner.post(
        "/api/v1/sales", json={"devices": [{"device_id": d["id"], "price": 50000}], "paid": 10000}
    )
    assert r.status_code == 422 and r.json()["error"]["code"] == "credit_needs_customer"


def test_unverified_used_device_blocked_then_override(client, owner, cat):
    used = _stock(owner, cat, imei=IMEI_B, condition="used", cost_price=1000, asking_price=1500)
    c = _customer(owner)
    r = owner.post(
        "/api/v1/sales",
        json={
            "party_id": c["id"],
            "devices": [{"device_id": used["id"], "price": 1500}],
            "paid": 1500,
        },
    )
    assert r.status_code == 409 and r.json()["error"]["code"] == "not_sellable"
    owner.post(
        "/api/v1/staff",
        json={"name": "Sales", "phone": "03451112233", "password": "secret123", "role": "salesman"},
    )
    s = login(client, "03451112233")
    r = s.post(
        "/api/v1/sales",
        json={
            "party_id": c["id"],
            "devices": [{"device_id": used["id"], "price": 1500}],
            "paid": 1500,
            "override_reason": "boss said ok",
        },
    )
    assert r.status_code == 409  # salesman cannot override
    r = owner.post(
        "/api/v1/sales",
        json={
            "party_id": c["id"],
            "devices": [{"device_id": used["id"], "price": 1500}],
            "paid": 1500,
            "override_reason": "Regular customer, known device",
        },
    )
    assert r.status_code == 201, r.text
    hist = owner.get(f"/api/v1/devices/{used['id']}/history").json()
    assert [h["type"] for h in hist] == ["purchased", "verified", "sold"] and hist[1]["data"][
        "override"
    ] is True


def test_device_not_in_stock_cannot_be_sold(owner, cat):
    d = _boxpack(owner, cat)
    shop_b = _party(owner, name="Bilal Mobiles", phone="03001111111", kinds=("shop",))
    loan = owner.post("/api/v1/loans", json={"device_id": d["id"], "party_id": shop_b["id"]}).json()
    r = owner.post(
        "/api/v1/sales",
        json={
            "party_id": shop_b["id"],
            "devices": [{"device_id": d["id"], "price": 1000}],
            "paid": 1000,
        },
    )
    assert r.status_code == 409 and r.json()["error"]["code"] == "device_on_loan"
    owner.post(f"/api/v1/loans/{loan['id']}/return", json={})
    owner.post(
        "/api/v1/sales", json={"devices": [{"device_id": d["id"], "price": 1000}], "paid": 1000}
    )
    r = owner.post(
        "/api/v1/sales", json={"devices": [{"device_id": d["id"], "price": 1000}], "paid": 1000}
    )
    assert r.status_code == 409 and r.json()["error"]["code"] == "device_not_in_stock"


def test_void_sale_restores_everything(owner, cat):
    d = _boxpack(owner, cat)
    c = _customer(owner)
    inv = owner.post(
        "/api/v1/sales",
        json={
            "party_id": c["id"],
            "devices": [{"device_id": d["id"], "price": 50000, "accessories_given": ["box"]}],
            "paid": 30000,
        },
    ).json()
    r = owner.post(f"/api/v1/sales/{inv['id']}/void", json={"reason": "customer changed mind"})
    assert (
        r.status_code == 200 and r.json()["status"] == "void" and r.json()["balance_due"] == "0.00"
    )
    assert owner.get(f"/api/v1/parties/{c['id']}").json()["balance"] == "0.00"
    assert (
        owner.get("/api/v1/ledger/accounts").json()[0]["balance"] == "0.00"
    )  # the 30,000 received was reversed
    dev = owner.get(f"/api/v1/devices/{d['id']}").json()
    assert dev["status"] == "in_stock" and dev["current_party_id"] is None
    assert (
        owner.post(f"/api/v1/sales/{inv['id']}/void", json={"reason": "again"}).status_code == 409
    )


def test_receipt_html_thermal_and_a4(owner, cat):
    d = _boxpack(owner, cat)
    c = _customer(owner)
    inv = owner.post(
        "/api/v1/sales",
        json={
            "party_id": c["id"],
            "devices": [
                {"device_id": d["id"], "price": 50000, "accessories_pending": [{"kind": "charger"}]}
            ],
            "paid": 30000,
        },
    ).json()
    r = owner.get(f"/api/v1/sales/{inv['id']}/receipt")
    assert (
        r.status_code == 200
        and "80mm" in r.text
        and IMEI_A in r.text
        and "Ahmed Khan" in r.text
        and "بقایا" in r.text
        and "charger" in r.text
    )
    r = owner.get(f"/api/v1/sales/{inv['id']}/receipt", params={"format": "a4"})
    assert "A4" in r.text


def test_salesman_sees_no_cost_or_profit(client, owner, cat):
    d = _boxpack(owner, cat)
    owner.post(
        "/api/v1/staff",
        json={"name": "Sales", "phone": "03451112233", "password": "secret123", "role": "salesman"},
    )
    s = login(client, "03451112233")
    inv = s.post(
        "/api/v1/sales", json={"devices": [{"device_id": d["id"], "price": 50000}], "paid": 50000}
    ).json()
    assert inv["profit"] is None and inv["cost_total"] is None and inv["lines"][0]["cost"] is None
    assert len(s.get("/api/v1/sales").json()) == 1
    assert (
        s.post(f"/api/v1/sales/{inv['id']}/void", json={"reason": "nope nope"}).status_code == 403
    )
