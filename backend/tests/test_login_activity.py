"""Owner 2026-11-14 (ADR-074): every sign-in is a login session (who, how, IP, browser, started,
last used, ended). The owner sees them and ends one only when the super admin switches on the
"login_activity" module; an ended login stops at its next request and cannot be renewed."""

from app.core.security import create_token, decode_token
from tests.conftest import login
from tests.test_modules import _admin


def _sales(client, owner):
    owner.post(
        "/api/v1/staff",
        json={
            "name": "Sales Boy",
            "phone": "03451119900",
            "password": "secret123",
            "role": "salesman",
        },
    )
    return login(client, "03451119900")


def test_sessions_hidden_until_the_super_admin_allows(client, owner, monkeypatch):
    s = _sales(client, owner)
    assert s.get("/api/v1/me").status_code == 200
    # recorded always, shown only with the module
    r = owner.get("/api/v1/login-activity")
    assert r.status_code == 403 and r.json()["error"]["code"] == "module_off"
    admin = _admin(client, monkeypatch)
    mods = owner.get("/api/v1/me").json()["plan"]["modules"]
    r = admin.patch(
        f"/api/v1/admin/shops/{owner.shop_id}/modules",
        json={"modules": [*mods, "login_activity"]},
    )
    assert r.status_code == 200, r.text
    rows = owner.get("/api/v1/login-activity").json()
    names = {x["user_name"] for x in rows}
    assert "Sales Boy" in names
    row = next(x for x in rows if x["user_name"] == "Sales Boy")
    assert row["method"] == "password" and row["ended_at"] is None and row["online"] is True
    assert any(x["this_device"] for x in rows)
    # a salesman cannot see it
    assert s.get("/api/v1/login-activity").status_code == 403

    # the owner ends the salesman's login: his next call and his refresh are refused
    r = owner.post(f"/api/v1/login-activity/{row['id']}/end")
    assert r.status_code == 200, r.text
    r = s.get("/api/v1/me")
    assert r.status_code == 401 and r.json()["error"]["code"] == "session_ended"
    r = client.post("/api/v1/auth/refresh", json={"refresh_token": s.refresh})
    assert r.status_code == 401 and r.json()["error"]["code"] == "session_ended"
    # he logs in again: a new session
    s2 = login(client, "03451119900")
    assert s2.get("/api/v1/me").status_code == 200


def test_refresh_keeps_the_session_and_old_tokens_get_one(client, owner):
    r = client.post("/api/v1/auth/refresh", json={"refresh_token": owner.refresh})
    assert r.status_code == 200, r.text
    # a token from before sessions existed (no sid) still refreshes, and starts a session
    claims = decode_token(owner.access, "access")
    old = create_token(claims["sub"], claims["org"], "refresh")
    r = client.post("/api/v1/auth/refresh", json={"refresh_token": old})
    assert r.status_code == 200, r.text


def test_logout_ends_this_login(client, owner):
    s = _sales(client, owner)
    assert s.post("/api/v1/auth/logout").status_code == 204
    assert s.get("/api/v1/me").status_code == 401


def test_times_carry_utc(client, owner, monkeypatch):
    """the list's times say they are UTC, so the browser shows "just now", not hours off"""
    admin = _admin(client, monkeypatch)
    mods = owner.get("/api/v1/me").json()["plan"]["modules"]
    admin.patch(
        f"/api/v1/admin/shops/{owner.shop_id}/modules",
        json={"modules": [*mods, "login_activity"]},
    )
    row = owner.get("/api/v1/login-activity").json()[0]
    assert row["last_seen_at"].endswith(("Z", "+00:00")) and row["started_at"].endswith(
        ("Z", "+00:00")
    )
