"""Owner 2026-11-15 (ADR-089): two server workers once seeded the global catalogue at the same time,
so every brand showed twice and a shop's phones were split (Apple 98 + Apple 15). The migration
folds each duplicate into one row without losing a phone, a spec sheet or an accessory link, and a
unique index stops it from happening again."""

import importlib.util
import pathlib
import uuid

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError

from app.modules.catalogue.models import Brand, Colour, Model, ModelSpec, Storage
from app.modules.devices.models import Device

MIG = (
    pathlib.Path(__file__).resolve().parents[1]
    / "alembic/versions/c1e3a5b7d9f2_merge_duplicate_catalogue.py"
)
INDEXES = (
    "uq_brands_global_name",
    "uq_models_global_name",
    "uq_storages_global_name",
    "uq_colours_global_name",
)


def _migration():
    spec = importlib.util.spec_from_file_location("mig_c1e3", MIG)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _party(owner):
    r = owner.post(
        "/api/v1/parties", json={"kinds": ["supplier"], "name": "Dealer", "phone": "03007770001"}
    )
    assert r.status_code in (200, 201), r.text
    return r.json()["id"]


def _buy(owner, party, brand_id, model_id, storage_id, colour_id, imei):
    dev = {
        "brand_id": str(brand_id),
        "model_id": str(model_id),
        "storage_id": str(storage_id),
        "colour_id": str(colour_id),
        "condition": "box_pack",
        "imei1": imei,
    }
    r = owner.post(
        "/api/v1/purchases",
        json={
            "kind": "supplier",
            "party_id": party,
            "devices": [{"device": dev, "cost": 10000, "asking_price": 12000}],
            "paid": 10000,
        },
    )
    assert r.status_code == 201, r.text
    return uuid.UUID(r.json()["lines"][0]["device_id"])


