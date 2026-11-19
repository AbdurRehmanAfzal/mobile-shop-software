"""Shopkeepers 2026-11-20 (ADR-114): a phone's details as an 80 mm slip or an A4 page, with the
lines the shop ticks — what the phone's page previews, prints, downloads and shares."""

from tests.conftest import login
from tests.test_devices import _stock

IMEI = "490154203237518"


def test_phone_details_slip_and_a4(owner, client, cat, other_owner):
    d = _stock(
        owner,
        cat,
        imei=IMEI,
        imei2="356938035643809",
        serial="F2LXK9QWERTY",
        condition="used",
        cost_price=100000,
        asking_price=150000,
        ram_gb=8,
        battery_health=87,
        battery_cycles=312,
        warranty_months=6,
        warranty_by="shop",
        notes="small scratch on the back",
    )
    url = f"/api/v1/devices/{d['id']}/sheet"

    # the lines that may be ticked: cost and the seller only for owner / manager
    opts = owner.get("/api/v1/devices/sheet-options").json()
    assert {"imei", "imei2", "price", "accessories", "barcode", "cost", "seller"} <= set(
        opts["fields"]
    )
    assert "cost" not in opts["default_fields"]

    # 80 mm: the page is the roll's width; the default lines; never the cost
    slip = owner.get(url, params={"format": "thermal", "lang": "en"})
    assert slip.status_code == 200, slip.text
    page = slip.text
    assert "size: 80mm auto" in page and "width: 72mm" in page
    assert "Phone details" in page and f"{d['brand_name']} {d['model_name']}" in page
    assert "Rs. 150,000" in page and IMEI in page and "356938035643809" in page
    assert "F2LXK9QWERTY" in page and "8GB RAM" in page and "Used" in page
    assert "87%" in page and "312 cycles" in page and "6 months" in page and "by the shop" in page
    assert "Box" in page and "Charger (to come)" in page  # what came with it, and what is still due
    assert "<svg" in page  # the barcode: the IMEI, as on the sticker
    assert "100,000" not in page and "small scratch" not in page

    # A4, chosen lines: only those, in the page's own order; cost and notes when asked
    a4 = owner.get(
        url, params={"format": "a4", "lang": "en", "fields": "price,cost,imei,notes"}
    ).text
    assert "size: A4" in a4 and "width: 190mm" in a4
    assert "Rs. 150,000" in a4 and "Rs. 100,000" in a4 and "small scratch on the back" in a4
    assert "356938035643809" not in a4 and "<svg" not in a4 and "Comes with" not in a4
    assert a4.index("IMEI") < a4.index("Cost") < a4.index("Notes")

    # Urdu: right to left, Urdu words, numbers kept as they are
    ur = owner.get(url, params={"format": "a4", "lang": "ur"}).text
    assert 'dir="rtl"' in ur and "موبائل کی تفصیل" in ur and "کنڈیشن" in ur and IMEI in ur

    # a salesman never gets the cost or the seller, whatever he asks for
    owner.post(
        "/api/v1/staff",
        json={"name": "Ali", "phone": "03211234567", "password": "secret123", "role": "salesman"},
    )
    ali = login(client, "03211234567")
    assert "cost" not in ali.get("/api/v1/devices/sheet-options").json()["fields"]
    got = ali.get(
        url, params={"format": "thermal", "lang": "en", "fields": "price,cost,seller,imei"}
    ).text
    assert "Rs. 150,000" in got and "100,000" not in got and "Bought from" not in got

    # nothing is written by a preview: no event, the phone as it was
    hist = owner.get(f"/api/v1/devices/{d['id']}/history").json()
    assert [h["type"] for h in hist] == ["purchased"]
    # another shop cannot see it; a wrong format is refused
    assert other_owner.get(url).status_code == 404
    assert owner.get(url, params={"format": "letter"}).status_code == 422
