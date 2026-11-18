"""Owner 2026-11-18 (ADR-108): laptops, new and used, as a fourth device type behind the `laptops`
module — bought, stocked, sold and returned through the same documents as phones; known by the
serial number; brands and models (gaming too) built in; shops without the module see nothing new."""

from app.modules.admin.modules import MODULES, OPT_IN
from app.seeds.laptops import LAPTOP_BRANDS, laptop_models
from tests.conftest import login, signup
from tests.test_purchases import _party

SUPER = "03990000099"


def _laptops_on(client, owner, monkeypatch):
    monkeypatch.setattr("app.core.config.settings.superuser_phones", SUPER, raising=False)
    signup(client, shop_name="OOP Admin", owner_name="Product Owner", phone=SUPER)
    admin = login(client, SUPER)
    plan = owner.get("/api/v1/me").json()["plan"]["modules"]
    r = admin.patch(
        f"/api/v1/admin/shops/{owner.shop_id}/modules", json={"modules": [*plan, "laptops"]}
    )
    assert r.status_code == 200 and "laptops" in r.json()["modules"], r.text
    return admin


def _refs(owner, brand="Dell", q="Latitude 5490"):
    brands = owner.get("/api/v1/catalogue/brands", params={"category": "laptop"}).json()
    b = next(x for x in brands if x["name"] == brand)
    m = owner.get(
        "/api/v1/catalogue/models", params={"brand_id": b["id"], "q": q, "category": "laptop"}
    ).json()[0]
    st = next(s for s in owner.get("/api/v1/catalogue/storages").json() if s["name"] == "256GB")
    return b, m, st


def _laptop(b, m, st, **extra):
    return {
        "category": "laptop",
        "serial": "5CG8123ABC",
        "brand_id": b["id"],
        "model_id": m["id"],
        "storage_id": st["id"],
        "ram_gb": 8,
        "condition": "used",
        "specs": {
            "cpu": "Core i5",
            "cpu_gen": "8th Gen",
            "storage_type": "SSD",
            "display_in": 14,
            "gpu": "Intel UHD 620",
            "backlit": True,
            "nonsense": "dropped",
        },
        **extra,
    }


def test_the_built_in_list():
    models = laptop_models()
    assert len(models) > 1000 and sum(1 for _, _, g in models if g) > 200
    names = {(b, m) for b, m, _ in models}
    for known in (
        ("Dell", "Latitude 5490"),
        ("HP", "EliteBook 840 G5"),
        ("Lenovo", "ThinkPad T480"),
        ("Lenovo", "ThinkPad X1 Carbon Gen 6"),
        ("Apple", "MacBook Air 13 (M1, 2020)"),
        ("Asus", "ROG Strix G15"),
        ("Acer", "Nitro 5"),
        ("MSI", "Katana GF66"),
        ("Dell", "Alienware m15 R6"),
        ("HP", "Victus 15"),
        ("Lenovo", "Legion 5"),
        ("Razer", "Blade 15"),
    ):
        assert known in names, known
    assert len(names) == len(models)  # nothing twice
    assert all(len(m) <= 150 for _, m, _ in models)
    assert {"Dell", "HP", "Asus", "Acer", "MSI"} <= {b for b, _, _ in LAPTOP_BRANDS}
    assert "laptops" in MODULES and "laptops" in OPT_IN  # never in a plan: switched on by hand


