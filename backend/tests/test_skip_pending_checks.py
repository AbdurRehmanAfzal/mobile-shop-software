"""ADR-128: the ID check can be skipped wherever it stops the counter — in an exchange, and for
every pending phone of the stock in one go. A phone flagged as possibly stolen is never part of it."""

from tests.conftest import login
from tests.test_devices import _stock
from tests.test_exchange_reports import _dev
from tests.test_purchases import _party

A, B, C, D = "356938035643809", "490154203237518", "356789104552375", "352099001761481"
WHY = "Known person, verification skipped by shopkeeper"


def _pending(actor):
    return actor.get("/api/v1/devices", params={"id_pending": True}).json()


def test_skip_every_pending_check_at_once(client, owner, other_owner, cat):
    a = _stock(owner, cat, imei=A)
    b = _stock(owner, cat, imei=B)
    c = _stock(owner, cat, imei=C)
    owner.put(f"/api/v1/devices/{c['id']}/verification", json={"egadget_result": "flagged"})
    assert {d["id"] for d in _pending(owner)} == {a["id"], b["id"], c["id"]}
    assert owner.get("/api/v1/reports/dashboard").json()["pending_verification"] == 3

    # another shop can neither see nor skip them
    assert _pending(other_owner) == []
    r = other_owner.post(
        "/api/v1/verification/skip-pending", json={"reason": WHY, "device_ids": [a["id"]]}
    )
    assert r.status_code == 200 and r.json() == {"skipped": 0, "flagged_left": 0}

    # one by one from the list: only the phone named
    r = owner.post(
        "/api/v1/verification/skip-pending", json={"reason": WHY, "device_ids": [a["id"]]}
    )
    assert r.status_code == 200 and r.json() == {"skipped": 1, "flagged_left": 0}
    assert {d["id"] for d in _pending(owner)} == {b["id"], c["id"]}

    # a salesman may skip the rest; the flagged phone stays for the owner
    owner.post(
        "/api/v1/staff",
        json={"name": "Sales", "phone": "03451112233", "password": "secret123", "role": "salesman"},
    )
    s = login(client, "03451112233")
    r = s.post("/api/v1/verification/skip-pending", json={"reason": WHY})
    assert r.status_code == 200 and r.json() == {"skipped": 1, "flagged_left": 1}
    left = _pending(owner)
    assert [d["id"] for d in left] == [c["id"]] and left[0]["verification_status"] == "flagged"
    assert owner.get("/api/v1/reports/dashboard").json()["pending_verification"] == 1
    for d in (a, b):
        dev = owner.get(f"/api/v1/devices/{d['id']}").json()
        assert dev["verification_status"] == "clear"
        v = owner.get(f"/api/v1/devices/{d['id']}/verification").json()
        assert v["override_reason"] == WHY and v["result"] == "pending"  # a skip, not a check done
    # a second press changes nothing
    assert s.post("/api/v1/verification/skip-pending", json={"reason": WHY}).json() == {
        "skipped": 0,
        "flagged_left": 1,
    }
    # a reason is needed
    assert s.post("/api/v1/verification/skip-pending", json={"reason": "x"}).status_code == 422


def test_exchange_with_a_pending_phone_can_be_skipped(owner, cat):
    cust = _party(owner, name="Ahmed Khan", phone="03219876543", kinds=("customer",))
    new = _stock(owner, cat, imei=A, cost_price=180000, asking_price=200000)  # used: check pending
    body = {
        "party_id": cust["id"],
        "trade_in": [{"device": _dev(cat, D), "cost": 80000}],
        "devices": [{"device_id": new["id"], "price": 200000}],
        "paid": 120000,
    }
    r = owner.post("/api/v1/exchanges", json=body)
    assert r.status_code == 409 and r.json()["error"]["code"] == "not_sellable"
    # nothing was saved by the refused exchange
    assert owner.get(f"/api/v1/devices/imei/{D}").json()["found"] is False
    # skipped, but the exchange fails further on: no skip and no trade-in are left behind
    r = owner.post("/api/v1/exchanges", json={**body, "override_reason": WHY, "refund": 5000})
    assert r.status_code == 422 and r.json()["error"]["code"] == "refund_exceeds"
    assert owner.get(f"/api/v1/devices/imei/{D}").json()["found"] is False
    assert owner.get(f"/api/v1/devices/{new['id']}").json()["verification_status"] == "pending"
    r = owner.post("/api/v1/exchanges", json={**body, "override_reason": WHY})
    assert r.status_code == 201, r.text
    assert owner.get(f"/api/v1/devices/{new['id']}").json()["status"] == "sold"
