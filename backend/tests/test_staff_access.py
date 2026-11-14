"""Owner 2026-11-14 (ADR-077): the stock tally sheet's staff copy has no money at all, and staff
get it only after the owner approves their request; the owner can take it back."""

import io

from openpyxl import load_workbook

from tests.conftest import login
from tests.test_devices import _stock
from tests.test_reports_owner import A, B

URL = "/api/v1/exports/stock-tally"


def _salesman(client, owner, phone="03451114455"):
    owner.post(
        "/api/v1/staff",
        json={"name": "Counter Boy", "phone": phone, "password": "secret123", "role": "salesman"},
    )
    return login(client, phone)


def test_staff_copy_has_no_money(owner, cat):
    _stock(owner, cat, imei=A, condition="used", cost_price=1234, asking_price=5678)
    full = owner.get(f"{URL}?format=pdf&lang=en").text
    assert "5,678" in full and "To get (lena)" in full

    page = owner.get(f"{URL}?format=pdf&lang=en&staff=true").text
    assert "Stock tally sheet (staff copy)" in page and A in page and "Found" in page
    for money in ("1,234", "5,678", "Asking", "Cost", "To get", "To give", "Cash", "at cost"):
        assert money not in page, money

    wb = load_workbook(io.BytesIO(owner.get(f"{URL}?format=xlsx&staff=true").content))
    heads = [c.value for c in wb["Phones"][1]]
    assert "IMEI" in heads and "Asking" not in heads and "Cost" not in heads
    assert "Bought from" not in heads
    cells = [c.value for row in wb["Summary"].iter_rows() for c in row]
    assert 5678 not in cells and 5678.0 not in cells

    csv = owner.get(f"{URL}?format=csv&staff=true").text
    assert A in csv and "Asking" not in csv and "5678" not in csv


def test_request_approve_revoke(client, owner, cat):
    _stock(owner, cat, imei=B, condition="used", cost_price=1000, asking_price=1500)
    s = _salesman(client, owner)
    assert s.get(f"{URL}?format=pdf").status_code == 403
    assert s.get("/api/v1/staff-access/stock_tally").json()["status"] is None
    # a salesman cannot answer requests
    r = s.post("/api/v1/staff-access/stock_tally/request").json()
    assert r == {"status": "pending", "allowed": False}
    s.post("/api/v1/staff-access/stock_tally/request")  # asking twice keeps one request
    reqs = owner.get("/api/v1/staff-access/stock_tally").json()["requests"]
    assert len(reqs) == 1 and reqs[0]["name"] == "Counter Boy" and reqs[0]["status"] == "pending"
    rid = reqs[0]["id"]
    assert s.post(f"/api/v1/staff-access/requests/{rid}/approve").status_code == 403
    assert s.get(f"{URL}?format=pdf").status_code == 403

    assert owner.post(f"/api/v1/staff-access/requests/{rid}/approve").json()["status"] == "approved"
    assert s.get("/api/v1/staff-access/stock_tally").json()["allowed"] is True
    # always the staff copy, even when the full one is asked for
    page = s.get(f"{URL}?format=pdf&lang=en").text
    assert "(staff copy)" in page and B in page and "1,500" not in page
    assert owner.post(f"/api/v1/staff-access/requests/{rid}/approve").status_code == 409

    owner.post(f"/api/v1/staff-access/requests/{rid}/revoke")
    assert s.get(f"{URL}?format=pdf").status_code == 403
    assert owner.get("/api/v1/staff-access/stock_tally").json()["requests"] == []

    # asked again and rejected
    s.post("/api/v1/staff-access/stock_tally/request")
    rid2 = owner.get("/api/v1/staff-access/stock_tally").json()["requests"][0]["id"]
    owner.post(f"/api/v1/staff-access/requests/{rid2}/reject")
    assert s.get("/api/v1/staff-access/stock_tally").json()["status"] == "rejected"
    assert s.get(f"{URL}?format=xlsx").status_code == 403


def test_manager_gets_both_without_asking(client, owner, cat):
    owner.post(
        "/api/v1/staff",
        json={"name": "Mgr", "phone": "03451116677", "password": "secret123", "role": "manager"},
    )
    m = login(client, "03451116677")
    assert m.get(f"{URL}?format=pdf").status_code == 200
    assert m.get(f"{URL}?format=pdf&staff=true").status_code == 200
    st = m.get("/api/v1/staff-access/stock_tally").json()
    assert st["allowed"] is True and st["requests"] is None
