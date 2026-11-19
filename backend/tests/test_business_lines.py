"""Owner 2026-11-19 (ADR-109): what a shop trades is set by the provider with the existing module
ticks — mobiles (always, unless "without mobiles"), laptops, accessories. An accessories-only or
laptop-only shop adds no phone; every existing shop keeps its mobile side untouched."""

from app.modules.admin.modules import MODULES, OPT_IN, PLAN_DEFAULTS
from tests.conftest import login, signup
from tests.test_purchases import _party

SUPER = "03990000099"
IMEI = "490154203237518"


def _admin(client, monkeypatch):
    monkeypatch.setattr("app.core.config.settings.superuser_phones", SUPER, raising=False)
    signup(client, shop_name="OOP Admin", owner_name="Product Owner", phone=SUPER)
    return login(client, SUPER)


def _set(admin, owner, mods):
    return admin.patch(f"/api/v1/admin/shops/{owner.shop_id}/modules", json={"modules": mods})


def _phone(cat, imei=IMEI, **extra):
    return {
        "imei1": imei,
        "brand_id": cat["brand"]["id"],
        "model_id": cat["model"]["id"],
        "condition": "box_pack",
        "pta_status": "pta_approved",
        "cost_price": 10000,
        "asking_price": 11000,
        **extra,
    }


def test_no_plan_ever_switches_mobiles_off():
    assert "no_mobiles" in MODULES and "no_mobiles" in OPT_IN
    for plan, keys in PLAN_DEFAULTS.items():
        assert "no_mobiles" not in keys, plan


def test_an_existing_shop_keeps_its_mobile_side(client, owner, cat, monkeypatch):
    admin = _admin(client, monkeypatch)
    assert "no_mobiles" not in owner.get("/api/v1/me").json()["plan"]["modules"]
    assert owner.post("/api/v1/devices/opening-stock", json=_phone(cat)).status_code == 201
    # … on every plan, and with a hand-picked list that says nothing about mobiles
    for plan in ("basic", "pro", "chain"):
        admin.patch(f"/api/v1/admin/shops/{owner.shop_id}/plan", json={"plan": plan})
        assert "no_mobiles" not in owner.get("/api/v1/me").json()["plan"]["modules"]
    _set(admin, owner, ["accessories", "repairs"])
    r = owner.post("/api/v1/devices/opening-stock", json=_phone(cat, imei="356938035643809"))
    assert r.status_code == 201, r.text


def test_accessories_only_shop(client, owner, cat, monkeypatch):
    admin = _admin(client, monkeypatch)
    # a phone bought while the shop still traded mobiles
    old = owner.post("/api/v1/devices/opening-stock", json=_phone(cat)).json()

    # without mobiles a shop must trade something
    r = _set(admin, owner, ["expenses", "no_mobiles"])
    assert r.status_code == 422 and r.json()["error"]["code"] == "no_business_line"
    r = _set(admin, owner, ["accessories", "expenses", "reports", "no_mobiles"])
    assert r.status_code == 200 and "no_mobiles" in r.json()["modules"], r.text
    assert "no_mobiles" in owner.get("/api/v1/me").json()["plan"]["modules"]

    # no phone, tablet or watch can be added — by old stock or on a purchase bill
    r = owner.post("/api/v1/devices/opening-stock", json=_phone(cat, imei="356938035643809"))
    assert r.status_code == 403 and r.json()["error"]["code"] == "module_off"
    assert r.json()["error"]["details"]["module"] == "mobiles"
    dealer = _party(owner, name="Accessory Dealer", phone="03005550031", kinds=("supplier",))
    dev = {k: v for k, v in _phone(cat, imei="356938035643809").items() if "price" not in k}
    r = owner.post(
        "/api/v1/purchases",
        json={
            "kind": "supplier",
            "party_id": dealer["id"],
            "devices": [{"device": dev, "cost": 10000}],
        },
    )
    assert r.status_code == 403 and r.json()["error"]["code"] == "module_off"
    assert owner.get("/api/v1/devices", params={"q": "356938035643809"}).json() == []

    # accessories: created, bought by the carton from the dealer, sold by the piece — the books
    # move exactly as in a mobile shop
    item = owner.post(
        "/api/v1/accessories",
        json={"name": "Type-C cable 1m", "category": "cable", "price": 500, "wholesale_price": 380},
    )
    assert item.status_code == 201, item.text
    item = item.json()
    assert item["qty"] == 0  # creating a product never adds stock
    pur = owner.post(
        "/api/v1/purchases",
        json={
            "kind": "supplier",
            "party_id": dealer["id"],
            "misc": [
                {
                    "description": item["name"],
                    "qty": 120,
                    "unit_cost": 250,
                    "accessory_id": item["id"],
                }
            ],
            "paid": 10000,
        },
    )
    assert pur.status_code == 201, pur.text
    assert owner.get(f"/api/v1/accessories/{item['id']}").json()["qty"] == 120
    assert float(owner.get(f"/api/v1/parties/{dealer['id']}").json()["balance"]) == -20000
    sale = owner.post(
        "/api/v1/sales",
        json={
            "misc": [
                {
                    "description": item["name"],
                    "qty": 5,
                    "unit_price": 500,
                    "accessory_id": item["id"],
                }
            ],
            "paid": 2500,
        },
    )
    assert sale.status_code == 201, sale.text
    assert float(sale.json()["profit"]) == 1250  # 5 x (500 - 250)
    assert owner.get(f"/api/v1/accessories/{item['id']}").json()["qty"] == 115

    # the old phone is still there and can be sold: nothing is hidden on the server or deleted
    assert owner.get(f"/api/v1/devices/{old['id']}").json()["status"] == "in_stock"
    r = owner.post(
        "/api/v1/sales", json={"devices": [{"device_id": old["id"], "price": 11000}], "paid": 11000}
    )
    assert r.status_code == 201, r.text

    # back to a mobile shop: phones can be added again
    assert _set(admin, owner, None).status_code == 200
    r = owner.post("/api/v1/devices/opening-stock", json=_phone(cat, imei="356938035643809"))
    assert r.status_code == 201, r.text