def test_duplicates_merged_without_losing_anything(db, owner, cat):
    keep_b = db.get(Brand, uuid.UUID(cat["brand"]["id"]))
    keep_m = db.get(Model, uuid.UUID(cat["model"]["id"]))
    keep_s = db.get(Storage, uuid.UUID(cat["storage"]["id"]))
    keep_c = db.get(Colour, uuid.UUID(cat["colour"]["id"]))
    bn, mn, sn, cn = keep_b.name, keep_m.name, keep_s.name, keep_c.name
    party = _party(owner)
    shop_id = uuid.UUID(owner.get("/api/v1/shops/current").json()["id"])

    # the old race, re-created: a second copy of the same global rows
    for ix in INDEXES:
        db.execute(text(f"DROP INDEX {ix}"))
    dup_b = Brand(
        shop_id=None, name=keep_b.name, name_ur=keep_b.name_ur, sort_order=keep_b.sort_order
    )
    db.add(dup_b)
    db.flush()
    dup_m = Model(shop_id=None, brand_id=dup_b.id, name=keep_m.name)
    dup_s = Storage(shop_id=None, name=keep_s.name, gigabytes=keep_s.gigabytes)
    dup_c = Colour(shop_id=None, name=keep_c.name)
    db.add_all([dup_m, dup_s, dup_c])
    db.flush()
    db.add(ModelSpec(shop_id=shop_id, model_id=dup_m.id, model_number="TA-1", specs={"ram": "4GB"}))
    db.commit()
    names = [b["name"] for b in owner.get("/api/v1/catalogue/brands").json()]
    assert names.count(keep_b.name) == 2  # what the shopkeeper saw

    a = _buy(owner, party, keep_b.id, keep_m.id, keep_s.id, keep_c.id, "356938035643809")
    b = _buy(owner, party, dup_b.id, dup_m.id, dup_s.id, dup_c.id, "356938035643817")
    c = _buy(owner, party, dup_b.id, dup_m.id, dup_s.id, dup_c.id, "490154203237518")
    acc = owner.post(
        "/api/v1/accessories",
        json={
            "name": "Nokia cover",
            "category": "cover",
            "price": 500,
            "compatible_model_ids": [str(dup_m.id), str(keep_m.id)],
        },
    )
    assert acc.status_code in (200, 201), acc.text

    summary = owner.get("/api/v1/reports/stock-summary").json()
    split = [x for x in summary["brands"] if x["name"] == keep_b.name]
    assert sorted(x["count"] for x in split) == [1, 2]  # Apple 98 + Apple 15, in small

    # the migration
    _migration().merge(db.connection())
    db.commit()
    for ix in INDEXES:
        db.execute(text(f"DROP INDEX IF EXISTS {ix}"))
    for t in (Brand, Model, Storage, Colour):
        for ix in t.__table__.indexes:
            if ix.name in INDEXES:
                ix.create(db.connection())
    db.commit()
    db.expire_all()

    # one row per name; every phone on it (the keeper has the most phones)
    brands = db.scalars(select(Brand).where(Brand.shop_id.is_(None), Brand.name == bn)).all()
    assert len(brands) == 1
    kb = brands[0]
    models = db.scalars(select(Model).where(Model.shop_id.is_(None), Model.name == mn)).all()
    assert len(models) == 1
    km = models[0]
    for did in (a, b, c):
        d = db.get(Device, did)
        assert (d.brand_id, d.model_id) == (kb.id, km.id)
        assert d.storage_id is not None and d.colour_id is not None
    assert (
        len(db.scalars(select(Storage).where(Storage.shop_id.is_(None), Storage.name == sn)).all())
        == 1
    )
    assert (
        len(db.scalars(select(Colour).where(Colour.shop_id.is_(None), Colour.name == cn)).all())
        == 1
    )
    # the spec sheet moved, the accessory now fits the one model (once)
    spec = db.scalars(select(ModelSpec).where(ModelSpec.shop_id == shop_id)).all()
    assert [(s.model_id, s.model_number) for s in spec] == [(km.id, "TA-1")]
    got = owner.get(f"/api/v1/accessories/{acc.json()['id']}").json()
    assert got["compatible_model_ids"] == [str(km.id)]

    # the shop sees one brand with all three phones
    names = [x["name"] for x in owner.get("/api/v1/catalogue/brands").json()]
    assert names.count(bn) == 1
    summary = owner.get("/api/v1/reports/stock-summary").json()
    assert [x["count"] for x in summary["brands"] if x["name"] == bn] == [3]

    # and a second global copy is refused from now on
    db.add(Brand(shop_id=None, name=bn.upper()))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_duplicate_expense_categories_merged(db, owner):
    from app.modules.expenses.models import Expense, ExpenseCategory
    from app.modules.expenses.service import seed_categories

    seed_categories(db)
    db.execute(text("DROP INDEX uq_expense_categories_global_key"))
    rent = db.scalars(
        select(ExpenseCategory).where(
            ExpenseCategory.shop_id.is_(None), ExpenseCategory.key == "rent"
        )
    ).one()
    dup = ExpenseCategory(shop_id=None, key="rent", name=rent.name, name_ur=rent.name_ur)
    db.add(dup)
    db.commit()
    rent_id, dup_id = rent.id, dup.id
    assert [c["key"] for c in owner.get("/api/v1/expenses/categories").json()].count("rent") == 2
    for cid, amt in ((rent_id, 100), (dup_id, 200), (dup_id, 300)):
        r = owner.post("/api/v1/expenses", json={"category_id": str(cid), "amount": amt})
        assert r.status_code == 201, r.text
    ledger_before = owner.get("/api/v1/ledger/accounts").json()

    _migration().merge(db.connection())
    db.commit()
    db.expire_all()

    rows = db.scalars(
        select(ExpenseCategory).where(
            ExpenseCategory.shop_id.is_(None), ExpenseCategory.key == "rent"
        )
    ).all()
    assert [r.id for r in rows] == [dup_id]  # the one with more expenses stays
    assert {e.category_id for e in db.scalars(select(Expense)).all()} == {dup_id}
    assert len(db.scalars(select(Expense)).all()) == 3
    assert owner.get("/api/v1/ledger/accounts").json() == ledger_before  # no money moved
    assert [c["key"] for c in owner.get("/api/v1/expenses/categories").json()].count("rent") == 1


def test_seed_twice_adds_nothing(db):
    from app.seeds.catalogue import seed_catalogue

    seed_catalogue(db)
    assert not any(seed_catalogue(db).values())
