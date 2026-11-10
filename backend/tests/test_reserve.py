"""Owner 2026-11-10 (ADR-060): reserve a phone or some pieces of an item for a customer; a shelf
for a phone; the SIM time of a Non-PTA phone is optional."""

from tests.conftest import login
from tests.test_accessories import _acc
from tests.test_devices import _stock
from tests.test_purchases import _party

A = "490154203237518"
B = "356938035643809"


def test_reserve_a_phone(client, owner, cat, db):
    from sqlalchemy import func, select

    from app.modules.ledger.models import LedgerGroup

    ali = _party(owner, name="Ali", phone="03211111111", kinds=("customer",))
    sara = _party(owner, name="Sara", phone="03212222222", kinds=("customer",))
    d = _stock(
        owner,
        cat,
        imei=A,
        condition="box_pack",
        cost_price=1000,
        asking_price=1500,
        location="Rack A2",
    )
    _stock(owner, cat, imei=B, condition="box_pack", cost_price=1000, asking_price=1500)
    groups = db.scalar(select(func.count(LedgerGroup.id)))

    r = owner.post(
        f"/api/v1/devices/{d['id']}/reserve",
        json={"party_id": ali["id"], "until": "2030-01-01", "note": "advance 1000 promised"},
    )
    assert r.status_code == 200, r.text
    out = r.json()
    assert (
        out["reserved_party_name"] == "Ali"
        and out["reserved_until"] == "2030-01-01"
        and out["status"] == "in_stock"
    )
    assert db.scalar(select(func.count(LedgerGroup.id))) == groups  # nothing posted
    st = owner.get("/api/v1/devices/stock-status").json()["units"]
    assert st["reserved"] == 1 and st["available"] == 1 and st["on_hand"] == 2
    assert [
        x["imei1"] for x in owner.get("/api/v1/devices", params={"reserved": "true"}).json()
    ] == [A]
    assert A not in [
        x["imei1"] for x in owner.get("/api/v1/devices", params={"sellable": "true"}).json()
    ]
    assert (
        owner.post(f"/api/v1/devices/{d['id']}/reserve", json={"party_id": sara["id"]}).status_code
        == 409
    )

    # someone else cannot buy it; its customer can, and that ends the hold
    r = owner.post(
        "/api/v1/sales",
        json={
            "party_id": sara["id"],
            "devices": [{"device_id": d["id"], "price": 1500}],
            "paid": 1500,
        },
    )
    assert r.status_code == 409 and r.json()["error"]["code"] == "reserved_for_other"
    r = owner.post(
        "/api/v1/sales", json={"devices": [{"device_id": d["id"], "price": 1500}], "paid": 1500}
    )
    assert r.status_code == 409  # walk-in neither
    r = owner.post(
        "/api/v1/sales",
        json={
            "party_id": ali["id"],
            "devices": [{"device_id": d["id"], "price": 1500}],
            "paid": 1500,
        },
    )
    assert r.status_code == 201, r.text
    after = owner.get(f"/api/v1/devices/{d['id']}").json()
    assert after["status"] == "sold" and after["reserved_party_id"] is None
    types = [e["type"] for e in owner.get(f"/api/v1/devices/{d['id']}/history").json()]
    assert "reserved" in types and "sold" in types


def test_release_and_shelf(owner, cat):
    ali = _party(owner, name="Ali", phone="03211111111", kinds=("customer",))
    d = _stock(owner, cat, imei=A, condition="box_pack", location="Rack A2")
    assert d["location"] == "Rack A2"
    assert [
        x["imei1"] for x in owner.get("/api/v1/devices", params={"location": "rack a"}).json()
    ] == [A]
    assert [x["imei1"] for x in owner.get("/api/v1/devices", params={"q": "Rack A2"}).json()] == [A]
    r = owner.patch(f"/api/v1/devices/{d['id']}", json={"location": "Drawer 3"})
    assert r.status_code == 200 and r.json()["location"] == "Drawer 3"
    owner.post(f"/api/v1/devices/{d['id']}/reserve", json={"party_id": ali["id"]})
    r = owner.post(f"/api/v1/devices/{d['id']}/release", json={"reason": "did not come"})
    assert r.status_code == 200 and r.json()["reserved_party_id"] is None
    assert owner.post(f"/api/v1/devices/{d['id']}/release", json={}).status_code == 409
    types = [e["type"] for e in owner.get(f"/api/v1/devices/{d['id']}/history").json()]
    assert "unreserved" in types


def test_reserve_pieces_of_an_item(owner):
    ali = _party(owner, name="Ali", phone="03211111111", kinds=("customer",))
    sara = _party(owner, name="Sara", phone="03212222222", kinds=("customer",))
    c = _acc(owner, opening_qty=6, opening_cost=300, reorder_level=3)
    r = owner.post(f"/api/v1/accessories/{c['id']}/reserve", json={"party_id": ali["id"], "qty": 2})
    assert r.status_code == 201, r.text
    assert r.json()[0]["left"] == 2
    assert owner.get("/api/v1/devices/stock-status").json()["items"]["reserved"] == 2
    assert (
        owner.post(
            f"/api/v1/accessories/{c['id']}/reserve", json={"party_id": sara["id"], "qty": 5}
        ).json()["error"]["code"]
        == "not_enough_free"
    )

    sale = lambda party, qty: owner.post(
        "/api/v1/sales",
        json={
            "party_id": party,
            "misc": [
                {"description": "Charger", "qty": qty, "unit_price": 800, "accessory_id": c["id"]}
            ],
            "paid": 800 * qty,
        },
    )
    # Sara can have the 4 that are free, not 5
    r = sale(sara["id"], 5)
    assert r.status_code == 409 and r.json()["error"]["code"] == "reserved_stock"
    assert sale(sara["id"], 4).status_code == 201
    # Ali takes his two: the hold is filled
    assert sale(ali["id"], 2).status_code == 201
    res = owner.get(f"/api/v1/accessories/{c['id']}/reservations").json()
    assert res[0]["status"] == "done" and res[0]["left"] == 0
    assert owner.get("/api/v1/devices/stock-status").json()["items"]["reserved"] == 0

    # a hold can be released
    c2 = _acc(owner, name="Cable", opening_qty=3, opening_cost=100)
    rid = owner.post(
        f"/api/v1/accessories/{c2['id']}/reserve", json={"party_id": ali["id"], "qty": 1}
    ).json()[0]["id"]
    r = owner.post(
        f"/api/v1/accessories/reservations/{rid}/release", json={"reason": "changed mind"}
    )
    assert r.status_code == 200 and r.json()[0]["status"] == "released"


def test_non_pta_without_sim_time(owner, cat):
    d = _stock(owner, cat, imei=A, pta_status="non_pta")
    assert d["pta_status"] == "non_pta" and d["sim_time_months"] is None


def test_staff_can_reserve_but_not_see_cost(client, owner, cat):
    ali = _party(owner, name="Ali", phone="03211111111", kinds=("customer",))
    d = _stock(owner, cat, imei=A, condition="box_pack")
    owner.post(
        "/api/v1/staff",
        json={"name": "Sales", "phone": "03451112233", "password": "secret123", "role": "salesman"},
    )
    s = login(client, "03451112233")
    r = s.post(f"/api/v1/devices/{d['id']}/reserve", json={"party_id": ali["id"]})
    assert r.status_code == 200 and r.json()["cost_price"] is None
