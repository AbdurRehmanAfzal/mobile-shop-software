"""FR-MST-01, FR-MST-02: global catalogue + shop-specific additions, scoped per shop."""

from app.seeds.catalogue import BRANDS, MODELS, seed_catalogue


def test_seed_is_idempotent(db):
    first = seed_catalogue(db)
    assert first["brands"] == len(BRANDS)
    assert first["models"] == len(MODELS)
    assert first["storages"] > 0 and first["colours"] > 0
    second = seed_catalogue(db)
    assert second == {"brands": 0, "models": 0, "storages": 0, "colours": 0}


def test_brands_have_urdu_names_and_model_counts(db, owner):
    seed_catalogue(db)
    rows = owner.get("/api/v1/catalogue/brands").json()
    nokia = next(b for b in rows if b["name"] == "Nokia")
    assert nokia["name_ur"] == "نوکیا"
    assert nokia["is_global"] is True
    assert nokia["model_count"] >= 8


def test_models_filter_and_search(db, owner):
    seed_catalogue(db)
    brands = owner.get("/api/v1/catalogue/brands").json()
    apple = next(b for b in brands if b["name"] == "Apple")
    models = owner.get("/api/v1/catalogue/models", params={"brand_id": apple["id"]}).json()
    assert all(m["brand_id"] == apple["id"] for m in models)
    assert any(m["name"] == "iPhone 13" for m in models)
    hits = owner.get("/api/v1/catalogue/models", params={"q": "105"}).json()
    assert any(m["name"].startswith("105") and m["is_feature_phone"] for m in hits)
    by_brand = owner.get("/api/v1/catalogue/models", params={"q": "nokia"}).json()
    assert len(by_brand) >= 8


def test_shop_specific_brand_and_model_are_private(db, owner, other_owner):
    seed_catalogue(db)
    r = owner.post("/api/v1/catalogue/brands", json={"name": "Dcode", "name_ur": "ڈی کوڈ"})
    assert r.status_code == 201, r.text
    brand = r.json()
    assert brand["is_global"] is False
    r = owner.post(
        "/api/v1/catalogue/models",
        json={"brand_id": brand["id"], "name": "Bold 3", "reference_price": 15000},
    )
    assert r.status_code == 201, r.text

    mine = {b["name"] for b in owner.get("/api/v1/catalogue/brands").json()}
    theirs = {b["name"] for b in other_owner.get("/api/v1/catalogue/brands").json()}
    assert "Dcode" in mine and "Dcode" not in theirs
    # other shop cannot attach a model to a brand it cannot see
    r = other_owner.post("/api/v1/catalogue/models", json={"brand_id": brand["id"], "name": "X"})
    assert r.status_code == 404


