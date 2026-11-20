"""Accessories shops 2026-11-20 (ADR-118): the built-in list of accessories, searched by a few
letters, and variants of one product (colour, length, size) — each variant an ordinary item with
its own stock, tied to the others by a group. Items made before keep working untouched."""

from app.modules.accessories import library
from tests.conftest import login
from tests.test_old_dealings import _tb


def test_library_finds_products_and_things_for_a_model(owner, cat):
    assert library.size() > 2000
    r = owner.get("/api/v1/accessories/library?q=anker 20w")
    assert r.status_code == 200, r.text
    names = [e["name"] for e in r.json()]
    assert "Anker 20W USB-C Charger" in names
    e = next(x for x in r.json() if x["name"] == "Anker 20W USB-C Charger")
    assert e["kind"] == "charger" and e["brand"] == "Anker" and e["details"]["wattage"] == "20W"
    assert e["variant_by"] == "color" and "White" in e["variants"] and e["have"] == 0

    # laptop goods and gadgets are in it too; a cable's variants are its lengths
    assert any(
        e["kind"] == "Mouse"
        for e in owner.get("/api/v1/accessories/library?q=wireless mouse").json()
    )
    cable = owner.get("/api/v1/accessories/library?q=type-c to type-c 100w").json()[0]
    assert cable["variant_by"] == "size" and "2m" in cable["variants"]
    # every word must match; nonsense finds nothing
    assert owner.get("/api/v1/accessories/library?q=zzqx").json() == []

    # a cover and a glass for a model of the catalogue, made on the fly
    model = cat["model"]["name"]
    r = owner.get(f"/api/v1/accessories/library?q={model} cover")
    made = [e for e in r.json() if e.get("model_id")]
    assert made and all(e["kind"] == "cover" for e in made)
    assert (
        made[0]["name"].startswith("Back Cover for ") and model in made[0]["details"]["compatible"]
    )
    glass = owner.get(f"/api/v1/accessories/library?q=glass {model}").json()
    assert any(e["kind"] == "glass" and e.get("model_id") for e in glass)
    # nothing was written by searching
    assert owner.get("/api/v1/accessories").json() == []


def test_product_with_variants_is_one_item_per_variant(owner, client):
    body = {
        "name": "Anker Nano Charger 65W",
        "category": "charger",
        "brand": "Anker",
        "wattage": "65W",
        "price": 6500,
        "opening_cost": 4000,
        "variant_by": "color",
        "variants": [
            {"label": "Black", "opening_qty": 5},
            {"label": "White", "opening_qty": 3, "price": 6800},
            {"label": "Burgundy Red"},
        ],
    }
    r = owner.post("/api/v1/accessories/with-variants", json=body)
    assert r.status_code == 201, r.text
    rows = r.json()
    assert [x["variant"] for x in rows] == ["Black", "White", "Burgundy Red"]
    assert len({x["variant_group"] for x in rows}) == 1 and rows[0]["variant_group"]
    assert len({x["sku"] for x in rows}) == 3 and len({x["barcode"] for x in rows}) == 3
    assert [x["qty"] for x in rows] == [5, 3, 0]
    assert [x["color"] for x in rows] == ["Black", "White", "Burgundy Red"]
    assert [float(x["price"]) for x in rows] == [6500, 6800, 6500]
    assert all(x["brand"] == "Anker" and x["wattage"] == "65W" for x in rows)
    # the opening stock is in the books once per variant: 8 pieces at 4,000
    assert _tb(owner)["inventory"] == 32000

    # each variant is found by its label; the built-in list now says the shop has it
    found = owner.get("/api/v1/accessories?q=burgundy").json()
    assert [x["variant"] for x in found] == ["Burgundy Red"]
    lib = owner.get("/api/v1/accessories/library?q=anker 65w gan").json()
    assert all(e["have"] == 0 for e in lib)  # another name: not the same product

    # the kinds of one product, from any of them
    kinds = owner.get(f"/api/v1/accessories/{rows[1]['id']}/variants").json()
    assert [x["variant"] for x in kinds] == ["Black", "White", "Burgundy Red"]

    # one more colour later: the card is copied, the stock is not
    r = owner.post(
        f"/api/v1/accessories/{rows[0]['id']}/variants",
        json={
            "variant_by": "color",
            "variants": [{"label": "Blue", "opening_qty": 2, "opening_cost": 4100}],
        },
    )
    assert r.status_code == 201, r.text
    blue = r.json()[-1]
    assert blue["variant"] == "Blue" and blue["qty"] == 2 and blue["brand"] == "Anker"
    assert float(blue["price"]) == 6500 and blue["variant_group"] == rows[0]["variant_group"]
    # the same label again is refused, in any letter case
    again = owner.post(
        f"/api/v1/accessories/{rows[0]['id']}/variants",
        json={"variant_by": "color", "variants": [{"label": "blue"}]},
    )
    assert again.status_code == 409 and again.json()["error"]["code"] == "variant_exists"

    # a variant sells like any item and only its own stock moves
    sale = owner.post(
        "/api/v1/sales",
        json={
            "misc": [
                {
                    "description": "charger",
                    "accessory_id": rows[0]["id"],
                    "qty": 2,
                    "unit_price": 6500,
                }
            ],
            "paid": 13000,
        },
    )
    assert sale.status_code == 201, sale.text
    after = {
        x["variant"]: x["qty"]
        for x in owner.get(f"/api/v1/accessories/{rows[0]['id']}/variants").json()
    }
    assert after == {"Black": 3, "White": 3, "Burgundy Red": 0, "Blue": 2}


