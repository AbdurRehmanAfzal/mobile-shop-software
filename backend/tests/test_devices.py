"""FR-DEV-01..06: one device per IMEI, event log, state machine, history, IMEI search, accessories."""

from app.modules.devices.state import DeviceStatus, EventType, next_status
from tests.conftest import login

IMEI = "356789104552375"  # Luhn-valid


def _stock(actor, cat, imei=IMEI, **extra):
    payload = {
        "imei1": imei,
        "brand_id": cat["brand"]["id"],
        "model_id": cat["model"]["id"],
        "storage_id": cat["storage"]["id"],
        "colour_id": cat["colour"]["id"],
        "condition": "used",
        "pta_status": "pta_approved",
        "cost_price": 1000,
        "asking_price": 1500,
        "accessories": [
            {"kind": "box", "came_with": True},
            {
                "kind": "charger",
                "came_with": False,
                "pending_from": "vendor",
                "expected_at": "2026-10-25",
            },
        ],
        **extra,
    }
    r = actor.post("/api/v1/devices/opening-stock", json=payload)
    assert r.status_code == 201, r.text
    return r.json()


def _shop_party(actor, phone="03001111111", kinds=("shop",)):
    r = actor.post(
        "/api/v1/parties", json={"name": "Bilal Mobiles", "phone": phone, "kinds": list(kinds)}
    )
    assert r.status_code == 201, r.text
    return r.json()


# ---- state machine unit ------------------------------------------------------------


def test_transition_table():
    assert next_status(None, EventType.PURCHASED) == DeviceStatus.IN_STOCK
    assert next_status(DeviceStatus.IN_STOCK, EventType.LOANED_OUT) == DeviceStatus.ON_LOAN
    assert next_status(DeviceStatus.ON_LOAN, EventType.SOLD) == DeviceStatus.SOLD
    assert next_status(DeviceStatus.SOLD, EventType.SALE_RETURNED) == DeviceStatus.IN_STOCK
    assert next_status(DeviceStatus.SOLD, EventType.PURCHASED) == DeviceStatus.IN_STOCK
    assert next_status(DeviceStatus.SOLD, EventType.LOANED_OUT) is None
    assert next_status(DeviceStatus.IN_STOCK, EventType.LOAN_RETURNED) is None
    assert next_status(DeviceStatus.ON_LOAN, EventType.NOTE) == DeviceStatus.ON_LOAN  # neutral


# ---- API ---------------------------------------------------------------------------------


def test_opening_stock_creates_device_event_and_ledger(owner, cat):
    d = _stock(owner, cat, imei="۳۵۶۷۸۹۱۰۴۵۵۲۳۷۵")  # Urdu digits accepted
    assert d["imei1"] == IMEI and d["imei_luhn_ok"] is True
    assert d["status"] == "in_stock" and d["cycle_no"] == 1 and d["event_count"] == 1
    assert d["brand_name"] == "Nokia" and d["model_name"].startswith("105")
    assert d["cost_price"] == "1000.00" and d["asking_price"] == "1500.00"
    assert d["verification_status"] == "pending"  # used device → must be verified before sale
    hist = owner.get(f"/api/v1/devices/{d['id']}/history").json()
    assert [h["type"] for h in hist] == ["purchased"] and hist[0]["amount"] == "1000.00"
    g = owner.get(f"/api/v1/ledger/groups/{hist[0]['ledger_group_id']}").json()
    assert {(e["account"], e["debit"], e["credit"]) for e in g["entries"]} == {
        ("inventory", "1000.00", "0.00"),
        ("equity", "0.00", "1000.00"),
    }
    detail = owner.get(f"/api/v1/devices/{d['id']}").json()
    assert {a["kind"] for a in detail["accessories"]} == {"box", "charger"}
    assert (
        next(a for a in detail["accessories"] if a["kind"] == "charger")["pending_from"] == "vendor"
    )


def test_box_pack_needs_no_verification_and_non_pta_needs_sim_time(owner, cat):
    d = _stock(owner, cat, imei="490154203237518", condition="box_pack")
    assert d["verification_status"] == "not_required"
    r = owner.post(
        "/api/v1/devices/opening-stock",
        json={
            **{
                k: v
                for k, v in {
                    "imei1": "356938035643809",
                    "brand_id": cat["brand"]["id"],
                    "model_id": cat["model"]["id"],
                    "cost_price": 1,
                }.items()
            },
            "pta_status": "non_pta",
        },
    )
    assert r.status_code == 422
    d2 = _stock(owner, cat, imei="356938035643809", pta_status="jv", sim_time_months=4)
    assert d2["sim_time_months"] == 4


def test_imei_unique_per_shop_and_lookup(owner, other_owner, cat):
    d = _stock(owner, cat)
    r = owner.post(
        "/api/v1/devices/opening-stock",
        json={
            "imei1": IMEI,
            "brand_id": cat["brand"]["id"],
            "model_id": cat["model"]["id"],
            "cost_price": 5,
        },
    )
    assert r.status_code == 409 and r.json()["error"]["code"] == "imei_exists"
    look = owner.get(f"/api/v1/devices/imei/{IMEI}").json()
    assert (
        look["found"]
        and look["seen_before"]
        and look["times_bought"] == 1
        and look["device"]["id"] == d["id"]
    )
    assert owner.get("/api/v1/devices/imei/000000000000000").json() == {
        "found": False,
        "device": None,
        "seen_before": False,
        "times_bought": 0,
        "luhn_ok": True,
    }
    assert owner.get("/api/v1/devices/imei/12").json()["found"] is False
    # other shop: not found, and can stock the same IMEI itself
    assert other_owner.get(f"/api/v1/devices/imei/{IMEI}").json()["found"] is False
    assert other_owner.get(f"/api/v1/devices/{d['id']}").status_code == 404