def test_a_shop_without_the_module_sees_nothing_new(owner, cat):
    assert "laptops" not in owner.get("/api/v1/me").json()["plan"]["modules"]
    everything = {b["name"] for b in owner.get("/api/v1/catalogue/brands").json()}
    phones = {
        b["name"]
        for b in owner.get("/api/v1/catalogue/brands", params={"category": "phone"}).json()
    }
    for name in ("Dell", "HP", "Asus", "MSI"):
        assert name not in everything and name not in phones
    assert {"Apple", "Samsung", "Nokia", "Lenovo"} <= phones  # the phone list as it was
    models = owner.get("/api/v1/catalogue/models", params={"q": "MacBook"}).json()
    assert models == []
    assert [
        m["name"] for m in owner.get("/api/v1/catalogue/models", params={"q": "iPhone 15"}).json()
    ]
    # a laptop cannot be added
    b, m, st = _refs(owner)
    r = owner.post(
        "/api/v1/devices/opening-stock",
        json={**_laptop(b, m, st), "cost_price": 60000, "asking_price": 68000},
    )
    assert r.status_code == 403 and r.json()["error"]["code"] == "module_off", r.text
    assert r.json()["error"]["details"]["module"] == "laptops"
    types = owner.get("/api/v1/reports/stock-by-type").json()["types"]
    assert [t["category"] for t in types] == ["phone", "tablet", "watch"]