def test_variants_are_all_or_none_and_old_items_are_untouched(owner):
    # an item made the old way stands alone
    old = owner.post(
        "/api/v1/accessories",
        json={"name": "Plain Cable", "category": "cable", "price": 300, "color": "White"},
    )
    assert (
        old.status_code == 201
        and old.json()["variant_group"] is None
        and old.json()["variant"] is None
    )
    assert [
        x["id"] for x in owner.get(f"/api/v1/accessories/{old.json()['id']}/variants").json()
    ] == [old.json()["id"]]

    # the same label twice: nothing is made
    bad = owner.post(
        "/api/v1/accessories/with-variants",
        json={
            "name": "Twice",
            "category": "cable",
            "variants": [{"label": "1m"}, {"label": "1M"}],
            "variant_by": "size",
        },
    )
    assert bad.status_code == 422
    assert [x["name"] for x in owner.get("/api/v1/accessories").json()] == ["Plain Cable"]

    # lengths go to the size, not the colour
    r = owner.post(
        "/api/v1/accessories/with-variants",
        json={
            "name": "Type-C Cable",
            "category": "cable",
            "color": "Black",
            "variant_by": "size",
            "variants": [{"label": "1m"}, {"label": "2m"}],
        },
    )
    assert [(x["size"], x["color"]) for x in r.json()] == [("1m", "Black"), ("2m", "Black")]

    # a kind added to the old item: it becomes the first of its group, labelled by its colour
    r = owner.post(
        f"/api/v1/accessories/{old.json()['id']}/variants",
        json={"variant_by": "color", "variants": [{"label": "Black"}]},
    )
    assert r.status_code == 201, r.text
    assert [(x["name"], x["variant"]) for x in r.json()] == [
        ("Plain Cable", "White"),
        ("Plain Cable", "Black"),
    ]


def test_another_shop_and_a_login_without_the_right(owner, other_owner, client):
    rows = owner.post(
        "/api/v1/accessories/with-variants",
        json={
            "name": "Mine",
            "category": "cover",
            "variants": [{"label": "Black"}, {"label": "Blue"}],
        },
    ).json()
    assert other_owner.get(f"/api/v1/accessories/{rows[0]['id']}/variants").status_code == 404
    assert (
        other_owner.post(
            f"/api/v1/accessories/{rows[0]['id']}/variants", json={"variants": [{"label": "Red"}]}
        ).status_code
        == 404
    )
    assert other_owner.get("/api/v1/accessories").json() == []
    # the built-in list counts only the shop's own items
    owner.post(
        "/api/v1/accessories", json={"name": "Anker 20W USB-C Charger", "category": "charger"}
    )
    mine = next(
        e
        for e in owner.get("/api/v1/accessories/library?q=anker 20w usb-c").json()
        if e["name"] == "Anker 20W USB-C Charger"
    )
    theirs = next(
        e
        for e in other_owner.get("/api/v1/accessories/library?q=anker 20w usb-c").json()
        if e["name"] == "Anker 20W USB-C Charger"
    )
    assert mine["have"] == 1 and theirs["have"] == 0
    # a salesman may add stock items as before; a technician may not
    owner.post(
        "/api/v1/staff",
        json={
            "name": "Tech",
            "phone": "03211230000",
            "password": "secret123",
            "role": "technician",
        },
    )
    tech = login(client, "03211230000")
    assert (
        tech.post(
            "/api/v1/accessories/with-variants",
            json={"name": "X", "category": "cover", "variants": [{"label": "A"}]},
        ).status_code
        == 403
    )
