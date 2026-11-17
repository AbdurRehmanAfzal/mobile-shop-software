"""Owner 2026-11-15 (ADR-078): the stock page's PDF fits A4 with every picked field, and two more
copies to share — the staff price list (every field + asking, no cost / seller) and the customer
list (customer fields + price, no IMEI / cost, phones for sale only). Excel prints on A4."""

import io

from openpyxl import load_workbook

from tests.conftest import login
from tests.test_devices import _stock
from tests.test_reports_owner import A, B, C

URL = "/api/v1/exports/stock"
ALL = "name,storage,ram,colour,condition,grade,pta,simlock,battery,cycles,region,sim,imei,imei2,serial,barcode,days,source,cost,asking,status,verification"


def _three(owner, cat):
    _stock(
        owner,
        cat,
        imei=A,
        condition="used",
        cost_price=10000,
        asking_price=12500,
        battery_health=88,
    )
    _stock(owner, cat, imei=B, condition="box_pack", cost_price=20000, asking_price=23500)
    d = _stock(owner, cat, imei=C, condition="used", cost_price=5000, asking_price=6500)
    owner.post(f"/api/v1/devices/{d['id']}/events", json={"type": "sent_to_repair"})


def test_screen_pdf_is_a4_with_every_field(owner, cat):
    _three(owner, cat)
    page = owner.get(f"{URL}?format=pdf&lang=en&status=all&cols={ALL}").text
    assert "size: A4 portrait" in page and "Stock list" in page
    for want in (A, B, C, "By brand", "By model", "Battery %", "88%", "12,500", "10,000"):
        assert want in page, want
    assert "At cost" in page and "35,000" in page  # 10,000 + 20,000 + 5,000
    assert page.count("<tr><td class='n'>") == 3  # one row a phone


def test_staff_copy_has_asking_and_the_seller_name_but_no_cost(owner, cat):
    _three(owner, cat)
    page = owner.get(f"{URL}?format=pdf&lang=en&copy=staff&status=all").text
    assert "Stock list with prices (staff)" in page and A in page and C in page
    assert "12,500" in page and "At asking price" in page
    for no in ("10,000", "At cost", "Cost"):
        assert no not in page, no
    x = load_workbook(io.BytesIO(owner.get(f"{URL}?format=xlsx&copy=staff&status=all").content))
    ws = x.active
    heads = [c.value for c in ws[1]]
    assert "Asking price" in heads and "IMEI" in heads and "Cost" not in heads
    assert "Bought from" in heads and ws.max_row == 4
    assert ws.page_setup.orientation == "landscape" and ws.print_title_rows in ("1:1", "$1:$1")
    csv = owner.get(f"{URL}?format=csv&copy=staff&status=all").text
    assert "Asking price" in csv and "Cost" not in csv


def test_customer_copy_has_no_imei_and_only_phones_for_sale(owner, cat):
    _three(owner, cat)
    page = owner.get(f"{URL}?format=pdf&lang=en&copy=customer&status=all").text
    assert "Phones for sale" in page and "12,500" in page and "23,500" in page
    assert "6,500" not in page  # in repair: not for sale
    for no in (A, B, "IMEI", "10,000", "Cost", "Barcode", "Bought from"):
        assert no not in page, no


def test_salesman_staff_copy_and_no_cost(client, owner, cat):
    _three(owner, cat)
    owner.post(
        "/api/v1/staff",
        json={
            "name": "Sales Boy",
            "phone": "03451118899",
            "password": "secret123",
            "role": "salesman",
        },
    )
    s = login(client, "03451118899")
    page = s.get(f"{URL}?format=pdf&lang=en&status=all&cols={ALL}").text
    assert "12,500" in page and "10,000" not in page and "At cost" not in page
    assert s.get(f"{URL}?format=pdf&copy=staff").status_code == 200


def test_every_wide_report_is_a4_portrait(owner, cat):
    _three(owner, cat)
    page = owner.get("/api/v1/exports/sales?format=pdf").text
    assert "size: A4 portrait" in page and "landscape" not in page


def test_seller_name_for_staff_and_phone_for_the_owner(client, owner, cat):
    """owner 2026-11-17 (ADR-093): who a phone was bought from — the staff list and the staff tally
    name the seller; the owner's own list and tally add the seller's phone number"""
    from tests.test_purchases import _party

    sup = _party(owner, name="Ali Traders", phone="03007771234", kinds=("supplier",))
    r = owner.post(
        "/api/v1/purchases",
        json={
            "kind": "supplier",
            "party_id": sup["id"],
            "devices": [
                {
                    "device": {
                        "imei1": "352099001761481",
                        "brand_id": cat["brand"]["id"],
                        "model_id": cat["model"]["id"],
                        "condition": "box_pack",
                        "pta_status": "pta_approved",
                    },
                    "cost": 9000,
                    "asking_price": 11000,
                }
            ],
            "paid": 9000,
        },
    )
    assert r.status_code == 201, r.text
    phone = "03007771234"
    # price lists
    staff = owner.get(f"{URL}?format=pdf&lang=en&copy=staff&status=all").text
    assert "Ali Traders" in staff and phone not in staff
    customer = owner.get(f"{URL}?format=pdf&lang=en&copy=customer&status=all").text
    assert "Ali Traders" not in customer and phone not in customer
    mine = owner.get(f"{URL}?format=pdf&lang=en&status=all&cols=name,imei,source,asking").text
    assert "Ali Traders" in mine and phone in mine
    csv = owner.get(f"{URL}?format=csv&status=all&cols=name,imei,source").text
    assert f"Ali Traders · {phone}" in csv
    # tally sheets
    tally = "/api/v1/exports/stock-tally"
    own = owner.get(f"{tally}?format=pdf&lang=en").text
    assert "Ali Traders" in own and phone in own
    blind = owner.get(f"{tally}?format=pdf&lang=en&staff=true").text
    assert "Ali Traders" in blind and phone not in blind
    # a salesman's own stock list never carries the phone
    owner.post(
        "/api/v1/staff",
        json={
            "name": "Sales Boy",
            "phone": "03451118899",
            "password": "secret123",
            "role": "salesman",
        },
    )
    s = login(client, "03451118899")
    theirs = s.get(f"{URL}?format=csv&status=all&cols=name,imei,source").text
    assert "Ali Traders" in theirs and phone not in theirs
