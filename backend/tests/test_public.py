"""Owner (2026-10-29): the landing page — public info (plans, prices, modules, accounts) and the
"open a shop for me" request that reaches the product owner."""

from app.modules.notifications.models import Message
from tests.conftest import login, signup

SUPER = "03990000099"


def test_public_info_and_shop_request(client, db, monkeypatch):
    monkeypatch.setattr("app.core.config.settings.superuser_phones", SUPER, raising=False)
    signup(client, shop_name="OOP Admin", owner_name="Product Owner", phone=SUPER)
    admin = login(client, SUPER)
    admin.put(
        "/api/v1/admin/payment-accounts",
        json=[{"label": "Easypaisa", "account_name": "X", "number": "03001234567", "note": None}],
    )

    info = client.get("/api/v1/public/info").json()
    assert {p["key"]: p["price"] for p in info["plans"]} == {
        "trial": 0,
        "basic": 1500,
        "pro": 3000,
        "chain": 6000,
    }
    assert info["trial_days"] == 14 and "repairs" in info["modules"]
    assert info["accounts"][0]["label"] == "Easypaisa" and info["whatsapp"] == SUPER

    r = client.post(
        "/api/v1/public/shop-requests",
        json={
            "name": "Hamza Iqbal",
            "shop_name": "Hamza Mobile Centre",
            "city": "Multan",
            "phone": "0300 1112233",
            "plan": "pro",
        },
    )
    assert r.status_code == 201, r.text
    reqs = admin.get("/api/v1/admin/shop-requests").json()
    assert len(reqs) == 1 and reqs[0]["phone"] == "03001112233" and reqs[0]["plan"] == "pro"
    (m,) = db.query(Message).filter_by(template_key="shop_request_admin").all()
    assert m.recipient == SUPER and "Hamza Mobile Centre" in m.body and m.audience == "admin"

    # opening the shop from the request closes it
    r = admin.post(
        "/api/v1/admin/shops",
        json={
            "shop_name": "Hamza Mobile Centre",
            "owner_name": "Hamza Iqbal",
            "phone": "03001112233",
            "password": "hamza1234",
            "plan": "pro",
            "request_id": reqs[0]["id"],
        },
    )
    assert r.status_code == 201, r.text
    assert admin.get("/api/v1/admin/shop-requests").json() == []
    assert (
        client.post(
            "/api/v1/public/shop-requests",
            json={"name": "X Y", "shop_name": "Z Shop", "phone": "123"},
        ).status_code
        == 422
    )
    assert client.get("/api/v1/admin/shop-requests").status_code in (401, 403)
