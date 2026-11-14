"""Owner 2026-11-14 (ADR-075): a stock tally sheet — an A4 print page and an Excel — with the shop,
the figures, counts by brand and model, and every phone (all fields) to count by hand."""

import io

from openpyxl import load_workbook

from tests.conftest import login
from tests.test_devices import _stock
from tests.test_reports_owner import A, B, C


def test_tally_page_and_excel(client, owner, cat):
    _stock(owner, cat, imei=A, condition="box_pack", cost_price=1000, asking_price=1500)
    d2 = _stock(owner, cat, imei=B, condition="used", cost_price=2000, asking_price=2500)
    _stock(owner, cat, imei=C, condition="box_pack", cost_price=500, asking_price=700)
    owner.post(f"/api/v1/devices/{d2['id']}/events", json={"type": "sent_to_repair"})

    page = owner.get("/api/v1/exports/stock-tally?format=pdf&lang=en").text
    assert "Stock tally sheet" in page and "size: A4 portrait" in page
    for want in ("Phones on hand", "In the shop", "By brand", "By model", "Every phone", A, B, C):
        assert want in page
    assert "Phones at cost" in page and "3,500" in page  # 1,000 + 2,000 + 500
    assert "In repair" in page and "Counted by" in page

    x = owner.get("/api/v1/exports/stock-tally?format=xlsx")
    assert x.status_code == 200
    wb = load_workbook(io.BytesIO(x.content))
    assert wb.sheetnames == ["Summary", "Phones", "Items"]
    ph = wb["Phones"]
    assert ph.max_row == 4 and ph.page_setup.orientation == "landscape"
    heads = [c.value for c in ph[1]]
    assert "IMEI" in heads and "Cost" in heads and "Shelf" in heads

    # a salesman: only after the owner allows it (ADR-077), and then the staff copy, no money
    owner.post(
        "/api/v1/staff",
        json={"name": "Sales", "phone": "03451112233", "password": "secret123", "role": "salesman"},
    )
    s = login(client, "03451112233")
    assert s.get("/api/v1/exports/stock-tally?format=pdf").status_code == 403
    s.post("/api/v1/staff-access/stock_tally/request")
    rid = owner.get("/api/v1/staff-access/stock_tally").json()["requests"][0]["id"]
    owner.post(f"/api/v1/staff-access/requests/{rid}/approve")
    sp = s.get("/api/v1/exports/stock-tally?format=pdf").text
    assert "Phones at cost" not in sp and "Cash + bank now" not in sp
    sx = load_workbook(io.BytesIO(s.get("/api/v1/exports/stock-tally?format=xlsx").content))
    assert "Cost" not in [c.value for c in sx["Phones"][1]]


def test_tally_csv(owner, cat):
    _stock(owner, cat, imei=A, condition="box_pack", cost_price=1000, asking_price=1500)
    r = owner.get("/api/v1/exports/stock-tally?format=csv")
    assert r.status_code == 200 and A in r.text and "Found" in r.text
