"""Owner (2026-10-30): price stickers with a barcode for phones and items; sizes, fields, copies,
the secret cost code and the shop's saved label preferences."""

from app.modules.labels.service import cost_code
from tests.conftest import login
from tests.test_devices import _stock

IMEI_A = "490154203237518"
IMEI_B = "356938035643809"


def test_cost_code():
    assert cost_code(45000, "BLACKHORSE") == "KHBBB"
    assert cost_code(None, "BLACKHORSE") == ""
    assert cost_code(1200, None) == "LABB"  # the default word


def test_device_and_item_labels(owner, client, cat):
    a = _stock(owner, cat, imei=IMEI_A, condition="box_pack", cost_price=40000, asking_price=45000)
    b = _stock(owner, cat, imei=IMEI_B, condition="used", cost_price=8000, asking_price=9500)

    # a roll label per phone, default fields; the barcode is Code 128 of the IMEI
    r = owner.get(f"/api/v1/labels/devices?ids={a['id']},{b['id']}&size=50x30&lang=en")
    assert r.status_code == 200, r.text
    page = r.text
    assert page.count('class="label"') == 2
    assert "@page{size:50mm 30mm" in page and "Rs. 45,000" in page and "Rs. 9,500" in page
    assert IMEI_A in page and "<svg" in page and "Box pack" in page and "Used" in page
    assert "KBBBB" not in page  # the cost code only when asked

    # copies, chosen fields, the cost code for the owner; A4 sheet
    r = owner.get(
        f"/api/v1/labels/devices?ids={a['id']}&size=a4&copies=3&fields=name,price,code,barcode&lang=en"
    )
    assert r.status_code == 200, r.text
    assert r.text.count('class="label"') == 3 and "KBBBB" in r.text and "size:A4" in r.text
    assert "Box pack" not in r.text and 'class="shop"' not in r.text

    # a salesman never gets the cost code, even when asking for it
    owner.post(
        "/api/v1/staff",
        json={"name": "Ali", "phone": "03211234567", "password": "secret123", "role": "salesman"},
    )
    ali = login(client, "03211234567")
    r = ali.get(f"/api/v1/labels/devices?ids={a['id']}&fields=name,price,code")
    assert r.status_code == 200 and "KBBBB" not in r.text and "Rs. 45,000" in r.text

    # custom size; bad sizes refused
    assert owner.get(f"/api/v1/labels/devices?ids={a['id']}&w=40&h=20").status_code == 200
    assert owner.get(f"/api/v1/labels/devices?ids={a['id']}&w=5&h=5").status_code == 422
    assert owner.get(f"/api/v1/labels/devices?ids={a['id']}&size=99x99").status_code == 422

    # the shop's own code word and label preferences are saved with the shop
    r = owner.patch(
        "/api/v1/shops/current",
        json={
            "label_code_word": "mobileshpk",
            "label_prefs": {"size": "38x25", "fields": ["name", "price", "barcode"]},
        },
    )
    assert r.status_code == 200, r.text
    assert (
        r.json()["label_code_word"] == "MOBILESHPK" and r.json()["label_prefs"]["size"] == "38x25"
    )
    assert (
        owner.patch("/api/v1/shops/current", json={"label_code_word": "AABBCCDDEE"}).status_code
        == 422
    )
    r = owner.get(f"/api/v1/labels/devices?ids={a['id']}&fields=code")
    assert cost_code(40000, "MOBILESHPK") in r.text

    # items: SKU barcode, several copies
    it = owner.post(
        "/api/v1/accessories",
        json={
            "name": "Charger 25W",
            "category": "charger",
            "price": 1500,
            "opening_qty": 10,
            "opening_cost": 900,
        },
    )
    assert it.status_code == 201, it.text
    r = owner.get(f"/api/v1/labels/items?ids={it.json()['id']}&copies=4&size=38x25")
    assert r.status_code == 200, r.text
    assert (
        r.text.count('class="label"') == 4
        and "Charger 25W" in r.text
        and it.json()["sku"] in r.text
    )