def test_laptop_bought_stocked_sold_like_a_phone(client, owner, cat, monkeypatch):
    _laptops_on(client, owner, monkeypatch)
    # the catalogue: laptop brands and models, gaming ones marked; the phone list still has no Dell
    brands = {
        b["name"]
        for b in owner.get("/api/v1/catalogue/brands", params={"category": "laptop"}).json()
    }
    assert {"Dell", "HP", "Lenovo", "Apple", "Asus", "Acer", "MSI", "Razer"} <= brands
    assert "Nokia" not in brands
    phones = {
        b["name"]
        for b in owner.get("/api/v1/catalogue/brands", params={"category": "phone"}).json()
    }
    assert "Dell" not in phones and "Apple" in phones
    assert "Dell" in {b["name"] for b in owner.get("/api/v1/catalogue/brands").json()}
    b, m, st = _refs(owner)
    assert m["name"] == "Latitude 5490" and m["category"] == "laptop"
    _, rog, _ = _refs(owner, "Asus", "ROG Strix G15")
    assert (
        owner.get(f"/api/v1/devices/model-specs/{rog['id']}").json()["specs"].get("gaming") is True
    )
    assert not owner.get(f"/api/v1/devices/model-specs/{m['id']}").json()["specs"].get("gaming")

    # old stock: known by its serial number; nothing of a phone's SIM side is kept
    r = owner.post(
        "/api/v1/devices/opening-stock",
        json={
            **_laptop(b, m, st, imei2="356938035643809", pta_status="non_pta", sim_time_months=3),
            "cost_price": 60000,
            "asking_price": 68000,
        },
    )
    assert r.status_code == 201, r.text
    d = r.json()
    assert d["category"] == "laptop" and d["imei1"] == "5CG8123ABC" and d["serial"] == "5CG8123ABC"
    assert d["imei2"] is None and d["pta_status"] == "unknown" and d["sim_time_months"] is None
    assert d["ram_gb"] == 8 and d["storage_name"] == "256GB"
    assert d["specs"] == {
        "cpu": "Core i5",
        "cpu_gen": "8th Gen",
        "storage_type": "SSD",
        "display_in": 14,
        "gpu": "Intel UHD 620",
        "backlit": True,
    }
    assert d["barcode"]  # the shop's own code, as every unit gets
    # the same serial twice is refused; one whose sticker is gone gets the shop's code
    again = owner.post(
        "/api/v1/devices/opening-stock",
        json={**_laptop(b, m, st), "cost_price": 1, "asking_price": 2},
    )
    assert again.status_code == 409 and again.json()["error"]["code"] == "imei_exists"
    r = owner.post(
        "/api/v1/devices/opening-stock",
        json={**_laptop(b, m, st, serial=None), "cost_price": 30000, "asking_price": 35000},
    )
    assert r.status_code == 201 and r.json()["imei1"].startswith("LAP"), r.text
    # the model remembers what was typed: the next Latitude 5490 fills itself
    sheet = owner.get(f"/api/v1/devices/model-specs/{m['id']}").json()
    assert sheet["specs"]["cpu"] == "Core i5" and sheet["ram_gb"] == 8

    # bought from a dealer on a purchase bill, with a phone on the same bill
    dealer = _party(owner, name="Laptop Dealer", phone="03005550011", kinds=("supplier",))
    pur = owner.post(
        "/api/v1/purchases",
        json={
            "kind": "supplier",
            "party_id": dealer["id"],
            "paid": 100000,
            "method": "cash",
            "devices": [
                {
                    "device": _laptop(b, m, st, serial="HXYZ123", condition="box_pack", ram_gb=16),
                    "cost": 90000,
                    "asking_price": 99000,
                },
                {
                    "device": {
                        "imei1": "490154203237518",
                        "brand_id": cat["brand"]["id"],
                        "model_id": cat["model"]["id"],
                        "condition": "box_pack",
                        "pta_status": "pta_approved",
                    },
                    "cost": 10000,
                    "asking_price": 11000,
                },
            ],
        },
    )
    assert pur.status_code == 201, pur.text
    new_id = pur.json()["lines"][0]["device_id"]
    assert owner.get(f"/api/v1/devices/{new_id}").json()["category"] == "laptop"

    # stock: the laptop filter, search by serial, stock by type
    lap = owner.get("/api/v1/devices", params={"category": "laptop", "status": "in_stock"}).json()
    assert len(lap) == 3 and all(x["category"] == "laptop" for x in lap)
    assert [x["id"] for x in owner.get("/api/v1/devices", params={"q": "HXYZ123"}).json()] == [
        new_id
    ]
    types = {t["category"]: t for t in owner.get("/api/v1/reports/stock-by-type").json()["types"]}
    assert types["laptop"]["count"] == 3 and float(types["laptop"]["cost"]) == 180000
    assert types["phone"]["count"] == 1

    # sold to a customer: the bill and the sticker carry the line shopkeepers quote
    buyer = _party(owner, name="Laptop Buyer", phone="03005550022", kinds=("customer",))
    sale = owner.post(
        "/api/v1/sales",
        json={
            "party_id": buyer["id"],
            "devices": [{"device_id": d["id"], "price": 67000}],
            "paid": 67000,
        },
    )
    assert sale.status_code == 201, sale.text
    inv = sale.json()
    assert float(inv["profit"]) == 7000
    line = "Core i5 8th Gen · 8GB · 256GB SSD · 14&quot; · Intel UHD 620"
    receipt = owner.get(f"/api/v1/sales/{inv['id']}/receipt", params={"lang": "en"}).text
    assert "Laptop" in receipt and line in receipt and "5CG8123ABC" in receipt
    assert "PTA" not in receipt.split("Latitude 5490")[1][:400]
    label = owner.get(f"/api/v1/labels/devices?ids={new_id}&fv=2&lang=en").text
    assert "Core i5 8th Gen · 16GB · 256GB SSD" in label and "HXYZ123" in label
    assert owner.get(f"/api/v1/devices/{d['id']}").json()["status"] == "sold"
    hist = [h["type"] for h in owner.get(f"/api/v1/devices/{d['id']}/history").json()]
    assert hist[0] == "purchased" and "sold" in hist

    # a laptop is never turned into a phone, and nothing becomes a laptop
    r = owner.post(
        "/api/v1/devices/reclassify/preview",
        json={"device_ids": [new_id], "to_category": "phone"},
    )
    assert r.status_code == 422 and r.json()["error"]["code"] == "bad_category"
    assert (
        owner.post(
            "/api/v1/devices/reclassify/preview",
            json={"device_ids": [new_id], "to_category": "laptop"},
        ).status_code
        == 422
    )

    # the module switched off again: the laptops stay in stock and can be sold; none can be added
    admin = login(client, SUPER)
    admin.patch(f"/api/v1/admin/shops/{owner.shop_id}/modules", json={"modules": None})
    assert owner.get(f"/api/v1/devices/{new_id}").status_code == 200
    r = owner.post(
        "/api/v1/sales",
        json={
            "party_id": buyer["id"],
            "devices": [{"device_id": new_id, "price": 99000}],
            "paid": 99000,
        },
    )
    assert r.status_code == 201, r.text
