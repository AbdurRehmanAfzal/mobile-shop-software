"""Owner 2026-11-15 (ADR-085): iCloud-locked phones are bought (their IMEI often cannot be seen) for
their parts or to sell as they are. They are kept apart in stock, named on every paper, can be sold
as they are, or taken apart for parts (their cost becomes a cost)."""

from tests.conftest import login
from tests.test_purchases import _party


def _buy_locked(owner, cat, cost=30000, **extra):
    sup = _party(owner, name="Locked Dealer", phone="03007776666")
    dev = {
        "brand_id": cat["brand"]["id"],
        "model_id": cat["model"]["id"],
        "condition": "used",
        "lock_type": "icloud",
        **extra,
    }
    r = owner.post(
        "/api/v1/purchases",
        json={
            "kind": "supplier",
            "party_id": sup["id"],
            "devices": [{"device": dev, "cost": cost, "asking_price": cost + 5000}],
            "paid": cost,
        },
    )
    assert r.status_code == 201, r.text
    return r.json()["lines"][0]["device_id"]


def test_buy_without_imei_and_kept_apart(owner, cat):
    # the shop asks for lock checks on used phones; a locked phone is bought locked on purpose
    owner.patch("/api/v1/shops/current", json={"device_prefs": {"require_lock_check": True}})
    did = _buy_locked(owner, cat)
    d = owner.get(f"/api/v1/devices/{did}").json()
    assert d["lock_type"] == "icloud" and d["imei1"].startswith("LCK") and d["barcode"]
    st = owner.get("/api/v1/devices/stock-status").json()
    assert st["units"]["locked"] == 1 and st["units"]["available"] == 0
    assert [x["id"] for x in owner.get("/api/v1/devices?locked=true").json()] == [did]
    assert owner.get("/api/v1/devices?locked=false").json() == []
    # a normal used phone bought the same way still needs its lock check
    sup = _party(owner, name="Normal Dealer", phone="03007775544")
    r = owner.post(
        "/api/v1/purchases",
        json={
            "kind": "supplier",
            "party_id": sup["id"],
            "devices": [
                {
                    "device": {
                        "imei1": "356938035643809",
                        "brand_id": cat["brand"]["id"],
                        "model_id": cat["model"]["id"],
                        "condition": "used",
                    },
                    "cost": 1000,
                }
            ],
        },
    )
    assert r.status_code == 422 and "lock" in r.text.lower()


def test_serial_kept_when_given(owner, cat):
    did = _buy_locked(owner, cat, serial="F2LXK1ABCD12")
    assert owner.get(f"/api/v1/devices/{did}").json()["imei1"] == "F2LXK1ABCD12"


def test_named_on_every_paper_and_sold_as_it_is(owner, cat):
    did = _buy_locked(owner, cat)
    tally = owner.get("/api/v1/exports/stock-tally?format=pdf&lang=en").text
    assert "iCloud locked" in tally
    csv = owner.get(
        "/api/v1/exports/stock?format=csv&status=all&cols=name,condition&locked=true"
    ).text
    assert "iCloud locked" in csv
    label = owner.get(f"/api/v1/labels/devices?ids={did}&lang=en").text
    assert "iCloud locked" in label
    sale = owner.post(
        "/api/v1/sales",
        json={
            "devices": [{"device_id": did, "price": 36000}],
            "paid": 36000,
            "override_reason": "sold as it is, locked",
        },
    )
    assert sale.status_code == 201, sale.text
    rec = owner.get(f"/api/v1/sales/{sale.json()['id']}/receipt?lang=en").text
    assert "iCloud locked" in rec


def test_used_for_parts(client, owner, cat):
    did = _buy_locked(owner, cat, cost=30000)
    owner.post(
        "/api/v1/staff",
        json={
            "name": "Sales Boy",
            "phone": "03451118811",
            "password": "secret123",
            "role": "salesman",
        },
    )
    s = login(client, "03451118811")
    assert (
        s.post(f"/api/v1/devices/{did}/use-for-parts", json={"parts": ["Camera"]}).status_code
        == 403
    )
    r = owner.post(
        f"/api/v1/devices/{did}/use-for-parts",
        json={"parts": ["Camera", "LCD", "Battery"], "note": "for job R-12"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "used_for_parts"
    assert owner.get("/api/v1/devices/stock-status").json()["units"]["on_hand"] == 0
    ev = [
        e
        for e in owner.get(f"/api/v1/devices/{did}/history").json()
        if e["type"] == "used_for_parts"
    ]
    assert ev and ev[0]["data"]["parts"] == ["Camera", "LCD", "Battery"]
    pl = owner.get("/api/v1/reports/profit-loss").json()
    assert "30000" in str(pl)  # the phone's cost is now a cost
    assert owner.post(f"/api/v1/devices/{did}/use-for-parts", json={}).status_code == 409


def test_opened_later(owner, cat):
    did = _buy_locked(owner, cat)
    r = owner.patch(f"/api/v1/devices/{did}", json={"lock_type": None})
    assert r.status_code == 200, r.text
    assert owner.get(f"/api/v1/devices/{did}").json()["lock_type"] is None
    assert owner.get("/api/v1/devices/stock-status").json()["units"]["locked"] == 0
