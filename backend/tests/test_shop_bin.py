"""Owner (2026-11-09, ADR-054): the super admin deletes a customer into the bin. Nobody of theirs can
sign in or use the app, it leaves the lists; nothing is removed and a restore brings it all back."""

from tests.conftest import login, signup

SUPER = "03990000099"


def _admin(client, monkeypatch):
    monkeypatch.setattr("app.core.config.settings.superuser_phones", SUPER, raising=False)
    signup(client, shop_name="OOP Admin", owner_name="Product Owner", phone=SUPER)
    return login(client, SUPER)


def _ids(admin, **params):
    return {s["id"] for s in admin.get("/api/v1/admin/shops", params=params).json()}


def test_delete_to_bin_and_restore(client, owner, monkeypatch):
    admin = _admin(client, monkeypatch)
    sid = str(owner.shop_id)
    party = owner.post(
        "/api/v1/parties", json={"name": "Ali", "kinds": ["customer"], "phone": "03211111111"}
    )
    assert party.status_code == 201, party.text

    # only the provider, and only with the shop's name typed again
    assert (
        owner.post(
            f"/api/v1/admin/shops/{sid}/delete", json={"confirm_name": "Test Mobile"}
        ).status_code
        == 403
    )
    r = admin.post(f"/api/v1/admin/shops/{sid}/delete", json={"confirm_name": "Wrong"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "confirm_name"
    r = admin.post(
        f"/api/v1/admin/shops/{sid}/delete",
        json={"confirm_name": "  test mobile ", "reason": "closed the shop"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["deleted_at"] and r.json()["deleted_reason"] == "closed the shop"
    assert (
        admin.post(
            f"/api/v1/admin/shops/{sid}/delete", json={"confirm_name": "Test Mobile"}
        ).status_code
        == 409
    )

    # out of the list, in the bin
    assert sid not in _ids(admin)
    assert sid in _ids(admin, deleted="true")
    # the shop's own tokens stop working and it cannot sign in again
    r = owner.get("/api/v1/parties")
    assert r.status_code == 401 and r.json()["error"]["code"] == "shop_closed"
    r = client.post("/api/v1/auth/login", json={"phone": "03001234567", "password": "secret123"})
    assert r.status_code == 401 and r.json()["error"]["code"] == "shop_closed"
    r = client.post("/api/v1/auth/refresh", json={"refresh_token": owner.refresh})
    assert r.status_code == 401
    # the provider cannot open it either
    assert admin.post(f"/api/v1/admin/shops/{sid}/enter").status_code == 404

    # restore: everything is back as it was
    r = admin.post(f"/api/v1/admin/shops/{sid}/restore")
    assert r.status_code == 200 and r.json()["deleted_at"] is None
    assert sid in _ids(admin) and sid not in _ids(admin, deleted="true")
    back = login(client, "03001234567")
    names = [p["name"] for p in back.get("/api/v1/parties").json()]
    assert "Ali" in names
    assert admin.post(f"/api/v1/admin/shops/{sid}/restore").status_code == 409


def test_own_shop_never_deleted(client, monkeypatch):
    admin = _admin(client, monkeypatch)
    r = admin.post(
        f"/api/v1/admin/shops/{admin.shop_id}/delete", json={"confirm_name": "OOP Admin"}
    )
    assert r.status_code == 403 and r.json()["error"]["code"] == "own_shop"
