"""Owner 2026-11-17 (ADR-095): on the fees page the shop sees the packages, the modules it can add
and the durations (1 month, 1–5 years; 5 % off for every year). The server works out the total; the
order rides on the payment and reaches the shop only when the provider approves it."""

from decimal import Decimal

from tests.conftest import login, signup

SUPER = "03990000099"


def _admin(client, monkeypatch):
    monkeypatch.setattr("app.core.config.settings.superuser_phones", SUPER, raising=False)
    signup(client, shop_name="OOP Admin", owner_name="Product Owner", phone=SUPER)
    return login(client, SUPER)


def _plan(owner):
    return owner.get("/api/v1/fees").json()["plan"]


def test_catalog_and_the_discount_by_years(client, owner, monkeypatch):
    admin = _admin(client, monkeypatch)
    admin.patch(
        f"/api/v1/admin/shops/{owner.shop_id}/plan", json={"plan": "basic", "monthly_fee": 1500}
    )
    cat = owner.get("/api/v1/fees/catalog").json()
    packs = {p["key"]: p for p in cat["packages"]}
    # its own package at its own agreed fee, the others at the list price
    assert Decimal(packs["basic"]["price"]) == 1500 and packs["basic"]["current"] is True
    assert Decimal(packs["pro"]["price"]) == 5000 and Decimal(packs["chain"]["price"]) == 7500
    assert "repairs" in packs["pro"]["modules"] and "repairs" not in packs["basic"]["modules"]
    assert [(d["months"], d["discount_pct"]) for d in cat["durations"]] == [
        (1, 0),
        (12, 5),
        (24, 10),
        (36, 15),
        (48, 20),
        (60, 25),
    ]
    mods = {m["key"]: Decimal(m["price"]) for m in cat["modules"]}
    assert mods["repairs"] == 500 and mods["login_activity"] == 0
    assert len(cat["addons"]) == 4

    def q(**kw):
        body = {"plan": "pro", "modules": [], "addons": [], "months": 1, **kw}
        r = owner.post("/api/v1/fees/quote", json=body)
        assert r.status_code == 200, r.text
        return r.json()

    # five years of Pro: 5,000 x 60 = 300,000, less 25 % = 225,000
    five = q(months=60)
    assert Decimal(five["recurring"]) == 300000 and five["discount_pct"] == 25
    assert Decimal(five["discount"]) == 75000 and Decimal(five["total"]) == 225000
    # one month has no discount
    assert Decimal(q()["total"]) == 5000
    # Basic kept, repairs added, one year: (1,500 + 500) x 12 = 24,000 less 5 %
    one = q(plan="basic", modules=["repairs", "tax"], months=12)
    assert one["extras"] == ["repairs"]  # tax is already in Basic: not charged again
    assert Decimal(one["monthly"]) == 2000 and Decimal(one["total"]) == 22800
    assert "repairs" in one["modules"] and "accessories" in one["modules"]
    # a one-time add-on is never discounted; a monthly one is
    add = q(months=12, addons=[0, 3])
    assert Decimal(add["once"]) == 5000
    assert Decimal(add["recurring"]) == (5000 + 1000) * 12
    assert Decimal(add["total"]) == Decimal(72000) * Decimal("0.95") + 5000
    # a module not sold on its own is not added, and nonsense is refused
    assert q(modules=["login_activity"])["extras"] == []
    bad = {"plan": "pro", "modules": [], "addons": [], "months": 7}
    assert owner.post("/api/v1/fees/quote", json=bad).status_code == 422
    gone = {"plan": "pro", "modules": [], "addons": [9], "months": 1}
    assert owner.post("/api/v1/fees/quote", json=gone).status_code == 422
    # staff never see fees
    owner.post(
        "/api/v1/staff",
        json={"name": "Staff", "phone": "03451112233", "password": "secret123", "role": "salesman"},
    )
    assert login(client, "03451112233").get("/api/v1/fees/catalog").status_code == 403


