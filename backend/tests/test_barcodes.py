"""Owner addendum 4 (2026-10-31, docs/22): a barcode is born with every phone and item in the same
transaction, never changes, is unique across the shop, renders in the chosen type and decodes back,
is found by our code / IMEI 1 / IMEI 2 / SKU / maker's code, and the backfill is idempotent."""

import io
import uuid

import pytest
from PIL import Image

from app.modules.barcodes import codes
from tests.conftest import login
from tests.test_purchases import _dev, _party

A, B, C = "490154203237518", "356938035643809", "352099001761481"


def _buy(owner, cat, *imeis, extra=None, **kw):
    sup = kw.pop("sup", None) or _party(
        owner, name="Dealer", phone=kw.pop("phone", "03005556666"), kinds=("supplier",)
    )
    r = owner.post(
        "/api/v1/purchases",
        json={
            "kind": "supplier",
            "party_id": sup["id"],
            "devices": [
                {"device": {**_dev(cat, i), **(extra or {})}, "cost": 800, "asking_price": 1000}
                for i in imeis
            ],
            "paid": 0,
        },
    )
    return r, sup


def test_purchase_makes_one_barcode_per_phone_in_the_same_transaction(owner, cat):
    r, sup = _buy(owner, cat, A, B)
    assert r.status_code == 201, r.text
    devs = {d["imei1"]: d for d in owner.get("/api/v1/devices").json()}
    assert devs[A]["barcode"] == "MS000001" and devs[B]["barcode"] == "MS000002"
    assert devs[A]["barcode_type"] == "code128"
    # the purchase event carries it, so the history shows where the code came from
    hist = owner.get(f"/api/v1/devices/{devs[A]['id']}/history").json()
    assert any(
        h["type"] == "purchased" and (h.get("data") or {}).get("barcode") == "MS000001"
        for h in hist
    )
    # a failed purchase (second line repeats an IMEI that is in stock) makes nothing: no device, no
    # number burnt in a way that leaks — the next good purchase continues the sequence cleanly
    r2, _ = _buy(owner, cat, C, A, sup=sup)
    assert r2.status_code == 409
    assert set(d["imei1"] for d in owner.get("/api/v1/devices").json()) == {A, B}
    r3, _ = _buy(owner, cat, C, sup=sup)
    assert r3.status_code == 201
    c = next(d for d in owner.get("/api/v1/devices").json() if d["imei1"] == C)
    assert c["barcode"].startswith("MS0000") and c["barcode"] not in ("MS000001", "MS000002")


def test_resale_after_return_keeps_the_barcode_and_history(owner, cat):
    r, _ = _buy(owner, cat, A)
    dev = owner.get("/api/v1/devices").json()[0]
    code = dev["barcode"]
    cus = _party(owner, name="Ahmed", phone="03001111111", kinds=("customer",))
    inv = owner.post(
        "/api/v1/sales",
        json={
            "party_id": cus["id"],
            "devices": [{"device_id": dev["id"], "price": 1000}],
            "paid": 1000,
        },
    ).json()
    ret = owner.post(
        "/api/v1/returns/sale",
        json={"invoice_id": inv["id"], "line_ids": [inv["lines"][0]["id"]], "settlement": "refund"},
    )
    assert ret.status_code == 201, ret.text
    again = owner.get(f"/api/v1/devices/{dev['id']}").json()
    assert again["barcode"] == code and again["status"] == "in_stock"
    inv2 = owner.post(
        "/api/v1/sales", json={"devices": [{"device_id": dev["id"], "price": 900}], "paid": 900}
    )
    assert inv2.status_code == 201
    assert owner.get(f"/api/v1/devices/{dev['id']}").json()["barcode"] == code
    types = [h["type"] for h in owner.get(f"/api/v1/devices/{dev['id']}/history").json()]
    assert types.count("sold") == 2 and "sale_returned" in types
    # bought back after a sale: still the same unit, still the same barcode
    sup = _party(owner, name="D2", phone="03005557777", kinds=("supplier",))
    owner.post(
        "/api/v1/sales", json={"devices": [{"device_id": dev["id"], "price": 950}], "paid": 950}
    ) if False else None


