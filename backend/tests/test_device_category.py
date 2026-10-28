"""Owner (2026-10-28): tablets and smart watches are bought and sold one by one, like phones; a
Wi-Fi tablet or a watch may have only a serial number."""

from app.modules.catalogue.models import Brand, Model


def _model(db, brand, name):
    b = db.query(Brand).filter_by(name=brand, shop_id=None).one()
    return b, db.query(Model).filter_by(brand_id=b.id, name=name).one()


def test_catalogue_by_category(owner, cat):
    tabs = owner.get("/api/v1/catalogue/brands", params={"category": "tablet"}).json()
    names = {b["name"] for b in tabs}
    assert {"Apple", "Samsung", "Lenovo"} <= names and "Nokia" not in names
    apple = next(b for b in tabs if b["name"] == "Apple")
    models = owner.get(
        "/api/v1/catalogue/models", params={"brand_id": apple["id"], "category": "watch"}
    ).json()
    assert {m["name"] for m in models} >= {"Watch Series 9", "Watch Ultra 2"}
    assert all(m["category"] == "watch" for m in models)


def test_watch_with_serial_and_tablet_with_imei(owner, db, cat):
    b, m = _model(db, "Apple", "Watch Series 9")
    r = owner.post(
        "/api/v1/devices/opening-stock",
        json={
            "category": "watch",
            "serial": "h4kq-9x2lm1",
            "brand_id": str(b.id),
            "model_id": str(m.id),
            "condition": "used",
            "cost_price": 60000,
            "asking_price": 70000,
        },
    )
    assert r.status_code == 201, r.text
    w = r.json()
    assert w["category"] == "watch" and w["serial"] == "H4KQ9X2LM1" and w["imei1"] == "H4KQ9X2LM1"
    # found by its serial, like an IMEI
    assert owner.get("/api/v1/devices", params={"q": "H4KQ9X2"}).json()[0]["id"] == w["id"]
    assert [d["id"] for d in owner.get("/api/v1/devices", params={"category": "watch"}).json()] == [
        w["id"]
    ]
    # a used watch from a customer still needs the ID check, like a phone
    assert w["verification_status"] == "pending"

    b, m = _model(db, "Samsung", "Galaxy Tab A9+")
    t = owner.post(
        "/api/v1/devices/opening-stock",
        json={
            "category": "tablet",
            "imei1": "356938035643809",
            "brand_id": str(b.id),
            "model_id": str(m.id),
            "condition": "box_pack",
            "pta_status": "pta_approved",
            "cost_price": 50000,
        },
    )
    assert t.status_code == 201, t.text and t.json()["category"] == "tablet"

    # a phone still needs its IMEI; a watch needs IMEI or serial
    bad = {"brand_id": str(b.id), "model_id": str(m.id), "condition": "used", "cost_price": 1}
    assert (
        owner.post("/api/v1/devices/opening-stock", json={**bad, "serial": "ABCD1234"}).status_code
        == 422
    )
    assert (
        owner.post("/api/v1/devices/opening-stock", json={**bad, "category": "watch"}).status_code
        == 422
    )


def test_each_kind_has_its_own_details(owner, db, cat):
    """Owner (2026-10-28): a watch has no storage, IMEI 2, PTA or JV unless it takes a SIM; a Wi-Fi
    tablet has no PTA; tablets and watches carry battery health, a watch its case size."""
    storage = cat["storage"]["id"]
    b, m = _model(db, "Apple", "Watch Series 9")
    w = owner.post(
        "/api/v1/devices/opening-stock",
        json={
            "category": "watch",
            "cellular": False,
            "serial": "WATCH0001",
            "imei2": "490154203237518",
            "brand_id": str(b.id),
            "model_id": str(m.id),
            "storage_id": storage,
            "size_mm": 45,
            "battery_health": 91,
            "condition": "used",
            "pta_status": "jv",
            "sim_time_months": 2,
            "cost_price": 60000,
        },
    ).json()
    assert w["cellular"] is False and w["size_mm"] == 45 and w["battery_health"] == 91
    assert w["storage_id"] is None and w["imei2"] is None
    assert w["pta_status"] == "unknown" and w["sim_time_months"] is None

    # a cellular watch has an IMEI and a PTA status
    base = {"category": "watch", "cellular": True, "brand_id": str(b.id), "model_id": str(m.id)}
    no_imei = {**base, "serial": "WATCH0002", "condition": "used", "cost_price": 1}
    assert owner.post("/api/v1/devices/opening-stock", json=no_imei).status_code == 422
    cw = owner.post(
        "/api/v1/devices/opening-stock",
        json={**base, "imei1": "356938035643809", "pta_status": "pta_approved", "cost_price": 1},
    ).json()
    assert cw["cellular"] is True and cw["pta_status"] == "pta_approved"

    # patched is a phone thing
    patched = {**no_imei, "cellular": False, "condition": "patched", "patch_details": "x"}
    assert owner.post("/api/v1/devices/opening-stock", json=patched).status_code == 422

    # a Wi-Fi tablet: storage kept, no PTA, no case size
    b, m = _model(db, "Samsung", "Galaxy Tab A9+")
    t = owner.post(
        "/api/v1/devices/opening-stock",
        json={
            "category": "tablet",
            "cellular": False,
            "serial": "TAB12345",
            "brand_id": str(b.id),
            "model_id": str(m.id),
            "storage_id": storage,
            "size_mm": 44,
            "battery_health": 88,
            "condition": "open_box",
            "pta_status": "non_pta",
            "sim_time_months": 2,
            "cost_price": 40000,
            "accessories": [{"kind": "stylus"}, {"kind": "keyboard"}],
        },
    ).json()
    assert t["storage_id"] == storage and t["size_mm"] is None and t["battery_health"] == 88
    assert t["pta_status"] == "unknown" and t["cellular"] is False
    kinds = {a["kind"] for a in owner.get(f"/api/v1/devices/{t['id']}").json()["accessories"]}
    assert kinds == {"stylus", "keyboard"}
