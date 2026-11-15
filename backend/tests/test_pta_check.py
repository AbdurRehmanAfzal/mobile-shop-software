"""Owner 2026-11-15 (ADR-082): the shopkeeper checks the IMEI on PTA's DIRBS and saves what it said."""

from tests.conftest import login
from tests.test_devices import _stock
from tests.test_reports_owner import A


def test_pta_check_saves_the_answer(client, owner, cat):
    d = _stock(owner, cat, imei=A, pta_status="unknown")
    r = owner.post(
        f"/api/v1/devices/{d['id']}/pta-check", json={"result": "non_pta", "via": "dirbs"}
    )
    assert r.status_code == 200, r.text
    assert r.json()["pta_status"] == "non_pta"
    owner.post(
        f"/api/v1/devices/{d['id']}/pta-check", json={"result": "pta_approved", "via": "sms"}
    )
    # blocked is recorded, the status stays
    b = owner.post(f"/api/v1/devices/{d['id']}/pta-check", json={"result": "blocked"}).json()
    assert b["pta_status"] == "pta_approved" and b["status"] == "in_stock"
    hist = owner.get(f"/api/v1/devices/{d['id']}/history").json()
    checks = [e for e in hist if e["type"] == "pta_checked"]
    assert [c["data"]["result"] for c in checks] == ["non_pta", "pta_approved", "blocked"]
    assert checks[0]["data"]["before"] == "unknown" and checks[1]["data"]["via"] == "sms"

    assert (
        owner.post(f"/api/v1/devices/{d['id']}/pta-check", json={"result": "maybe"}).status_code
        == 422
    )
    # a salesman may check too (it is part of buying / selling)
    owner.post(
        "/api/v1/staff",
        json={
            "name": "Sales Boy",
            "phone": "03451119900",
            "password": "secret123",
            "role": "salesman",
        },
    )
    s = login(client, "03451119900")
    assert (
        s.post(f"/api/v1/devices/{d['id']}/pta-check", json={"result": "pta_approved"}).status_code
        == 200
    )