def test_laptop_only_shop(client, owner, cat, monkeypatch):
    admin = _admin(client, monkeypatch)
    assert _set(admin, owner, ["laptops", "expenses", "no_mobiles"]).status_code == 200
    r = owner.post("/api/v1/devices/opening-stock", json=_phone(cat))
    assert r.status_code == 403 and r.json()["error"]["details"]["module"] == "mobiles"
    brands = owner.get("/api/v1/catalogue/brands", params={"category": "laptop"}).json()
    dell = next(b for b in brands if b["name"] == "Dell")
    model = owner.get(
        "/api/v1/catalogue/models",
        params={"brand_id": dell["id"], "q": "Latitude 5490", "category": "laptop"},
    ).json()[0]
    r = owner.post(
        "/api/v1/devices/opening-stock",
        json={
            "category": "laptop",
            "serial": "5CG8123ABC",
            "brand_id": dell["id"],
            "model_id": model["id"],
            "condition": "used",
            "cost_price": 60000,
            "asking_price": 68000,
        },
    )
    assert r.status_code == 201, r.text


def test_a_package_order_keeps_what_the_provider_switched(client, owner, monkeypatch):
    """The shop pays for another package on the fees page: "without mobiles" and laptops are not
    part of any package, so the order must not take them away (the shop would turn into a
    mobile shop by paying its fee)."""
    admin = _admin(client, monkeypatch)
    admin.patch(
        f"/api/v1/admin/shops/{owner.shop_id}/plan", json={"plan": "basic", "monthly_fee": 2000}
    )
    _set(admin, owner, ["accessories", "expenses", "laptops", "no_mobiles"])

    def pay(order, amount):
        owner.post("/api/v1/fees", json={"amount": amount, "method": "Cash", "order": order})
        pend = admin.get("/api/v1/admin/fee-payments", params={"status": "pending"}).json()
        ok = admin.post(f"/api/v1/admin/fee-payments/{pend[0]['id']}/approve", json={})
        assert ok.status_code == 200, ok.text
        return owner.get("/api/v1/fees").json()["plan"]

    # another package as it comes: its modules, plus what the provider switched by hand
    pro = pay({"plan": "pro", "modules": [], "addons": [], "months": 1}, 5000)
    assert pro["plan"] == "pro"
    assert {"no_mobiles", "laptops"} <= set(pro["modules"])
    assert set(PLAN_DEFAULTS["pro"]) <= set(pro["modules"])
    # a module added on top: the same
    more = pay({"plan": "pro", "modules": ["loans"], "addons": [], "months": 1}, 5500)
    assert {"no_mobiles", "laptops", "loans", "repairs"} <= set(more["modules"])
