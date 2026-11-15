"""Owner 2026-11-15 (ADR-088): change my own password and PIN; every change is in a history (whose,
which, by whom, when, from where) — the password / PIN itself is never kept or shown; the super
admin resets a password or PIN; login works with the password or the PIN."""

import json

from tests.conftest import login

OWNER = "03001234567"
STAFF = "03451113344"


def _staff(owner):
    r = owner.post(
        "/api/v1/staff",
        json={"name": "Sales Boy", "phone": STAFF, "password": "secret123", "role": "salesman"},
    )
    assert r.status_code in (200, 201), r.text
    return r.json()


def test_change_own_password_and_pin(client, owner):
    bad = owner.put(
        "/api/v1/me/password", json={"current_password": "wrong", "new_password": "newpass99"}
    )
    assert bad.status_code == 401
    assert (
        owner.put(
            "/api/v1/me/password", json={"current_password": "secret123", "new_password": "x"}
        ).status_code
        == 422
    )
    assert (
        owner.put(
            "/api/v1/me/password",
            json={"current_password": "secret123", "new_password": "newpass99"},
        ).status_code
        == 204
    )
    assert (
        client.post(
            "/api/v1/auth/login", json={"phone": OWNER, "password": "secret123"}
        ).status_code
        == 401
    )
    login(client, OWNER, "newpass99")

    assert (
        owner.put("/api/v1/me/pin", json={"password": "newpass99", "pin": "7391"}).status_code
        == 204
    )
    assert (
        client.post("/api/v1/auth/pin-login", json={"phone": OWNER, "pin": "7391"}).status_code
        == 200
    )
    owner.put("/api/v1/me/pin", json={"password": "newpass99", "pin": "8246"})
    owner.put("/api/v1/me/pin", json={"password": "newpass99", "pin": None})

    h = owner.get("/api/v1/credentials/history").json()
    got = [(x["kind"], x["action"], x["by_kind"]) for x in h]
    assert got == [
        ("pin", "removed", "self"),
        ("pin", "changed", "self"),
        ("pin", "set", "self"),
        ("password", "changed", "self"),
    ]
    # the values are never in it
    text = json.dumps(h)
    for secret in ("newpass99", "secret123", "7391", "8246"):
        assert secret not in text


def test_owner_resets_staff_and_staff_sees_own(client, owner):
    staff = _staff(owner)
    owner.patch(f"/api/v1/staff/{staff['id']}", json={"password": "reset1234", "pin": "4321"})
    s = login(client, STAFF, "reset1234")
    mine = s.get("/api/v1/credentials/history").json()
    assert {(x["kind"], x["action"], x["by_kind"]) for x in mine} == {
        ("password", "reset", "owner"),
        ("pin", "reset", "owner"),
    }
    assert all(x["user_id"] == staff["id"] for x in mine)
    assert mine[0]["by_name"] == "Owner"
    # the owner sees everyone's
    s.put("/api/v1/me/password", json={"current_password": "reset1234", "new_password": "mine5678"})
    allh = owner.get("/api/v1/credentials/history").json()
    assert any(x["by_kind"] == "self" and x["user_id"] == staff["id"] for x in allh)


def test_super_admin_resets_password_and_pin(client, owner, other_owner, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "superuser_phones", OWNER, raising=False)
    shops = owner.get("/api/v1/admin/shops").json()
    other = next(x for x in shops if x["name"] == "Other Shop")
    r = owner.post(f"/api/v1/admin/shops/{other['id']}/owner-pin", json={"pin": "2468"})
    assert r.status_code == 200, r.text
    assert (
        client.post(
            "/api/v1/auth/pin-login", json={"phone": "03119876543", "pin": "2468"}
        ).status_code
        == 200
    )
    owner.post(f"/api/v1/admin/shops/{other['id']}/owner-password", json={"password": "fromadmin1"})
    login(client, "03119876543", "fromadmin1")
    h = owner.get(f"/api/v1/admin/shops/{other['id']}/credential-history").json()
    got = [(x["kind"], x["action"], x["by_kind"]) for x in h]
    assert ("password", "reset", "super_admin") in got and ("pin", "reset", "super_admin") in got
    assert all(x["by_name"] is None for x in h)  # the super admin is not named to the shop
    # the shop owner sees it too, without the values
    assert ("pin", "reset", "super_admin") in [
        (x["kind"], x["action"], x["by_kind"])
        for x in other_owner.get("/api/v1/credentials/history").json()
    ]
    # a shop owner is not a super admin
    assert (
        other_owner.get(f"/api/v1/admin/shops/{other['id']}/credential-history").status_code == 403
    )