def test_duplicate_names_are_conflicts_case_insensitive(db, owner):
    seed_catalogue(db)
    r = owner.post("/api/v1/catalogue/brands", json={"name": "samsung"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "brand_exists"
    brands = owner.get("/api/v1/catalogue/brands").json()
    nokia = next(b for b in brands if b["name"] == "Nokia")
    r = owner.post("/api/v1/catalogue/models", json={"brand_id": nokia["id"], "name": "3310"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "model_exists"


def test_storages_and_colours(db, owner):
    seed_catalogue(db)
    st = owner.get("/api/v1/catalogue/storages").json()
    assert [s["name"] for s in st][:3] == ["4MB", "16GB", "32GB"]
    co = owner.get("/api/v1/catalogue/colours").json()
    assert any(c["name"] == "Black" and c["name_ur"] == "سیاہ" for c in co)
    r = owner.post("/api/v1/catalogue/colours", json={"name": "Peach", "hex": "#FFCBA4"})
    assert r.status_code == 201
    r = owner.post("/api/v1/catalogue/colours", json={"name": "Bad", "hex": "purple"})
    assert r.status_code == 422


def test_technician_cannot_add_catalogue_rows(client, db, owner):
    from tests.conftest import login

    seed_catalogue(db)
    owner.post(
        "/api/v1/staff",
        json={
            "name": "Tech",
            "phone": "03451112233",
            "password": "secret123",
            "role": "technician",
        },
    )
    tech = login(client, "03451112233")
    assert tech.get("/api/v1/catalogue/brands").status_code == 200
    assert tech.post("/api/v1/catalogue/brands", json={"name": "Zed"}).status_code == 403


# ---- rename / delete (owner asked: brand, model, storage, colour all editable) ----


def test_rename_and_delete_own_rows(db, owner, other_owner):
    seed_catalogue(db)
    b = owner.post("/api/v1/catalogue/brands", json={"name": "Dcod"}).json()
    r = owner.patch(f"/api/v1/catalogue/brands/{b['id']}", json={"name": "Dcode"})
    assert r.status_code == 200 and r.json()["name"] == "Dcode"
    # other shop cannot see it
    assert (
        other_owner.patch(f"/api/v1/catalogue/brands/{b['id']}", json={"name": "X"}).status_code
        == 404
    )
    # name clash with a built-in brand
    r = owner.patch(f"/api/v1/catalogue/brands/{b['id']}", json={"name": "nokia"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "brand_exists"

    st = owner.post("/api/v1/catalogue/storages", json={"name": "48GB", "gigabytes": 48}).json()
    r = owner.patch(
        f"/api/v1/catalogue/storages/{st['id']}", json={"name": "96GB", "gigabytes": 96}
    )
    assert r.json()["gigabytes"] == 96
    co = owner.post("/api/v1/catalogue/colours", json={"name": "Sand"}).json()
    assert owner.delete(f"/api/v1/catalogue/colours/{co['id']}").status_code == 204
    assert all(c["id"] != co["id"] for c in owner.get("/api/v1/catalogue/colours").json())

    m = owner.post("/api/v1/catalogue/models", json={"brand_id": b["id"], "name": "Bold"}).json()
    # brand with a model cannot be deleted
    r = owner.delete(f"/api/v1/catalogue/brands/{b['id']}")
    assert r.status_code == 409 and r.json()["error"]["code"] == "catalogue_in_use"
    assert (
        owner.patch(f"/api/v1/catalogue/models/{m['id']}", json={"name": "Bold 2"}).json()["name"]
        == "Bold 2"
    )
    assert owner.delete(f"/api/v1/catalogue/models/{m['id']}").status_code == 204
    assert owner.delete(f"/api/v1/catalogue/brands/{b['id']}").status_code == 204


def test_builtin_rows_are_locked(db, owner):
    seed_catalogue(db)
    nokia = next(b for b in owner.get("/api/v1/catalogue/brands").json() if b["name"] == "Nokia")
    r = owner.patch(f"/api/v1/catalogue/brands/{nokia['id']}", json={"name": "Nokiaa"})
    assert r.status_code == 403 and r.json()["error"]["code"] == "catalogue_builtin"
    assert owner.delete(f"/api/v1/catalogue/brands/{nokia['id']}").status_code == 403


def test_used_storage_cannot_be_deleted(db, owner):
    seed_catalogue(db)
    nokia = next(b for b in owner.get("/api/v1/catalogue/brands").json() if b["name"] == "Nokia")
    model = owner.get("/api/v1/catalogue/models", params={"brand_id": nokia["id"]}).json()[0]
    st = owner.post("/api/v1/catalogue/storages", json={"name": "48GB", "gigabytes": 48}).json()
    r = owner.post(
        "/api/v1/devices/opening-stock",
        json={
            "imei1": "490154203237518",
            "brand_id": nokia["id"],
            "model_id": model["id"],
            "storage_id": st["id"],
            "condition": "used",
            "pta_status": "pta_approved",
            "warranty_months": 0,
            "cost_price": 800,
        },
    )
    assert r.status_code == 201, r.text
    r = owner.delete(f"/api/v1/catalogue/storages/{st['id']}")
    assert r.status_code == 409 and r.json()["error"]["code"] == "catalogue_in_use"


def test_salesman_can_add_but_not_edit(client, db, owner):
    from tests.conftest import login

    seed_catalogue(db)
    owner.post(
        "/api/v1/staff",
        json={"name": "Sales", "phone": "03451112244", "password": "secret123", "role": "salesman"},
    )
    sales = login(client, "03451112244")
    b = sales.post("/api/v1/catalogue/brands", json={"name": "Zed"})
    assert b.status_code == 201
    assert (
        sales.patch(f"/api/v1/catalogue/brands/{b.json()['id']}", json={"name": "Zedd"}).status_code
        == 403
    )
    assert sales.delete(f"/api/v1/catalogue/brands/{b.json()['id']}").status_code == 403