def test_loan_out_and_return_updates_status_party_and_history(owner, cat):
    d = _stock(owner, cat)
    shop_b = _shop_party(owner)
    customer = _shop_party(owner, phone="03002222222", kinds=("customer",))
    r = owner.post(
        f"/api/v1/devices/{d['id']}/events", json={"type": "loaned_out", "party_id": customer["id"]}
    )
    assert r.status_code == 422 and r.json()["error"]["code"] == "loan_party_must_be_shop"
    r = owner.post(
        f"/api/v1/devices/{d['id']}/events",
        json={
            "type": "loaned_out",
            "party_id": shop_b["id"],
            "expected_back_at": "2026-10-30",
            "note": "gahak ko dikhana hai",
        },
    )
    assert r.status_code == 201, r.text
    assert r.json()["status"] == "on_loan" and r.json()["current_party_name"] == "Bilal Mobiles"
    assert [x["id"] for x in owner.get("/api/v1/devices", params={"status": "on_loan"}).json()] == [
        d["id"]
    ]
    r = owner.post(f"/api/v1/devices/{d['id']}/events", json={"type": "loan_returned"})
    assert (
        r.status_code == 201
        and r.json()["status"] == "in_stock"
        and r.json()["current_party_id"] is None
    )
    hist = owner.get(f"/api/v1/devices/{d['id']}/history").json()
    assert [h["type"] for h in hist] == ["purchased", "loaned_out", "loan_returned"]
    assert [h["seq"] for h in hist] == [0, 1, 2]
    assert (
        hist[1]["party_name"] == "Bilal Mobiles"
        and hist[1]["data"]["note"] == "gahak ko dikhana hai"
    )


def test_invalid_transition_and_money_events_blocked(owner, cat):
    d = _stock(owner, cat)
    r = owner.post(f"/api/v1/devices/{d['id']}/events", json={"type": "loan_returned"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "invalid_transition"
    for t in ("sold", "purchased", "sale_returned", "returned_to_supplier"):
        r = owner.post(f"/api/v1/devices/{d['id']}/events", json={"type": t})
        assert r.status_code == 422 and r.json()["error"]["code"] == "money_event"
    r = owner.post(
        f"/api/v1/devices/{d['id']}/events", json={"type": "marked_faulty", "note": "screen dead"}
    )
    assert r.json()["status"] == "faulty"
    r = owner.post(f"/api/v1/devices/{d['id']}/events", json={"type": "sent_to_repair"})
    assert r.json()["status"] == "in_repair"
    r = owner.post(f"/api/v1/devices/{d['id']}/events", json={"type": "repair_returned"})
    assert r.json()["status"] == "in_stock"
    assert owner.get(f"/api/v1/devices/{d['id']}").json()["event_count"] == 4


def test_price_change_is_an_event_and_search_filters(owner, cat):
    d = _stock(owner, cat)
    r = owner.patch(f"/api/v1/devices/{d['id']}", json={"asking_price": 1800, "notes": "mint"})
    assert r.status_code == 200 and r.json()["asking_price"] == "1800.00"
    hist = owner.get(f"/api/v1/devices/{d['id']}/history").json()
    assert hist[-1]["type"] == "price_changed" and hist[-1]["data"] == {
        "from": "1500.00",
        "to": "1800.00",
    }
    assert len(owner.get("/api/v1/devices", params={"q": "nokia"}).json()) == 1
    assert len(owner.get("/api/v1/devices", params={"q": IMEI[-6:]}).json()) == 1
    assert owner.get("/api/v1/devices", params={"pta_status": "non_pta"}).json() == []
    assert (
        len(
            owner.get(
                "/api/v1/devices", params={"brand_id": cat["brand"]["id"], "condition": "used"}
            ).json()
        )
        == 1
    )


def test_accessories_replace(owner, cat):
    d = _stock(owner, cat)
    r = owner.put(
        f"/api/v1/devices/{d['id']}/accessories",
        json=[{"kind": "box"}, {"kind": "other", "label": "Cover", "came_with": True}],
    )
    assert r.status_code == 200 and {a["kind"] for a in r.json()} == {"box", "other"}
    r = owner.put(f"/api/v1/devices/{d['id']}/accessories", json=[{"kind": "sim"}])
    assert r.status_code == 422


def test_salesman_cannot_see_cost_or_add_opening_stock(client, owner, cat):
    d = _stock(owner, cat)
    owner.post(
        "/api/v1/staff",
        json={"name": "Sales", "phone": "03451112233", "password": "secret123", "role": "salesman"},
    )
    s = login(client, "03451112233")
    got = s.get(f"/api/v1/devices/{d['id']}").json()
    assert got["cost_price"] is None and got["asking_price"] == "1500.00"
    assert s.get("/api/v1/devices").json()[0]["cost_price"] is None
    hist = s.get(f"/api/v1/devices/{d['id']}/history").json()
    assert hist[0]["type"] == "purchased" and hist[0]["amount"] is None
    r = s.post(
        "/api/v1/devices/opening-stock",
        json={
            "imei1": "490154203237518",
            "brand_id": cat["brand"]["id"],
            "model_id": cat["model"]["id"],
            "cost_price": 1,
        },
    )
    assert r.status_code == 403
