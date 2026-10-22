"""FR-TXN-03: purchase documents create devices, events and balanced ledger postings."""

import uuid

from app.modules.devices.service import apply_event, get_device
from app.modules.devices.state import EventType
from tests.conftest import login

IMEI_A = "490154203237518"
IMEI_B = "356938035643809"


def _party(actor, name="Rehman Traders", phone="03005555555", kinds=("supplier",)):
    r = actor.post("/api/v1/parties", json={"name": name, "phone": phone, "kinds": list(kinds)})
    assert r.status_code == 201, r.text
    return r.json()


def _dev(cat, imei, **extra):
    return {
        "imei1": imei,
        "brand_id": cat["brand"]["id"],
        "model_id": cat["model"]["id"],
        "condition": "box_pack",
        "pta_status": "pta_approved",
        **extra,
    }


def test_supplier_purchase_posts_ledger_and_creates_devices(owner, cat):
    sup = _party(owner)
    r = owner.post(
        "/api/v1/purchases",
        json={
            "kind": "supplier",
            "party_id": sup["id"],
            "devices": [
                {
                    "device": _dev(cat, IMEI_A),
                    "cost": 4000,
                    "asking_price": 4800,
                    "accessories": [{"kind": "box"}, {"kind": "charger"}],
                },
                {"device": _dev(cat, IMEI_B), "cost": 4200},
            ],
            "misc": [{"description": "Covers", "qty": 10, "unit_cost": 50}],
            "paid": 5000,
            "reference": "INV-77",
        },
    )
    assert r.status_code == 201, r.text
    p = r.json()
    assert (
        p["no"] == "PUR-000001"
        and p["subtotal"] == "8700.00"
        and p["total"] == "8700.00"
        and p["paid"] == "5000.00"
        and p["balance_due"] == "3700.00"
    )
    assert [ln["kind"] for ln in p["lines"]] == ["device", "device", "misc"]
    assert p["lines"][0]["imei1"] == IMEI_A and p["lines"][0]["device_label"].startswith("Nokia")
    # supplier is owed 3,700 → negative balance (shop owes)
    assert owner.get(f"/api/v1/parties/{sup['id']}").json()["balance"] == "-3700.00"
    assert owner.get("/api/v1/ledger/accounts").json()[0]["balance"] == "-5000.00"
    g = owner.get(f"/api/v1/ledger/groups/{p['ledger_group_id']}").json()
    debits = sum(float(e["debit"]) for e in g["entries"])
    credits = sum(float(e["credit"]) for e in g["entries"])
    assert (
        debits == credits == 13700.0
    )  # 8,200 inventory + 500 purchases + 5,000 party(paid) vs 8,700 party + 5,000 cash
    d = owner.get(f"/api/v1/devices/imei/{IMEI_A}").json()["device"]
    assert (
        d["status"] == "in_stock"
        and d["cost_price"] == "4000.00"
        and d["asking_price"] == "4800.00"
    )
    assert d["verification_status"] == "not_required" and d["current_party_id"] is None
    hist = owner.get(f"/api/v1/devices/{d['id']}/history").json()
    assert (
        hist[0]["type"] == "purchased"
        and hist[0]["party_name"] == "Rehman Traders"
        and hist[0]["data"]["purchase_no"] == "PUR-000001"
    )
    assert {a["kind"] for a in owner.get(f"/api/v1/devices/{d['id']}").json()["accessories"]} == {
        "box",
        "charger",
    }
    assert (
        owner.post(
            "/api/v1/purchases",
            json={
                "kind": "supplier",
                "party_id": sup["id"],
                "devices": [{"device": _dev(cat, IMEI_A), "cost": 1}],
            },
        ).json()["error"]["code"]
        == "imei_in_stock"
    )


def test_walk_in_used_purchase_allocates_discount_and_needs_verification(owner, cat):
    seller = _party(owner, name="Ali Raza", phone="03007777777", kinds=("customer",))
    r = owner.post(
        "/api/v1/purchases",
        json={
            "kind": "walk_in",
            "party_id": seller["id"],
            "devices": [
                {"device": _dev(cat, IMEI_A, condition="used"), "cost": 1000},
                {
                    "device": _dev(
                        cat, IMEI_B, condition="used", pta_status="non_pta", sim_time_months=3
                    ),
                    "cost": 3000,
                },
            ],
            "discount": 100,
            "paid": 3900,
        },
    )
    assert r.status_code == 201, r.text
    p = r.json()
    assert p["total"] == "3900.00" and p["balance_due"] == "0.00"
    assert [ln["discount_share"] for ln in p["lines"]] == ["25.00", "75.00"]
    assert [ln["net_cost"] for ln in p["lines"]] == ["975.00", "2925.00"]
    a = owner.get(f"/api/v1/devices/imei/{IMEI_A}").json()["device"]
    assert a["cost_price"] == "975.00" and a["verification_status"] == "pending"
    assert owner.get(f"/api/v1/parties/{seller['id']}").json()["balance"] == "0.00"


