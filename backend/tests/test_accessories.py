"""FR-ACC-01, FR-ACC-03, FR-ACC-04: accessory stock, movements, purchase/sale/repair integration, pending tracker."""

from tests.conftest import login
from tests.test_devices import _stock
from tests.test_purchases import _party


def _acc(owner, **extra):
    r = owner.post(
        "/api/v1/accessories",
        json={
            "name": "Type-C charger 20W",
            "name_ur": "ٹائپ سی چارجر",
            "category": "charger",
            "price": 800,
            "reorder_level": 3,
            **extra,
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


def test_create_with_opening_stock_and_adjust(owner):
    a = _acc(owner, opening_qty=10, opening_cost=450)
    assert (
        a["sku"].startswith("TYPECCHA-")
        and a["qty"] == 10
        and a["avg_cost"] == "450.00"
        and a["low_stock"] is False
    )
    g = owner.get("/api/v1/ledger/accounts").json()
    assert g[0]["balance"] == "0.00"  # opening stock is equity, not cash
    r = owner.post(
        f"/api/v1/accessories/{a['id']}/adjust", json={"qty_delta": -2, "note": "damaged"}
    )
    assert r.json()["qty"] == 8
    r = owner.post(f"/api/v1/accessories/{a['id']}/adjust", json={"qty_delta": -20, "note": "lost"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "insufficient_stock"
    mv = owner.get(f"/api/v1/accessories/{a['id']}/movements").json()
    assert [m["qty_delta"] for m in mv] == [-2, 10] and mv[0]["qty_after"] == 8
    assert (
        owner.post("/api/v1/accessories", json={"name": "Dup", "sku": a["sku"]}).status_code == 409
    )


def test_purchase_and_sale_move_stock_with_average_cost(owner, cat):
    sup = _party(owner)
    c = _party(owner, name="Ahmed", phone="03219876543", kinds=("customer",))
    a = _acc(owner, opening_qty=4, opening_cost=400)
    r = owner.post(
        "/api/v1/purchases",
        json={
            "kind": "supplier",
            "party_id": sup["id"],
            "misc": [
                {
                    "description": "Type-C charger 20W",
                    "qty": 6,
                    "unit_cost": 500,
                    "accessory_id": a["id"],
                }
            ],
            "paid": 3000,
        },
    )
    assert r.status_code == 201, r.text
    got = owner.get(f"/api/v1/accessories/{a['id']}").json()
    assert got["qty"] == 10 and got["avg_cost"] == "460.00"  # (4*400 + 6*500) / 10
    g = owner.get(f"/api/v1/ledger/groups/{r.json()['ledger_group_id']}").json()
    assert next(e for e in g["entries"] if e["account"] == "inventory")["debit"] == "3000.00"
    inv = owner.post(
        "/api/v1/sales",
        json={
            "party_id": c["id"],
            "misc": [
                {"description": "charger", "qty": 3, "unit_price": 800, "accessory_id": a["id"]}
            ],
            "paid": 2400,
        },
    ).json()
    assert inv["lines"][0]["cost"] == "1380.00" and inv["profit"] == "1020.00"  # 3*460 cost
    assert owner.get(f"/api/v1/accessories/{a['id']}").json()["qty"] == 7
    r = owner.post(
        "/api/v1/sales",
        json={
            "misc": [
                {"description": "charger", "qty": 50, "unit_price": 800, "accessory_id": a["id"]}
            ],
            "paid": 40000,
        },
    )
    assert r.status_code == 422 and r.json()["error"]["code"] == "insufficient_stock"
    # void the sale → stock back
    owner.post(f"/api/v1/sales/{inv['id']}/void", json={"reason": "mistake"})
    assert owner.get(f"/api/v1/accessories/{a['id']}").json()["qty"] == 10
    low = owner.get("/api/v1/accessories", params={"low_only": "true"}).json()
    assert low == []
    owner.post(f"/api/v1/accessories/{a['id']}/adjust", json={"qty_delta": -8, "note": "count"})
    assert [
        x["id"] for x in owner.get("/api/v1/accessories", params={"low_only": "true"}).json()
    ] == [a["id"]]
    _ = _stock


def test_repair_parts_consume_stock_at_delivery(owner):
    c = _party(owner, name="Ahmed", phone="03219876543", kinds=("customer",))
    a = _acc(owner, opening_qty=2, opening_cost=3000)
    j = owner.post(
        "/api/v1/repairs",
        json={"party_id": c["id"], "device_desc": "A54", "fault_codes": ["screen"]},
    ).json()
    owner.put(
        f"/api/v1/repairs/{j['id']}/parts",
        json=[{"description": "Screen", "accessory_id": a["id"], "qty": 1, "unit_price": 4500}],
    )
    r = owner.post(f"/api/v1/repairs/{j['id']}/deliver", json={"paid": 4500, "labour": 0})
    assert r.status_code == 200, r.text
    assert owner.get(f"/api/v1/accessories/{a['id']}").json()["qty"] == 1
    g = owner.get(f"/api/v1/ledger/groups/{r.json()['bill_group_id']}").json()
    assert next(e for e in g["entries"] if e["account"] == "cogs")["debit"] == "3000.00"


def test_pending_tracker(owner, cat):
    c = _party(owner, name="Ahmed", phone="03219876543", kinds=("customer",))
    d = _stock(
        owner, cat, imei="490154203237518", condition="box_pack", cost_price=800, asking_price=1000
    )
    owner.post(
        "/api/v1/sales",
        json={
            "party_id": c["id"],
            "devices": [
                {
                    "device_id": d["id"],
                    "price": 1000,
                    "accessories_pending": [{"kind": "charger", "promised_at": "2020-01-01"}],
                }
            ],
            "paid": 1000,
        },
    )
    pend = owner.get("/api/v1/accessories/pending").json()
    assert len(pend) == 1  # the charger item moved from pending-from-vendor to pending-to-customer
    to_customer = next(p for p in pend if p["pending_from"] == "shop")
    assert (
        to_customer["party_name"] == "Ahmed"
        and to_customer["overdue"] is True
        and to_customer["kind"] == "charger"
    )
    r = owner.post(f"/api/v1/accessories/pending/{to_customer['item_id']}/deliver")
    assert r.status_code == 200
    assert owner.get("/api/v1/accessories/pending").json() == []


def test_roles(client, owner):
    a = _acc(owner, opening_qty=1, opening_cost=100)
    owner.post(
        "/api/v1/staff",
        json={"name": "Sales", "phone": "03451112233", "password": "secret123", "role": "salesman"},
    )
    s = login(client, "03451112233")
    assert s.get("/api/v1/accessories").json()[0]["avg_cost"] is None
    assert s.post(f"/api/v1/accessories/{a['id']}/adjust", json={"qty_delta": 1, "note": "count"}).status_code == 403
