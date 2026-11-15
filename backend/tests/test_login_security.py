"""Owner 2026-11-15 (ADR-080): login security — staff log in only on devices the owner approved and
only in the shop's hours, both off until the owner switches them on; never for the owner."""

import datetime as dt

from app.modules.security import service as security
from tests.conftest import login

STAFF = "03451112277"
PHONE_A = "a" * 40  # the app's random key on the salesman's own phone
PHONE_B = "b" * 40  # a stranger's phone, password stolen


def _staff(owner, role="salesman"):
    r = owner.post(
        "/api/v1/staff",
        json={"name": "Counter Boy", "phone": STAFF, "password": "secret123", "role": role},
    )
    assert r.status_code in (200, 201), r.text
    return r.json()


def _login(client, key=None, phone=STAFF):
    return client.post(
        "/api/v1/auth/login",
        json={"phone": phone, "password": "secret123"},
        headers={"X-Device-Key": key} if key else {},
    )


def test_everything_off_by_default(client, owner):
    _staff(owner)
    assert _login(client).status_code == 200  # no key, no rules: as before
    st = owner.get("/api/v1/security").json()
    assert st["rules"]["device_approval"] is False and st["rules"]["hours_on"] is False
    assert st["devices"] == []


def test_device_approval(client, owner):
    _staff(owner)
    assert owner.put("/api/v1/security/rules", json={"device_approval": True}).status_code == 200

    # a new phone waits for the owner; asking again keeps one request
    r = _login(client, PHONE_A)
    assert r.status_code == 403 and r.json()["error"]["code"] == "device_pending"
    _login(client, PHONE_A)
    st = owner.get("/api/v1/security").json()
    assert st["pending"] == 1 and len(st["devices"]) == 1
    dev = st["devices"][0]
    assert dev["user_name"] == "Counter Boy" and dev["status"] == "pending"

    # an old app without the key is told to update
    assert _login(client).json()["error"]["code"] == "device_unknown"

    # a salesman cannot approve
    s_pending = owner.client.post("/api/v1/security/devices/x/approve")
    assert s_pending.status_code in (401, 403, 422)

    assert (
        owner.post(f"/api/v1/security/devices/{dev['id']}/approve").json()["status"] == "approved"
    )
    ok = _login(client, PHONE_A)
    assert ok.status_code == 200
    token = ok.json()["tokens"]

    # the password alone on another phone: waits, and the owner says no
    assert _login(client, PHONE_B).json()["error"]["code"] == "device_pending"
    other = next(
        d for d in owner.get("/api/v1/security").json()["devices"] if d["status"] == "pending"
    )
    owner.post(f"/api/v1/security/devices/{other['id']}/reject")
    assert _login(client, PHONE_B).json()["error"]["code"] == "device_rejected"

    # taking the approved phone back ends its login at once
    owner.post(f"/api/v1/security/devices/{dev['id']}/revoke")
    me = client.get("/api/v1/me", headers={"Authorization": f"Bearer {token['access_token']}"})
    assert me.status_code == 401
    assert _login(client, PHONE_A).json()["error"]["code"] == "device_pending"  # asks again

    # the owner is never held: any device, no key
    assert _login(client, None, phone="03001234567").status_code == 200


def test_login_hours(client, owner, monkeypatch):
    _staff(owner)
    owner.put(
        "/api/v1/security/rules",
        json={"hours_on": True, "hours_from": "10:00", "hours_to": "22:00"},
    )
    r = security.rules(None) | {"hours_on": True, "hours_from": "10:00", "hours_to": "22:00"}
    assert security.within_hours(r, dt.datetime(2026, 11, 15, 10, 0))
    assert not security.within_hours(r, dt.datetime(2026, 11, 15, 22, 0))
    night = r | {"hours_from": "10:00", "hours_to": "02:00"}  # open past midnight
    assert security.within_hours(night, dt.datetime(2026, 11, 15, 1, 30))
    assert not security.within_hours(night, dt.datetime(2026, 11, 15, 3, 0))

    monkeypatch.setattr(security, "within_hours", lambda r, now=None: False)
    out = _login(client)
    assert out.status_code == 403 and out.json()["error"]["code"] == "outside_hours"
    assert _login(client, phone="03001234567").status_code == 200  # never the owner
    monkeypatch.setattr(security, "within_hours", lambda r, now=None: True)
    s = login(client, STAFF)
    monkeypatch.setattr(security, "within_hours", lambda r, now=None: False)
    ref = client.post("/api/v1/auth/refresh", json={"refresh_token": s.refresh})
    assert ref.status_code == 403  # a renewed login keeps to the hours


def test_bad_rules_and_owner_only(client, owner):
    assert owner.put("/api/v1/security/rules", json={"hours_from": "9am"}).status_code == 422
    assert (
        owner.put(
            "/api/v1/security/rules", json={"hours_from": "10:00", "hours_to": "10:00"}
        ).status_code
        == 422
    )
    _staff(owner, role="manager")
    m = login(client, STAFF)
    assert m.get("/api/v1/security").status_code == 403
    assert m.put("/api/v1/security/rules", json={"device_approval": True}).status_code == 403


def test_logout_staff_and_switch_off(client, owner):
    staff = _staff(owner)
    s = login(client, STAFF)
    assert s.get("/api/v1/me").status_code == 200
    assert owner.post("/api/v1/security/logout-staff").json()["ended"] >= 1
    assert s.get("/api/v1/me").status_code == 401
    assert owner.get("/api/v1/me").status_code == 200  # the owner stays in

    s2 = login(client, STAFF)
    owner.patch(f"/api/v1/staff/{staff['id']}", json={"is_active": False})
    assert s2.get("/api/v1/me").status_code == 401
