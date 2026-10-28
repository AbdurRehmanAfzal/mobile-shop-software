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
