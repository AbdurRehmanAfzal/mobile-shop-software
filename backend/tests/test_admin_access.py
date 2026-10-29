"""Owner (2026-10-29): the super admin opens any shop and sets a forgotten owner password; forgot
requests from the login page reach the product owner (owner) or the shop owner (staff)."""

from app.modules.notifications.models import Message
from tests.conftest import login, signup

SUPER = "03990000099"


def _admin(client, monkeypatch):
    monkeypatch.setattr("app.core.config.settings.superuser_phones", SUPER, raising=False)
    signup(client, shop_name="OOP Admin", owner_name="Product Owner", phone=SUPER)
    return login(client, SUPER)


def test_super_admin_opens_any_shop_and_sets_the_owner_password(
    client, owner, other_owner, monkeypatch
):
    admin = _admin(client, monkeypatch)
    owner.post(
        "/api/v1/parties", json={"name": "Ali", "phone": "03001112233", "kinds": ["customer"]}
    )

    # an ordinary owner may not look into another shop; the super admin may
    assert other_owner.get("/api/v1/parties", shop_id=owner.shop_id).status_code == 403
    r = admin.post(f"/api/v1/admin/shops/{owner.shop_id}/enter")
    assert r.status_code == 200 and r.json()["name"] == "Test Mobile"
    assert [p["name"] for p in admin.get("/api/v1/parties", shop_id=owner.shop_id).json()] == [
        "Ali"
    ]
    me = admin.get("/api/v1/me", shop_id=owner.shop_id).json()
    assert me["active_shop_id"] == owner.shop_id and any(
        s["id"] == owner.shop_id for s in me["shops"]
    )
    audit = admin.get("/api/v1/audit", shop_id=owner.shop_id)
    assert audit.status_code in (200, 403)

    # the owner forgot the password: request + message to the product owner; a new password works
    r = client.post("/api/v1/auth/forgot", json={"phone": "03001234567"})
    assert r.status_code == 200 and r.json() == {"to": "admin"}
    reqs = admin.get("/api/v1/admin/password-requests").json()
    assert len(reqs) == 1 and reqs[0]["phone"] == "03001234567" and reqs[0]["handled_at"] is None
    r = admin.post(
        f"/api/v1/admin/shops/{owner.shop_id}/owner-password", json={"password": "newpass123"}
    )
    assert r.status_code == 200 and r.json()["phone"] == "03001234567"
    assert (
        client.post(
            "/api/v1/auth/login", json={"phone": "03001234567", "password": "secret123"}
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/api/v1/auth/login", json={"phone": "03001234567", "password": "newpass123"}
        ).status_code
        == 200
    )
    assert admin.get("/api/v1/admin/password-requests").json() == []
    assert (
        len(admin.get("/api/v1/admin/password-requests", params={"open_only": "false"}).json()) == 1
    )
    # an unknown number says nothing useful; an ordinary owner cannot use the admin routes
    assert client.post("/api/v1/auth/forgot", json={"phone": "03009999999"}).json() == {
        "to": "none"
    }
    assert owner.get("/api/v1/admin/password-requests").status_code == 403


def test_staff_forgot_goes_to_the_shop_owner(client, owner, db):
    owner.post(
        "/api/v1/staff",
        json={
            "name": "Sales Guy",
            "phone": "03451112233",
            "password": "secret123",
            "role": "salesman",
        },
    )
    r = client.post("/api/v1/auth/forgot", json={"phone": "03451112233"})
    assert r.json() == {"to": "owner"}
    (m,) = db.query(Message).filter_by(template_key="password_request_owner").all()
    assert m.recipient == "03001234567" and m.audience == "owner" and "Sales Guy" in m.body
    # the owner resets it from Staff, as before
    staff = next(u for u in owner.get("/api/v1/staff").json() if u["phone"] == "03451112233")
    assert (
        owner.patch(f"/api/v1/staff/{staff['id']}", json={"password": "fresh123"}).status_code
        == 200
    )
    assert (
        client.post(
            "/api/v1/auth/login", json={"phone": "03451112233", "password": "fresh123"}
        ).status_code
        == 200
    )
