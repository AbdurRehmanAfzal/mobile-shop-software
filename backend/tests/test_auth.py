"""FR-AUTH-01, FR-AUTH-02: signup creates org + shop + owner; login/refresh/me."""

from tests.conftest import login, signup


def test_signup_creates_shop_and_owner(client):
    actor = signup(
        client, phone="+92 300 1234567", shop_name="Ali Mobiles", shop_name_ur="علی موبائلز"
    )
    assert actor.me["user"]["role"] == "owner"
    assert actor.me["user"]["phone"] == "03001234567"  # normalised
    assert len(actor.me["shops"]) == 1
    assert actor.me["shops"][0]["name_ur"] == "علی موبائلز"
    assert actor.me["active_shop_id"] == actor.me["shops"][0]["id"]


def test_signup_duplicate_phone_is_conflict(client):
    signup(client)
    r = client.post(
        "/api/v1/auth/signup",
        json={
            "shop_name": "Second Shop",
            "owner_name": "Yusuf",
            "phone": "03001234567",
            "password": "secret123",
        },
    )
    assert r.status_code == 409
    body = r.json()["error"]
    assert body["code"] == "phone_taken"
    assert body["message_ur"]  # bilingual error present


def test_signup_rejects_bad_phone(client):
    r = client.post(
        "/api/v1/auth/signup",
        json={
            "shop_name": "Second Shop",
            "owner_name": "Yusuf",
            "phone": "12345",
            "password": "secret123",
        },
    )
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "validation_failed"


def test_login_and_me(client):
    signup(client)
    actor = login(client, "03001234567")
    r = actor.get("/api/v1/me")
    assert r.status_code == 200
    assert r.json()["user"]["name"] == "Owner"


def test_login_wrong_password(client):
    signup(client)
    r = client.post("/api/v1/auth/login", json={"phone": "03001234567", "password": "nope-nope"})
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "bad_credentials"


def test_refresh_returns_new_pair(client, owner):
    r = client.post("/api/v1/auth/refresh", json={"refresh_token": owner.refresh})
    assert r.status_code == 200
    assert r.json()["access_token"]


def test_access_token_cannot_be_used_as_refresh(client, owner):
    r = client.post("/api/v1/auth/refresh", json={"refresh_token": owner.access})
    assert r.status_code == 401


def test_protected_route_requires_token(client):
    assert client.get("/api/v1/me").status_code == 401
    assert client.get("/api/v1/shops/current").status_code == 401
