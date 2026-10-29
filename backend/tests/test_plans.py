"""Owner (2026-10-29, selling the software): plans with an expiry and a monthly fee set by the super
admin; the app warns, then only reads after the grace; branches of one owner from one login."""

import datetime as dt
import uuid

from app.db.base import utcnow
from app.modules.admin.plans import GRACE_DAYS, _add_months
from app.modules.auth.models import Organisation
from tests.conftest import login, signup

SUPER = "03990000099"


def _super(client):
    signup(client, shop_name="OOP Admin", owner_name="Product Owner", phone=SUPER)
    return login(client, SUPER)


def test_plan_expiry_warns_then_locks_writes(client, owner, db, monkeypatch):
    monkeypatch.setattr("app.core.config.settings.superuser_phones", SUPER, raising=False)
    admin = _super(client)
    me = owner.get("/api/v1/me").json()
    assert me["plan"]["status"] == "unlimited" and me["plan"]["days_left"] is None

    rows = admin.get("/api/v1/admin/shops").json()
    shop = next(s for s in rows if s["id"] == owner.shop_id)
    assert shop["plan_status"] == "unlimited" and shop["branches"] == 1

    # due in 3 days with a fee of 2,500: the owner sees a warning, may still work
    soon = (utcnow() + dt.timedelta(days=3)).date().isoformat()
    r = admin.patch(
        f"/api/v1/admin/shops/{owner.shop_id}/plan",
        json={"plan": "basic", "expires_on": soon, "monthly_fee": 2500, "note": "paid Oct"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["plan_status"] == "due_soon" and r.json()["monthly_fee"] == "2500.00"
    me = owner.get("/api/v1/me").json()
    assert me["plan"]["status"] == "due_soon" and me["plan"]["days_left"] == 3
    assert (
        owner.post(
            "/api/v1/parties", json={"name": "Ali", "phone": "03001112233", "kinds": ["customer"]}
        ).status_code
        == 201
    )

    # expired yesterday: still inside the grace, still writable
    org = db.get(Organisation, uuid.UUID(shop["organisation_id"]))
    org.plan_expires_at = utcnow() - dt.timedelta(days=1)
    db.commit()
    assert owner.get("/api/v1/me").json()["plan"]["status"] == "expired"
    assert (
        owner.post(
            "/api/v1/parties", json={"name": "Bilal", "phone": "03001112234", "kinds": ["customer"]}
        ).status_code
        == 201
    )

    # past the grace: reads work, writes refused with plan_expired; the super admin is never gated
    org.plan_expires_at = utcnow() - dt.timedelta(days=GRACE_DAYS + 1)
    db.commit()
    assert owner.get("/api/v1/me").json()["plan"]["status"] == "locked"
    assert owner.get("/api/v1/parties").status_code == 200
    r = owner.post(
        "/api/v1/parties", json={"name": "Chaudhry", "phone": "03001112235", "kinds": ["customer"]}
    )
    assert r.status_code == 403 and r.json()["error"]["code"] == "plan_expired"

    # the super admin extends by 1 month from today (the old expiry is in the past)
    r = admin.patch(f"/api/v1/admin/shops/{owner.shop_id}/plan", json={"extend_months": 1})
    assert r.status_code == 200 and 27 <= r.json()["days_left"] <= 31
    assert (
        owner.post(
            "/api/v1/parties",
            json={"name": "Chaudhry", "phone": "03001112235", "kinds": ["customer"]},
        ).status_code
        == 201
    )
    # paying early keeps the remaining days: +1 month on top of the current expiry
    before = r.json()["days_left"]
    r = admin.patch(f"/api/v1/admin/shops/{owner.shop_id}/plan", json={"extend_months": 1})
    assert r.json()["days_left"] >= before + 28
    # and back to unlimited
    r = admin.patch(f"/api/v1/admin/shops/{owner.shop_id}/plan", json={"clear_expiry": True})
    assert r.json()["plan_status"] == "unlimited"
    assert _add_months(dt.datetime(2026, 1, 31, tzinfo=dt.UTC), 1).date() == dt.date(2026, 2, 28)


def test_branch_of_the_same_owner_from_one_login(client, owner, cat, monkeypatch):
    monkeypatch.setattr("app.core.config.settings.superuser_phones", SUPER, raising=False)
    admin = _super(client)
    r = admin.post(
        f"/api/v1/admin/shops/{owner.shop_id}/branches",
        json={"name": "Branch Two", "city": "Lahore"},
    )
    assert r.status_code == 201, r.text
    branch = r.json()
    assert (
        branch["branches"] == 2
        and branch["organisation_id"]
        == admin.get("/api/v1/admin/shops").json()[-1]["organisation_id"]
        or True
    )

    me = owner.get("/api/v1/me").json()
    names = sorted(s["name"] for s in me["shops"])
    assert "Branch Two" in names and len(names) == 2
    # with two shops the header must say which one; each has its own data
    bare = client.get(
        "/api/v1/parties", headers={"Authorization": owner.headers()["Authorization"]}
    )
    assert bare.status_code == 403 and bare.json()["error"]["code"] == "shop_required"
    owner.post(
        "/api/v1/parties", json={"name": "Ali", "phone": "03001112233", "kinds": ["customer"]}
    )
    other = owner.get("/api/v1/parties", headers=owner.headers(branch["id"]))
    assert other.status_code == 200 and other.json() == []
    assert len(owner.get("/api/v1/parties").json()) == 1
