"""Owner (2026-10-29): the super admin decides a shop's modules; basics always on, the rest by plan or
by hand. The API refuses a switched-off module; the app hides it."""

from app.modules.admin.modules import MODULES, PLAN_DEFAULTS, effective, module_for
from tests.conftest import login, signup

SUPER = "03990000099"


def _admin(client, monkeypatch):
    monkeypatch.setattr("app.core.config.settings.superuser_phones", SUPER, raising=False)
    signup(client, shop_name="OOP Admin", owner_name="Product Owner", phone=SUPER)
    return login(client, SUPER)


def test_catalogue_and_route_mapping():
    assert set(PLAN_DEFAULTS["trial"]) == set(MODULES) == set(PLAN_DEFAULTS["chain"])
    assert "repairs" not in PLAN_DEFAULTS["basic"] and "repairs" in PLAN_DEFAULTS["pro"]
    assert module_for("/api/v1/repairs/abc/job-sheet") == "repairs"
    assert module_for("/api/v1/sales/held") == "held_sales" and module_for("/api/v1/sales") is None
    assert module_for("/api/v1/reports/dashboard") is None
    assert module_for("/api/v1/reports/profit-loss") == "reports"


def test_modules_follow_the_plan_unless_set_by_hand(client, owner, monkeypatch):
    admin = _admin(client, monkeypatch)
    me = owner.get("/api/v1/me").json()
    assert set(me["plan"]["modules"]) == set(MODULES) and me["plan"]["modules_custom"] is False

    # basic plan: repairs off -> the owner's repairs calls are refused, basics still work
    admin.patch(f"/api/v1/admin/shops/{owner.shop_id}/plan", json={"plan": "basic"})
    me = owner.get("/api/v1/me").json()
    assert "repairs" not in me["plan"]["modules"] and "accessories" in me["plan"]["modules"]
    r = owner.get("/api/v1/repairs")
    assert r.status_code == 403 and r.json()["error"]["code"] == "module_off"
    assert owner.get("/api/v1/reports/profit-loss").status_code == 403
    assert owner.get("/api/v1/reports/dashboard").status_code == 200
    assert owner.get("/api/v1/parties").status_code == 200
    # the super admin is never gated, even inside that shop
    assert admin.get("/api/v1/repairs", shop_id=owner.shop_id).status_code == 200

    # by hand: repairs on, accessories off
    r = admin.patch(
        f"/api/v1/admin/shops/{owner.shop_id}/modules",
        json={"modules": ["repairs", "expenses", "bogus"]},
    )
    assert r.status_code == 200 and r.json()["modules"] == ["repairs", "expenses"]
    assert r.json()["modules_custom"] is True
    assert owner.get("/api/v1/repairs").status_code == 200
    assert owner.get("/api/v1/accessories").status_code == 403
    # back to the plan
    r = admin.patch(f"/api/v1/admin/shops/{owner.shop_id}/modules", json={"modules": None})
    assert r.json()["modules_custom"] is False and "repairs" not in r.json()["modules"]

    # a new shop opened on the pro plan with a hand-picked list
    r = admin.post(
        "/api/v1/admin/shops",
        json={
            "shop_name": "Pro Mobiles",
            "owner_name": "Pro Owner",
            "phone": "03451234567",
            "password": "pro12345",
            "plan": "pro",
            "modules": ["repairs", "reports"],
        },
    )
    assert r.status_code == 201, r.text
    assert r.json()["plan"] == "pro" and r.json()["modules"] == ["repairs", "reports"]
    pro = login(client, "03451234567", "pro12345")
    assert pro.get("/api/v1/repairs").status_code == 200
    assert pro.get("/api/v1/expenses").status_code == 403
    cat = admin.get("/api/v1/admin/modules").json()
    assert set(cat["modules"]) == set(MODULES) and cat["plans"]["basic"] == PLAN_DEFAULTS["basic"]
    from app.modules.auth.models import Organisation

    assert effective(Organisation(plan="chain")) == list(MODULES)
