"""Owner (2026-10-26): only the product owner (super user) opens shops; no public signup."""

from app.core.config import settings
from tests.conftest import login, signup


def test_public_signup_is_closed_unless_switched_on(client):
    settings.public_signup = False
    try:
        r = client.post(
            "/api/v1/auth/signup",
            json={
                "shop_name": "Nope",
                "owner_name": "Xavier",
                "phone": "03111111111",
                "password": "secret123",
            },
        )
        assert r.status_code == 403 and r.json()["error"]["code"] == "signup_closed"
    finally:
        settings.public_signup = True


def test_super_user_lists_and_opens_shops(client):
    boss = signup(client, phone="03001234567", shop_name="OOP Demo")
    other = signup(client, phone="03119876543", shop_name="Other Shop")
    old = settings.superuser_phones
    settings.superuser_phones = "0300-1234567"
    try:
        assert boss.get("/api/v1/me").json()["user"]["is_superuser"] is True
        assert other.get("/api/v1/me").json()["user"]["is_superuser"] is False
        # not a super user -> refused
        r = other.get("/api/v1/admin/shops")
        assert r.status_code == 403 and r.json()["error"]["code"] == "superuser_only"
        # super user opens a shop for a customer, with signup closed for everyone else
        settings.public_signup = False
        r = boss.post(
            "/api/v1/admin/shops",
            json={
                "shop_name": "Bilal Mobiles",
                "city": "Lahore",
                "owner_name": "Bilal",
                "phone": "03215550099",
                "password": "bilal1234",
            },
        )
        assert r.status_code == 201, r.text
        assert r.json()["owner_phone"] == "03215550099" and r.json()["name"] == "Bilal Mobiles"
        names = [s["name"] for s in boss.get("/api/v1/admin/shops").json()]
        assert {"Bilal Mobiles", "OOP Demo", "Other Shop"} <= set(names)
        # the customer logs in to their own shop only
        bilal = login(client, "03215550099", "bilal1234")
        me = bilal.get("/api/v1/me").json()
        assert [s["name"] for s in me["shops"]] == ["Bilal Mobiles"] and me["user"][
            "role"
        ] == "owner"
        # same phone twice is refused
        r = boss.post(
            "/api/v1/admin/shops",
            json={
                "shop_name": "Dup",
                "owner_name": "Bilal Two",
                "phone": "03215550099",
                "password": "x1234567",
            },
        )
        assert r.status_code == 409
    finally:
        settings.superuser_phones = old
        settings.public_signup = True