def test_buy_back_a_sold_device_starts_new_cycle(owner, cat, db):
    sup = _party(owner)
    r = owner.post(
        "/api/v1/purchases",
        json={
            "kind": "supplier",
            "party_id": sup["id"],
            "devices": [{"device": _dev(cat, IMEI_A), "cost": 4000}],
            "paid": 4000,
        },
    )
    dev_id = r.json()["lines"][0]["device_id"]
    # simulate a sale (sales module arrives next); event only
    customer = _party(owner, name="Sara", phone="03008888888", kinds=("customer",))
    device = get_device(db, uuid.UUID(owner.shop_id), uuid.UUID(dev_id))
    apply_event(
        db,
        uuid.UUID(owner.shop_id),
        None,
        device,
        EventType.SOLD,
        party_id=uuid.UUID(customer["id"]),
        amount=5000,
    )
    db.commit()
    r = owner.post(
        "/api/v1/purchases",
        json={
            "kind": "trade_in",
            "party_id": customer["id"],
            "devices": [{"device": _dev(cat, IMEI_A, condition="used"), "cost": 3500}],
        },
    )
    assert r.status_code == 201, r.text
    d = owner.get(f"/api/v1/devices/{dev_id}").json()
    assert (
        d["cycle_no"] == 2
        and d["status"] == "in_stock"
        and d["condition"] == "used"
        and d["cost_price"] == "3500.00"
        and d["verification_status"] == "pending"
    )
    assert owner.get(f"/api/v1/devices/imei/{IMEI_A}").json()["times_bought"] == 2
    assert (
        owner.get(f"/api/v1/parties/{customer['id']}").json()["balance"] == "-3500.00"
    )  # we owe the customer (trade-in credit)


def test_void_reverses_ledger_and_devices(owner, cat):
    sup = _party(owner)
    r = owner.post(
        "/api/v1/purchases",
        json={
            "kind": "supplier",
            "party_id": sup["id"],
            "devices": [{"device": _dev(cat, IMEI_A), "cost": 4000}],
            "paid": 1000,
        },
    )
    p = r.json()
    r = owner.post(f"/api/v1/purchases/{p['id']}/void", json={"reason": "wrong supplier"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "voided" and r.json()["balance_due"] == "0.00"
    assert owner.get(f"/api/v1/parties/{sup['id']}").json()["balance"] == "0.00"
    assert owner.get("/api/v1/ledger/accounts").json()[0]["balance"] == "0.00"
    d = owner.get(f"/api/v1/devices/imei/{IMEI_A}").json()["device"]
    assert d["status"] == "returned_to_supplier"
    assert (
        owner.post(f"/api/v1/purchases/{p['id']}/void", json={"reason": "again"}).status_code == 409
    )
    # can be bought again afterwards
    assert (
        owner.post(
            "/api/v1/purchases",
            json={
                "kind": "supplier",
                "party_id": sup["id"],
                "devices": [{"device": _dev(cat, IMEI_A), "cost": 3900}],
            },
        ).status_code
        == 201
    )


def test_void_blocked_once_device_moved(owner, cat):
    sup = _party(owner)
    shop_b = _party(owner, name="Bilal Mobiles", phone="03001111111", kinds=("shop",))
    p = owner.post(
        "/api/v1/purchases",
        json={
            "kind": "supplier",
            "party_id": sup["id"],
            "devices": [{"device": _dev(cat, IMEI_A), "cost": 4000}],
        },
    ).json()
    dev_id = p["lines"][0]["device_id"]
    owner.post("/api/v1/loans", json={"device_id": dev_id, "party_id": shop_b["id"]})
    r = owner.post(f"/api/v1/purchases/{p['id']}/void", json={"reason": "oops"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "device_changed"


def test_validation_and_roles(client, owner, other_owner, cat):
    sup = _party(owner)
    assert (
        owner.post(
            "/api/v1/purchases", json={"kind": "supplier", "party_id": sup["id"]}
        ).status_code
        == 422
    )
    assert (
        owner.post(
            "/api/v1/purchases",
            json={
                "kind": "supplier",
                "party_id": sup["id"],
                "devices": [{"device": _dev(cat, IMEI_A), "cost": 100}],
                "paid": 200,
            },
        ).json()["error"]["code"]
        == "paid_exceeds_total"
    )
    assert (
        owner.post(
            "/api/v1/purchases",
            json={
                "kind": "shop",
                "party_id": sup["id"],
                "devices": [{"device": _dev(cat, IMEI_A), "cost": 100}],
            },
        ).json()["error"]["code"]
        == "party_not_shop"
    )
    assert (
        owner.post(
            "/api/v1/purchases",
            json={
                "kind": "supplier",
                "party_id": sup["id"],
                "devices": [
                    {"device": _dev(cat, IMEI_A), "cost": 100},
                    {"device": _dev(cat, IMEI_A), "cost": 100},
                ],
            },
        ).status_code
        == 422
    )

    owner.post(
        "/api/v1/staff",
        json={"name": "Sales", "phone": "03451112233", "password": "secret123", "role": "salesman"},
    )
    s = login(client, "03451112233")
    r = s.post(
        "/api/v1/purchases",
        json={
            "kind": "supplier",
            "party_id": sup["id"],
            "devices": [{"device": _dev(cat, IMEI_B), "cost": 100}],
        },
    )
    assert r.status_code == 201
    mine = r.json()
    assert s.get(f"/api/v1/purchases/{mine['id']}").status_code == 200  # own
    assert s.get("/api/v1/purchases").status_code == 403  # list needs VIEW_COST
    assert (
        s.post(f"/api/v1/purchases/{mine['id']}/void", json={"reason": "nope nope"}).status_code
        == 403
    )
    assert other_owner.get(f"/api/v1/purchases/{mine['id']}").status_code == 404
    assert len(owner.get("/api/v1/purchases").json()) == 1
