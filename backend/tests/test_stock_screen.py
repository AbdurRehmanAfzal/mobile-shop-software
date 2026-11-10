"""Owner brief 2026-11-10 (ADR-059): the stock screen's status cards and filters. Read-only: looking
at stock never posts anything."""

from tests.conftest import login
from tests.test_accessories import _acc
from tests.test_devices import _stock
from tests.test_purchases import _party

IMEIS = [f"35693803564{n:04d}" for n in range(1, 6)]
SECOND = "353456789012999"


def _five(owner, cat):
    """five units: three sellable, one out with a customer for approval, one waiting for its ID check"""
    units = []
    for i, imei in enumerate(IMEIS):
        extra = {"imei2": SECOND} if i == 0 else {}
        units.append(
            _stock(
                owner,
                cat,
                imei=imei,
                condition="box_pack" if i < 4 else "used",
                cost_price=100000,
                asking_price=120000,
                **extra,
            )
        )
    cus = _party(owner, name="Ali", phone="03211111111", kinds=("customer",))
    r = owner.post(
        f"/api/v1/devices/{units[3]['id']}/events",
        json={"type": "approval_out", "party_id": cus["id"]},
    )
    assert r.status_code == 201, r.text
    return units


def test_status_cards_and_filters(owner, cat, db):
    from sqlalchemy import func, select

    from app.modules.devices.models import DeviceEvent
    from app.modules.ledger.models import LedgerGroup

    units = _five(owner, cat)
    before = (
        db.scalar(select(func.count(LedgerGroup.id))),
        db.scalar(select(func.count(DeviceEvent.id))),
    )

    s = owner.get("/api/v1/devices/stock-status").json()
    u = s["units"]
    assert u["on_hand"] == 5 and u["available"] == 3 and u["approval"] == 1 and u["inspection"] == 1
    assert s["units_value_cost"] == "500000.00"
    # the "available" card's filter shows the three sellable units
    sell = owner.get("/api/v1/devices", params={"sellable": "true"}).json()
    assert sorted(d["imei1"] for d in sell) == sorted(IMEIS[:3])
    insp = owner.get("/api/v1/devices", params={"inspection": "true"}).json()
    assert [d["imei1"] for d in insp] == [IMEIS[4]]
    # either IMEI of a dual-SIM phone finds the same unit, once
    a = owner.get("/api/v1/devices", params={"q": IMEIS[0]}).json()
    b = owner.get("/api/v1/devices", params={"q": SECOND}).json()
    assert [d["id"] for d in a] == [d["id"] for d in b] == [units[0]["id"]]
    # its barcode finds it too
    bc = owner.get(f"/api/v1/devices/{units[0]['id']}").json()["barcode"]
    assert [d["id"] for d in owner.get("/api/v1/devices", params={"q": bc}).json()] == [
        units[0]["id"]
    ]
    # cost range, older stock (all new today)
    assert (
        len(owner.get("/api/v1/devices", params={"cost_min": 90000, "cost_max": 110000}).json())
        == 5
    )
    assert owner.get("/api/v1/devices", params={"cost_max": 50000}).json() == []
    assert owner.get("/api/v1/devices", params={"age_min": 30}).json() == []

    # looking at stock posts nothing
    after = (
        db.scalar(select(func.count(LedgerGroup.id))),
        db.scalar(select(func.count(DeviceEvent.id))),
    )
    assert before == after


def test_items_low_and_out(owner):
    """a charger SKU with six: not low at a reorder level of 5; four is low; none is out"""
    c = _acc(owner, opening_qty=6, opening_cost=300, reorder_level=5)
    assert owner.get("/api/v1/devices/stock-status").json()["items"] == {
        "on_hand": 6,
        "low": 0,
        "out": 0,
    }
    r = owner.post(f"/api/v1/accessories/{c['id']}/adjust", json={"qty_delta": -2, "note": "count"})
    assert r.status_code in (200, 201), r.text
    assert owner.get("/api/v1/devices/stock-status").json()["items"] == {
        "on_hand": 4,
        "low": 1,
        "out": 0,
    }
    owner.post(f"/api/v1/accessories/{c['id']}/adjust", json={"qty_delta": -4, "note": "damaged"})
    assert owner.get("/api/v1/devices/stock-status").json()["items"]["out"] == 1


def test_supplier_source_and_staff_see_no_cost(client, owner, cat):
    sup = _party(owner, name="Bilal Traders", phone="03213333333", kinds=("supplier",))
    p = owner.post(
        "/api/v1/purchases",
        json={
            "kind": "supplier",
            "party_id": sup["id"],
            "devices": [
                {
                    "device": {
                        "imei1": IMEIS[0],
                        "brand_id": cat["brand"]["id"],
                        "model_id": cat["model"]["id"],
                        "condition": "box_pack",
                        "pta_status": "pta_approved",
                    },
                    "cost": 1000,
                }
            ],
        },
    )
    assert p.status_code == 201, p.text
    # an older record with no storage, colour, asking price or extras still lists
    _stock(
        owner,
        cat,
        imei=IMEIS[1],
        storage_id=None,
        colour_id=None,
        asking_price=None,
        accessories=[],
    )
    rows = owner.get("/api/v1/devices").json()
    mine = next(d for d in rows if d["imei1"] == IMEIS[0])
    assert mine["source_party_name"] == "Bilal Traders"
    assert [
        d["imei1"] for d in owner.get("/api/v1/devices", params={"supplier_id": sup["id"]}).json()
    ] == [IMEIS[0]]
    old = next(d for d in rows if d["imei1"] == IMEIS[1])
    assert old["storage_name"] is None and old["asking_price"] is None

    owner.post(
        "/api/v1/staff",
        json={"name": "Sales", "phone": "03451112233", "password": "secret123", "role": "salesman"},
    )
    s = login(client, "03451112233")
    st = s.get("/api/v1/devices/stock-status").json()
    assert st["value_cost"] is None and st["units"]["on_hand"] == 2
    rows = s.get("/api/v1/devices", params={"cost_max": 1}).json()  # ignored for staff
    assert len(rows) == 2 and all(d["cost_price"] is None for d in rows)
