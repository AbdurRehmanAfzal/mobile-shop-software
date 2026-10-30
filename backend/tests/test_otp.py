"""Owner (2026-10-30): a code on WhatsApp resets a forgotten password by oneself; with SIGNUP_OTP the
public signup proves the number first. Here the dev echo stands in for WhatsApp."""

import pytest

from app.core.config import settings
from app.modules.otp import service as otp


@pytest.fixture(autouse=True)
def _echo(monkeypatch):
    monkeypatch.setattr(settings, "otp_dev_echo", True)
    otp.send_limiter._fails.clear()


def test_reset_password_with_otp(client, owner):
    phone = owner.me["user"]["phone"]
    # unknown number: nothing is sent, nothing is revealed
    assert client.post(
        "/api/v1/auth/otp/send", json={"phone": "03009998877", "purpose": "reset"}
    ).json() == {"delivery": "unknown"}
    r = client.post("/api/v1/auth/otp/send", json={"phone": phone, "purpose": "reset"})
    assert r.status_code == 200 and r.json()["delivery"] == "echo"
    code = r.json()["dev_code"]
    # a wrong code is refused; the right one gives a token
    bad = client.post(
        "/api/v1/auth/otp/verify", json={"phone": phone, "purpose": "reset", "code": "000000"}
    )
    assert bad.status_code == 400 and bad.json()["error"]["code"] == "otp_invalid"
    r = client.post(
        "/api/v1/auth/otp/verify", json={"phone": phone, "purpose": "reset", "code": code}
    )
    assert r.status_code == 200, r.text
    token = r.json()["otp_token"]
    # the code is burnt
    assert (
        client.post(
            "/api/v1/auth/otp/verify", json={"phone": phone, "purpose": "reset", "code": code}
        ).status_code
        == 400
    )
    # a forged token is refused; the real one sets the password and logs in
    r = client.post(
        "/api/v1/auth/reset-password",
        json={"phone": phone, "otp_token": "1.deadbeef", "password": "newpass123"},
    )
    assert r.status_code == 400
    r = client.post(
        "/api/v1/auth/reset-password",
        json={"phone": phone, "otp_token": token, "password": "newpass123"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["tokens"]["access_token"]
    assert (
        client.post(
            "/api/v1/auth/login", json={"phone": phone, "password": "secret123"}
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/api/v1/auth/login", json={"phone": phone, "password": "newpass123"}
        ).status_code
        == 200
    )
    # the token is single-purpose: it cannot be used again
    assert (
        client.post(
            "/api/v1/auth/reset-password",
            json={"phone": phone, "otp_token": token, "password": "another1"},
        ).status_code
        == 400
    )


def test_send_limit_and_attempts(client, owner):
    phone = owner.me["user"]["phone"]
    for _ in range(3):
        assert (
            client.post(
                "/api/v1/auth/otp/send", json={"phone": phone, "purpose": "reset"}
            ).status_code
            == 200
        )
    assert (
        client.post("/api/v1/auth/otp/send", json={"phone": phone, "purpose": "reset"}).status_code
        == 429
    )
    for _ in range(5):
        client.post(
            "/api/v1/auth/otp/verify", json={"phone": phone, "purpose": "reset", "code": "111111"}
        )
    # five wrong tries kill the code even if the sixth is right
    otp.send_limiter._fails.clear()
    assert (
        client.post(
            "/api/v1/auth/otp/verify", json={"phone": phone, "purpose": "reset", "code": "111111"}
        ).status_code
        == 400
    )


def test_signup_needs_otp_when_switched_on(client, monkeypatch):
    monkeypatch.setattr(settings, "signup_otp", True)
    body = {
        "shop_name": "OTP Shop",
        "owner_name": "Owner",
        "phone": "03127654321",
        "password": "secret123",
    }
    r = client.post("/api/v1/auth/signup", json=body)
    assert r.status_code == 400 and r.json()["error"]["code"] == "otp_required"
    code = client.post(
        "/api/v1/auth/otp/send", json={"phone": "03127654321", "purpose": "signup"}
    ).json()["dev_code"]
    token = client.post(
        "/api/v1/auth/otp/verify", json={"phone": "03127654321", "purpose": "signup", "code": code}
    ).json()["otp_token"]
    r = client.post("/api/v1/auth/signup", json={**body, "otp_token": token})
    assert r.status_code == 201, r.text
    # a registered number cannot ask for a signup code
    assert client.post(
        "/api/v1/auth/otp/send", json={"phone": "03127654321", "purpose": "signup"}
    ).json() == {"delivery": "registered"}


def test_no_sender_means_no_code(client, owner, monkeypatch):
    monkeypatch.setattr(settings, "otp_dev_echo", False)
    r = client.post(
        "/api/v1/auth/otp/send", json={"phone": owner.me["user"]["phone"], "purpose": "reset"}
    )
    assert r.json() == {"delivery": "none"}
