"""Owner (2026-10-28): fingerprint login on the app and the website, for the owner; the owner may
allow the staff too. A removed key stops working."""

from tests.conftest import login


def _staff(client, owner, phone="03451112288"):
    owner.post(
        "/api/v1/staff",
        json={"name": "Kashif", "phone": phone, "password": "secret123", "role": "salesman"},
    )
    return login(client, phone)


def test_owner_app_fingerprint_login_and_remove(client, owner):
    st = owner.get("/api/v1/auth/fingerprint").json()
    assert st["allowed"] is True and st["keys"] == []
    k = owner.post("/api/v1/auth/fingerprint/device", json={"name": "Owner's Samsung"})
    assert k.status_code == 201, k.text
    key = k.json()
    r = client.post("/api/v1/auth/fingerprint/device-login", json=key)
    assert r.status_code == 200 and r.json()["me"]["user"]["phone"] == owner.me["user"]["phone"]
    assert r.json()["tokens"]["access_token"]
    # a wrong secret is refused
    bad = client.post("/api/v1/auth/fingerprint/device-login", json={**key, "secret": "x" * 43})
    assert bad.status_code == 401
    # removed: that phone can no longer log in with the fingerprint
    keys = owner.get("/api/v1/auth/fingerprint").json()["keys"]
    assert [x["name"] for x in keys] == ["Owner's Samsung"]
    assert owner.delete(f"/api/v1/auth/fingerprint/keys/{keys[0]['id']}").status_code == 204
    assert client.post("/api/v1/auth/fingerprint/device-login", json=key).status_code == 401


def test_staff_only_when_the_owner_allows(client, owner):
    s = _staff(client, owner)
    assert s.get("/api/v1/auth/fingerprint").json()["allowed"] is False
    assert s.post("/api/v1/auth/fingerprint/device", json={}).status_code == 403
    assert s.post("/api/v1/auth/passkey/register-options").status_code == 403

    r = owner.patch("/api/v1/shops/current", json={"fingerprint_staff": True})
    assert r.status_code == 200 and r.json()["fingerprint_staff"] is True
    key = s.post("/api/v1/auth/fingerprint/device", json={"name": "Kashif phone"}).json()
    assert client.post("/api/v1/auth/fingerprint/device-login", json=key).status_code == 200
    # the owner sees the staff's key and can remove it
    keys = owner.get("/api/v1/auth/fingerprint").json()["keys"]
    assert any(x["name"] == "Kashif phone" for x in keys)

    # switched off again: the staff key stops working at once
    owner.patch("/api/v1/shops/current", json={"fingerprint_staff": False})
    assert client.post("/api/v1/auth/fingerprint/device-login", json=key).status_code == 403


def test_passkey_options_for_the_website(client, owner):
    o = owner.post("/api/v1/auth/passkey/register-options").json()
    assert o["options"]["rp"]["id"] == "localhost" and o["token"]
    assert o["options"]["authenticatorSelection"]["userVerification"] == "required"
    lo = client.post("/api/v1/auth/passkey/login-options").json()
    assert lo["options"]["challenge"] and lo["token"]
    # an unknown credential is refused
    r = client.post(
        "/api/v1/auth/passkey/login", json={"credential": {"id": "nope"}, "token": lo["token"]}
    )
    assert r.status_code == 401 and r.json()["error"]["code"] == "fingerprint_failed"
