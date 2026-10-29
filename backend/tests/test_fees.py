"""Owner (2026-10-29): software fees paid by hand into the product owner's accounts, reported by the
shop with a reference / screenshot, approved by the super admin (plan extended) or rejected."""

from app.modules.notifications.models import Message
from tests.conftest import login, signup

SUPER = "03990000099"


def _admin(client, monkeypatch):
    monkeypatch.setattr("app.core.config.settings.superuser_phones", SUPER, raising=False)
    signup(client, shop_name="OOP Admin", owner_name="Product Owner", phone=SUPER)
    return login(client, SUPER)


def test_fee_flow(client, owner, db, monkeypatch):
    admin = _admin(client, monkeypatch)
    # the product owner's accounts, entered in the app (never in code)
    accts = [
        {"label": "Easypaisa", "account_name": "A R Afzal", "number": "03XXXXXXXXX", "note": None},
        {
            "label": "Meezan Bank",
            "account_name": "A R Afzal",
            "number": "PK00MEZN0000000000000000",
            "note": "IBAN",
        },
    ]
    assert admin.put("/api/v1/admin/payment-accounts", json=accts).status_code == 200
    admin.patch(
        f"/api/v1/admin/shops/{owner.shop_id}/plan", json={"plan": "basic", "monthly_fee": 2500}
    )

    # the shop owner sees the accounts and reports a payment
    r = owner.get("/api/v1/fees")
    assert r.status_code == 200
    assert [a["label"] for a in r.json()["accounts"]] == ["Easypaisa", "Meezan Bank"]
    assert r.json()["plan"]["monthly_fee"] == "2500.00" and r.json()["payments"] == []
    r = owner.post(
        "/api/v1/fees",
        json={"amount": 2500, "method": "Easypaisa", "reference": "TID 123456", "months": 1},
    )
    assert r.status_code == 201, r.text
    pid = r.json()["id"]
    assert r.json()["status"] == "pending"
    # staff may not
    owner.post(
        "/api/v1/staff",
        json={"name": "Staff", "phone": "03451112233", "password": "secret123", "role": "salesman"},
    )
    assert login(client, "03451112233").get("/api/v1/fees").status_code == 403

    # the super admin sees it pending, approves: plan extended by a month, owner told on WhatsApp
    pend = admin.get("/api/v1/admin/fee-payments", params={"status": "pending"}).json()
    assert (
        len(pend) == 1
        and pend[0]["shop_name"] == "Test Mobile"
        and pend[0]["reference"] == "TID 123456"
    )
    assert admin.get("/api/v1/admin/fee-stats").json()["pending"] == 1
    before = admin.get("/api/v1/admin/shops").json()
    r = admin.post(f"/api/v1/admin/fee-payments/{pid}/approve", json={})
    assert r.status_code == 200 and r.json()["status"] == "approved"
    shop = next(s for s in admin.get("/api/v1/admin/shops").json() if s["id"] == owner.shop_id)
    assert 27 <= shop["days_left"] <= 31
    assert admin.get("/api/v1/admin/fee-stats").json()["month_total"] == "2500.00"
    (m,) = db.query(Message).filter_by(template_key="fee_received").all()
    assert "Rs. 2,500" in m.body and m.recipient == "03001234567"
    assert owner.get("/api/v1/fees").json()["payments"][0]["status"] == "approved"
    # decided twice: refused
    assert admin.post(f"/api/v1/admin/fee-payments/{pid}/approve", json={}).status_code == 409

    # a wrong one is rejected with a note the owner can read
    r = owner.post("/api/v1/fees", json={"amount": 100, "method": "Cash", "months": 1})
    r = admin.post(
        f"/api/v1/admin/fee-payments/{r.json()['id']}/reject", json={"note": "Amount is 2,500"}
    )
    assert r.json()["status"] == "rejected" and r.json()["decision_note"] == "Amount is 2,500"
    assert owner.get("/api/v1/fees").json()["payments"][0]["decision_note"] == "Amount is 2,500"
    assert owner.get("/api/v1/admin/fee-payments").status_code == 403
    _ = before