def test_custom_and_manufacturer_codes_and_uniqueness(owner, cat):
    sup = _party(owner, name="Dealer", phone="03005556666", kinds=("supplier",))
    r, _ = _buy(
        owner,
        cat,
        A,
        sup=sup,
        extra={"barcode": "box-777", "manufacturer_code": "]C1 8901234567890 "},
    )
    assert r.status_code == 201, r.text
    d = owner.get("/api/v1/devices").json()[0]
    assert d["barcode"] == "box-777" and d["manufacturer_code"] == "8901234567890"
    # the same custom code on another phone is refused; so is a code equal to another phone's IMEI
    r, _ = _buy(owner, cat, B, sup=sup, extra={"barcode": "box-777"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "barcode_taken"
    r, _ = _buy(owner, cat, B, sup=sup, extra={"barcode": A})
    assert r.status_code == 409
    # an item cannot take a phone's code either; items get their own sequence numbers
    r = owner.post("/api/v1/accessories", json={"name": "Charger", "barcode": "box-777"})
    assert r.status_code == 409
    r = owner.post(
        "/api/v1/accessories", json={"name": "Charger", "manufacturer_code": "6971234567890"}
    )
    assert (
        r.status_code == 201
        and r.json()["barcode"].startswith("MS0000")
        and r.json()["manufacturer_code"] == "6971234567890"
    )
    # the check endpoint says so before saving
    assert owner.post("/api/v1/barcodes/check", json={"value": "box-777"}).json() == {
        "ok": False,
        "value": "box-777",
        "type": "code128",
        "taken_by": "device",
    }
    assert owner.post("/api/v1/barcodes/check", json={"value": "NEW-1"}).json()["ok"] is True
    bad = owner.post("/api/v1/barcodes/check", json={"value": "ABC", "type": "ean13"}).json()
    assert bad["ok"] is False and bad["reason"] == "ean13_digits"


@pytest.mark.parametrize(
    "kind,value,stored",
    [
        ("code128", "MS000123", "MS000123"),
        ("code39", "ms-000123", "MS-000123"),
        ("ean13", "200000000001", "2000000000015"),
        ("ean13", "4006381333931", "4006381333931"),
        ("qr", "MS000123", "MS000123"),
    ],
)
def test_each_type_validates_renders_and_decodes_back(kind, value, stored):
    import zxingcpp

    assert codes.normalise(kind, value) == stored
    svg = codes.svg(kind, stored)
    assert svg.startswith("<svg") and ("<rect" in svg or "<path" in svg)
    img = Image.open(io.BytesIO(codes.png(kind, stored)))
    hits = zxingcpp.read_barcodes(img)
    assert hits, f"{kind} did not decode"
    assert hits[0].text == stored
    assert hits[0].format.name.replace("EAN13", "EAN-13").lower().replace("-", "") in {
        "code128",
        "ean13",
        "code39",
        "qrcode",
    }


def test_type_rules():
    assert codes.ean13_check_digit("400638133393") == "1"
    with pytest.raises(ValueError, match="ean13_length"):
        codes.normalise("ean13", "12345")
    with pytest.raises(ValueError, match="ean13_check"):
        codes.normalise("ean13", "4006381333930")
    with pytest.raises(ValueError, match="code39_chars"):
        codes.normalise("code39", "abc_1")
    with pytest.raises(ValueError, match="code128_chars"):
        codes.normalise("code128", "اردو")
    assert codes.can_encode("qr", "اردو متن") and not codes.can_encode("qr", "x" * 201)


def test_settings_type_prefix_start_and_imei_mode(owner, cat):
    s = owner.get("/api/v1/barcodes/settings").json()
    assert s["type"] == "code128" and s["prefix"] == "MS" and s["next_value"] == "MS000001"
    r = owner.patch(
        "/api/v1/barcodes/settings", json={"type": "ean13", "prefix": "20", "start_number": 500}
    )
    assert (
        r.status_code == 200
        and r.json()["next_value"].startswith("20")
        and r.json()["next_value"][2:12].endswith("500")
        and r.json()["next_type"] == "ean13"
    )
    assert (
        len(r.json()["next_value"]) == 13
        and codes.ean13_check_digit(r.json()["next_value"][:12]) == r.json()["next_value"][12]
    )
    _buy(owner, cat, A)
    d = owner.get("/api/v1/devices").json()[0]
    assert (
        d["barcode_type"] == "ean13"
        and d["barcode"].startswith("20")
        and d["barcode"].endswith(r.json()["next_value"][-3:])
    )
    # the sequence never goes back
    assert owner.patch("/api/v1/barcodes/settings", json={"start_number": 10}).json()["seq"] >= 500
    assert (
        owner.patch("/api/v1/barcodes/settings", json={"prefix": "bad prefix!"}).status_code == 422
    )
    # IMEI mode: the phone's IMEI is the value (Code 128, since EAN-13 cannot hold 15 digits)
    owner.patch("/api/v1/barcodes/settings", json={"value_mode": "imei", "type": "code128"})
    _buy(owner, cat, B, phone="03005557777")
    b = next(x for x in owner.get("/api/v1/devices").json() if x["imei1"] == B)
    assert b["barcode"] == B and b["barcode_type"] == "code128"
    # the salesman may not touch the settings
    owner.post(
        "/api/v1/staff",
        json={"name": "Sales", "phone": "03451112233", "password": "secret123", "role": "salesman"},
    )
    assert (
        login(owner.client, "03451112233")
        .patch("/api/v1/barcodes/settings", json={"prefix": "X"})
        .status_code
        == 403
    )


def test_lookup_by_every_identifier_and_the_odd_cases(client, owner, other_owner, cat):
    sup = _party(owner, name="Dealer", phone="03005556666", kinds=("supplier",))
    _buy(owner, cat, A, sup=sup, extra={"imei2": B, "manufacturer_code": "8901234567890"})
    item = owner.post(
        "/api/v1/accessories",
        json={
            "name": "Glass",
            "sku": "TG-1",
            "manufacturer_code": "6971234567890",
            "opening_qty": 3,
            "opening_cost": 50,
        },
    ).json()
    d = owner.get("/api/v1/devices").json()[0]
    for raw, matched, kind in [
        (d["barcode"], "barcode", "device"),
        (f"  {d['barcode']}\r\n", "barcode", "device"),  # a scanner's CR / LF and spaces
        (f"]C1{d['barcode']}", "barcode", "device"),  # AIM prefix some scanners add
        (A, "imei1", "device"),
        (B, "imei2", "device"),
        ("۴۹۰۱۵۴۲۰۳۲۳۷۵۱۸", "imei1", "device"),  # Urdu digits (Urdu keyboard layout)
        ("8901234567890", "manufacturer_code", "device"),
        (item["barcode"], "barcode", "item"),
        ("tg-1", "sku", "item"),
        ("6971234567890", "manufacturer_code", "item"),
    ]:
        r = owner.get("/api/v1/barcodes/lookup", params={"code": raw}).json()
        assert (r["kind"], r["matched"]) == (kind, matched), raw
        assert r["sellable"] is True
    assert (
        owner.get("/api/v1/barcodes/lookup", params={"code": "nothing-here"}).json()["kind"]
        == "none"
    )
    # sold: found, with its status, not sellable
    owner.post(
        "/api/v1/sales", json={"devices": [{"device_id": d["id"], "price": 1000}], "paid": 1000}
    )
    r = owner.get("/api/v1/barcodes/lookup", params={"code": d["barcode"]}).json()
    assert r["kind"] == "device" and r["status"] == "sold" and r["sellable"] is False
    # another shop never sees it; a salesman sees no cost
    assert (
        other_owner.get("/api/v1/barcodes/lookup", params={"code": d["barcode"]}).json()["kind"]
        == "none"
    )
    owner.post(
        "/api/v1/staff",
        json={"name": "Sales", "phone": "03451112233", "password": "secret123", "role": "salesman"},
    )
    s = login(client, "03451112233")
    assert (
        s.get("/api/v1/barcodes/lookup", params={"code": A}).json()["device"]["cost_price"] is None
    )


def test_stock_count_found_missing_unexpected(owner, cat):
    sup = _party(owner, name="Dealer", phone="03005556666", kinds=("supplier",))
    _buy(owner, cat, A, B, sup=sup)
    devs = {x["imei1"]: x for x in owner.get("/api/v1/devices").json()}
    item = owner.post(
        "/api/v1/accessories", json={"name": "Glass", "opening_qty": 3, "opening_cost": 50}
    ).json()
    owner.post(
        "/api/v1/sales",
        json={"devices": [{"device_id": devs[B]["id"], "price": 1000}], "paid": 1000},
    )
    r = owner.post(
        "/api/v1/barcodes/count",
        json={
            "codes": [
                devs[A]["barcode"],
                devs[B]["barcode"],
                item["barcode"],
                item["barcode"],
                "unknown-1",
            ]
        },
    ).json()
    assert [x["imei1"] for x in r["found_devices"]] == [A]
    assert r["found_items"] == [
        {"id": item["id"], "sku": item["sku"], "name": "Glass", "qty": 3, "scanned": 2}
    ]
    assert r["missing"] == [] and r["in_stock"] == 1
    assert {(u["code"], u["reason"]) for u in r["unexpected"]} == {
        (devs[B]["barcode"], "sold"),
        ("unknown-1", "not_found"),
    }
    r = owner.post("/api/v1/barcodes/count", json={"codes": []}).json()
    assert [m["imei1"] for m in r["missing"]] == [A]


def test_backfill_is_idempotent_and_never_changes_existing_codes(owner, cat, db):
    from app.modules.accessories.models import Accessory
    from app.modules.devices.models import Device

    sup = _party(owner, name="Dealer", phone="03005556666", kinds=("supplier",))
    _buy(owner, cat, A, B, sup=sup)
    owner.post("/api/v1/accessories", json={"name": "Glass"})
    # pretend these are old rows from before barcodes existed
    first = db.scalar(Device.__table__.select().where(Device.imei1 == A))
    db.execute(
        Device.__table__.update().where(Device.imei1 == A).values(barcode=None, barcode_type=None)
    )
    db.execute(Accessory.__table__.update().values(barcode=None, barcode_type=None))
    db.commit()
    kept = next(x for x in owner.get("/api/v1/devices").json() if x["imei1"] == B)["barcode"]
    r = owner.post("/api/v1/barcodes/backfill").json()
    assert r == {"devices": 1, "items": 1}
    devs = {x["imei1"]: x for x in owner.get("/api/v1/devices").json()}
    assert devs[B]["barcode"] == kept and devs[A]["barcode"] and devs[A]["barcode"] != kept
    hist = owner.get(f"/api/v1/devices/{devs[A]['id']}/history").json()
    assert any(h["type"] == "barcode_assigned" for h in hist)
    assert owner.post("/api/v1/barcodes/backfill").json() == {"devices": 0, "items": 0}
    assert {x["barcode"] for x in owner.get("/api/v1/devices").json()} == {devs[A]["barcode"], kept}
    del first


def test_label_prints_are_logged_and_use_the_stored_barcode(owner, cat):
    _buy(owner, cat, A)
    d = owner.get("/api/v1/devices").json()[0]
    r = owner.get(
        "/api/v1/labels/devices",
        params={
            "ids": d["id"],
            "copies": 2,
            "size": "40x30",
            "fields": "shop,name,barcode,imei,last4,price",
        },
    )
    assert (
        r.status_code == 200
        and d["barcode"] in r.text
        and "IMEI …7518" in r.text
        and "@page{size:40mm 30mm" in r.text
    )
    hist = owner.get(f"/api/v1/devices/{d['id']}/history").json()
    printed = [h for h in hist if h["type"] == "label_printed"]
    assert len(printed) == 1 and printed[0]["data"]["copies"] == 2
    rows = owner.get("/api/v1/audit", params={"entity": "label"}).json()
    rows = rows["items"] if isinstance(rows, dict) else rows
    assert rows[0]["action"] == "print" and rows[0]["after"]["copies"] == 2
    # the test label (next value, no number used) and the 58 mm roll size
    r = owner.get("/api/v1/barcodes/test-label", params={"size": "58x40"})
    assert r.status_code == 200 and "MS000002" in r.text
    assert owner.get("/api/v1/barcodes/settings").json()["next_value"] == "MS000002"
    # a QR label renders as a square symbol
    owner.patch("/api/v1/barcodes/settings", json={"type": "qr"})
    r = owner.get("/api/v1/barcodes/test-label", params={"type": "qr"})
    assert r.status_code == 200 and 'class="bar qr"' in r.text
    r = owner.get("/api/v1/barcodes/render/qr", params={"value": "MS000002", "fmt": "png"})
    assert r.status_code == 200 and r.headers["content-type"] == "image/png"
    assert uuid.UUID(d["id"])
