"""FR-AUTH-04: quick PIN login with lockout."""

from app.core.ratelimit import login_limiter


def test_set_pin_and_login(client, owner):
    login_limiter._fails.clear()
    assert owner.me["user"]["has_pin"] is False
    r = owner.client.put(
        "/api/v1/me/pin", headers=owner.headers(), json={"password": "wrong-pass", "pin": "12345"}
    )
    assert r.status_code == 401
    r = owner.client.put(
        "/api/v1/me/pin", headers=owner.headers(), json={"password": "secret123", "pin": "12345"}
    )
    assert r.status_code == 204
    r = client.post("/api/v1/auth/pin-login", json={"phone": "03001234567", "pin": "12345"})
    assert r.status_code == 200 and r.json()["me"]["user"]["has_pin"] is True
    assert (
        client.post(
            "/api/v1/auth/pin-login", json={"phone": "03001234567", "pin": "123"}
        ).status_code
        == 422
    )


def test_pin_lockout_after_five_failures(client, owner):
    login_limiter._fails.clear()
    owner.client.put(
        "/api/v1/me/pin", headers=owner.headers(), json={"password": "secret123", "pin": "12345"}
    )
    for _ in range(5):
        assert (
            client.post(
                "/api/v1/auth/pin-login", json={"phone": "03001234567", "pin": "99999"}
            ).status_code
            == 401
        )
    r = client.post("/api/v1/auth/pin-login", json={"phone": "03001234567", "pin": "12345"})
    assert r.status_code == 429 and r.json()["error"]["code"] == "too_many_attempts"
    login_limiter._fails.clear()
