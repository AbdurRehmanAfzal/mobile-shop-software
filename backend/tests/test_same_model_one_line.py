"""A mobile shop 2026-11-21 (ADR-125): "iPhone 18 pro max" showed on two lines of the stock
summary — 5 phones and 1 — because the shop had two records of that model. A model is its brand
and its name, whatever the capitals and spaces: counted on one line, opened as one list, offered
once when adding a phone, and not made a second time. No record is rewritten."""

import uuid

from app.modules.catalogue.models import Model
from tests.test_devices import _stock

IMEIS = ["490154203237518", "356938035643809", "352099001761481", "358240051111110"]


def _two_records(db, owner, cat):
    """the same model saved twice, as it happened: other capitals, an extra space"""
    a = Model(
        shop_id=uuid.UUID(str(owner.shop_id)),
        brand_id=uuid.UUID(cat["brand"]["id"]),
        name="Lumia 18 pro max",
    )
    b = Model(
        shop_id=uuid.UUID(str(owner.shop_id)),
        brand_id=uuid.UUID(cat["brand"]["id"]),
        name="Lumia 18  Pro Max ",
    )
    db.add_all([a, b])
    db.commit()
    return str(a.id), str(b.id)


def test_one_model_one_line(db, owner, cat):
    a, b = _two_records(db, owner, cat)
    for imei in IMEIS[:3]:
        _stock(owner, cat, imei=imei, model_id=a, cost_price=1000, asking_price=1500)
    _stock(owner, cat, imei=IMEIS[3], model_id=b, cost_price=2000, asking_price=2500)

    # the stock summary: one line, four phones, their value together
    s = owner.get("/api/v1/reports/stock-summary").json()
    models = [m for br in s["brands"] for m in br["models"] if "18" in m["name"]]
    assert len(models) == 1 and models[0]["count"] == 4 and float(models[0]["value"]) == 5000
    assert s["count"] == 4

    # opened from either record: the same four phones
    for mid in (a, b):
        rows = owner.get(f"/api/v1/devices?model_id={mid}").json()
        assert len(rows) == 4, mid
    # another model is not swept in
    assert len(owner.get(f"/api/v1/devices?model_id={cat['model']['id']}").json()) == 0

    # adding a phone: the model is offered once, and cannot be made a third time
    offered = owner.get(f"/api/v1/catalogue/models?brand_id={cat['brand']['id']}&q=18").json()
    assert len([m for m in offered if "18" in m["name"]]) == 1
    again = owner.post(
        "/api/v1/catalogue/models",
        json={"brand_id": cat["brand"]["id"], "name": "  lumia  18 PRO max"},
    )
    assert again.status_code == 409 and again.json()["error"]["code"] == "model_exists"
    # a really new model is saved with tidy spacing
    new = owner.post(
        "/api/v1/catalogue/models",
        json={"brand_id": cat["brand"]["id"], "name": "Lumia  19   Ultra "},
    )
    assert new.status_code == 201 and new.json()["name"] == "Lumia 19 Ultra"

    # nothing was rewritten: each phone still points at the record it was added with
    assert {d["model_id"] for d in owner.get(f"/api/v1/devices?model_id={a}").json()} == {a, b}


def test_sold_phones_of_one_model_are_one_line_in_the_audit(db, owner, cat):
    a, b = _two_records(db, owner, cat)
    d1 = _stock(
        owner,
        cat,
        imei=IMEIS[0],
        model_id=a,
        condition="box_pack",
        cost_price=1000,
        asking_price=1500,
    )
    d2 = _stock(
        owner,
        cat,
        imei=IMEIS[1],
        model_id=b,
        condition="box_pack",
        cost_price=1000,
        asking_price=1500,
    )
    _stock(
        owner,
        cat,
        imei=IMEIS[2],
        model_id=b,
        condition="box_pack",
        cost_price=1000,
        asking_price=1500,
    )
    for d in (d1, d2):
        r = owner.post(
            "/api/v1/sales", json={"devices": [{"device_id": d["id"], "price": 1500}], "paid": 1500}
        )
        assert r.status_code == 201, r.text
    rows = owner.get("/api/v1/shop-audit/products?group=model").json()["rows"]
    mine = [r for r in rows if "18" in (r.get("model") or "")]
    assert len(mine) == 1 and mine[0]["units"] == 2 and mine[0]["in_stock"] == 1