def test_order_reaches_the_shop_only_when_approved(client, owner, monkeypatch):
    admin = _admin(client, monkeypatch)
    admin.patch(
        f"/api/v1/admin/shops/{owner.shop_id}/plan",
        json={"plan": "basic", "monthly_fee": 2000, "extend_months": 1},
    )
    before = _plan(owner)
    order = {"plan": "basic", "modules": ["repairs"], "addons": [], "months": 12}
    r = owner.post(
        "/api/v1/fees",
        json={
            "amount": 28500,
            "method": "Easypaisa",
            "reference": "T1",
            "months": 3,
            "order": order,
        },
    )
    assert r.status_code == 201, r.text
    # the months and the total come from the server's quote, not from the app
    assert r.json()["months"] == 12
    assert Decimal(r.json()["order"]["total"]) == Decimal(2500 * 12) * Decimal("0.95")
    # nothing has changed for the shop yet
    now = _plan(owner)
    assert now["plan"] == "basic" and "repairs" not in now["modules"]
    assert now["expires_at"] == before["expires_at"]
    assert owner.get("/api/v1/repairs").status_code == 403

    pend = admin.get("/api/v1/admin/fee-payments", params={"status": "pending"}).json()
    assert pend[0]["order"]["extras"] == ["repairs"] and pend[0]["order"]["discount_pct"] == 5
    ok = admin.post(f"/api/v1/admin/fee-payments/{pend[0]['id']}/approve", json={})
    assert ok.status_code == 200, ok.text
    after = _plan(owner)
    assert after["plan"] == "basic" and "repairs" in after["modules"] and after["modules_custom"]
    assert Decimal(after["monthly_fee"]) == 2500  # package + the added module
    assert after["expires_at"][:4] == str(int(before["expires_at"][:4]) + 1)
    assert owner.get("/api/v1/repairs").status_code == 200

    # another package as it comes: its modules follow the package again
    order = {"plan": "pro", "modules": [], "addons": [], "months": 1}
    owner.post("/api/v1/fees", json={"amount": 5000, "method": "Cash", "order": order})
    pend = admin.get("/api/v1/admin/fee-payments", params={"status": "pending"}).json()
    admin.post(f"/api/v1/admin/fee-payments/{pend[0]['id']}/approve", json={})
    pro = _plan(owner)
    assert pro["plan"] == "pro" and pro["modules_custom"] is False
    assert Decimal(pro["monthly_fee"]) == 5000 and "installments" in pro["modules"]


def test_provider_may_count_the_money_only(client, owner, monkeypatch):
    admin = _admin(client, monkeypatch)
    admin.patch(
        f"/api/v1/admin/shops/{owner.shop_id}/plan", json={"plan": "basic", "monthly_fee": 2000}
    )
    order = {"plan": "chain", "modules": [], "addons": [], "months": 1}
    owner.post("/api/v1/fees", json={"amount": 2000, "method": "Cash", "order": order})
    pend = admin.get("/api/v1/admin/fee-payments", params={"status": "pending"}).json()
    r = admin.post(
        f"/api/v1/admin/fee-payments/{pend[0]['id']}/approve", json={"apply_order": False}
    )
    assert r.status_code == 200, r.text
    kept = _plan(owner)
    assert kept["plan"] == "basic" and Decimal(kept["monthly_fee"]) == 2000
    assert kept["expires_at"] is not None  # the month was still given


def test_provider_sets_module_prices_and_the_discount(client, owner, monkeypatch):
    admin = _admin(client, monkeypatch)
    body = {
        "prices": {"basic": 2000, "pro": 5000, "chain": 7500},
        "module_prices": {"repairs": 800, "login_activity": 400, "nonsense": 5},
        "discount_per_year": 4,
        "max_years": 3,
    }
    assert owner.put("/api/v1/admin/pricing", json=body).status_code == 403
    saved = admin.put("/api/v1/admin/pricing", json=body)
    assert saved.status_code == 200, saved.text
    assert saved.json()["module_prices"]["repairs"] == 800
    assert "nonsense" not in saved.json()["module_prices"]
    cat = owner.get("/api/v1/fees/catalog").json()
    assert [(d["months"], d["discount_pct"]) for d in cat["durations"]] == [
        (1, 0),
        (12, 4),
        (24, 8),
        (36, 12),
    ]
    mods = {m["key"]: Decimal(m["price"]) for m in cat["modules"]}
    assert mods["repairs"] == 800 and mods["login_activity"] == 400 and mods["exports"] == 300
    # a save that leaves them out keeps them
    admin.put("/api/v1/admin/pricing", json={"prices": {"basic": 2100}})
    cat = owner.get("/api/v1/fees/catalog").json()
    assert len(cat["durations"]) == 4
    # ... but note: add-ons are the whole list each time (as before)
    assert (
        admin.put("/api/v1/admin/pricing", json={**body, "discount_per_year": 40}).status_code
        == 422
    )
