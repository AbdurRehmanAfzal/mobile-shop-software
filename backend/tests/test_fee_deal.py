"""Owner 2026-11-17 (ADR-098): a special price for one shop (a package at an agreed fee for a
number of months), a sale for everyone, and the provider recording a payment together with the
package, modules and months it is for."""

from decimal import Decimal

from tests.conftest import login, signup

SUPER = "03990000099"


def _admin(client, monkeypatch):
    monkeypatch.setattr("app.core.config.settings.superuser_phones", SUPER, raising=False)
    signup(client, shop_name="OOP Admin", owner_name="Product Owner", phone=SUPER)
    return login(client, SUPER)


def _plan(owner):
    return owner.get("/api/v1/fees").json()["plan"]


def _quote(owner, **kw):
    body = {"plan": "pro", "modules": [], "addons": [], "months": 1, **kw}
    r = owner.post("/api/v1/fees/quote", json=body)
    assert r.status_code == 200, r.text
    return r.json()


def test_special_price_for_one_shop(client, owner, other_owner, monkeypatch):
    admin = _admin(client, monkeypatch)
    # the owner of the case: Pro is 5,000; this shop gets it for 3,000 a month, for 6 months
    deal = {"plan": "pro", "price": 3000, "months": 6, "note": "Old price, as promised"}
    assert owner.put(f"/api/v1/admin/shops/{owner.shop_id}/deal", json=deal).status_code == 403
    r = admin.put(f"/api/v1/admin/shops/{owner.shop_id}/deal", json=deal)
    assert r.status_code == 200, r.text
    assert r.json()["fee_deal"]["months_left"] == 6 and r.json()["fee_deal"]["price"] == "3000"

    cat = owner.get("/api/v1/fees/catalog").json()
    pro = next(p for p in cat["packages"] if p["key"] == "pro")
    # the shop still sees the list price, with its own beside it
    assert Decimal(pro["list_price"]) == 5000 and Decimal(pro["price"]) == 3000
    assert pro["deal"] is True and pro["deal_months_left"] == 6
    assert cat["deal"]["note"] == "Old price, as promised" and cat["deal"]["plan"] == "pro"
    # the other packages, and every other shop, are as before
    assert Decimal(next(p for p in cat["packages"] if p["key"] == "chain")["price"]) == 7500
    theirs = other_owner.get("/api/v1/fees/catalog").json()
    assert theirs["deal"] is None
    assert Decimal(next(p for p in theirs["packages"] if p["key"] == "pro")["price"]) == 5000

    one = _quote(owner)
    assert Decimal(one["total"]) == 3000 and one["deal_months"] == 1
    assert Decimal(one["saved"]) == 2000 and Decimal(one["per_month"]) == 3000
    # a year: 6 months at 3,000 and 6 at 5,000 = 48,000, less 5 % for the year
    year = _quote(owner, months=12)
    assert year["deal_months"] == 6 and Decimal(year["recurring"]) == 48000
    assert Decimal(year["total"]) == Decimal(48000) * Decimal("0.95")

    # he pays 3,000 for one month from the app; approved -> Pro, 3,000 a month, 5 months left
    order = {"plan": "pro", "modules": [], "addons": [], "months": 1}
    owner.post("/api/v1/fees", json={"amount": 3000, "method": "Easypaisa", "order": order})
    pend = admin.get("/api/v1/admin/fee-payments", params={"status": "pending"}).json()
    assert pend[0]["order"]["deal_months"] == 1 and Decimal(pend[0]["order"]["total"]) == 3000
    assert (
        admin.post(f"/api/v1/admin/fee-payments/{pend[0]['id']}/approve", json={}).status_code
        == 200
    )
    now = _plan(owner)
    assert now["plan"] == "pro" and Decimal(now["monthly_fee"]) == 3000
    left = owner.get("/api/v1/fees/catalog").json()["deal"]["months_left"]
    assert left == 5

    # the last five months bought, then one more: that one is back at the list price
    order = {"plan": "pro", "modules": [], "addons": [], "months": 12}
    q = _quote(owner, months=12)
    assert q["deal_months"] == 5 and Decimal(q["recurring"]) == 5 * 3000 + 7 * 5000
    owner.post("/api/v1/fees", json={"amount": 47500, "method": "Easypaisa", "order": order})
    pend = admin.get("/api/v1/admin/fee-payments", params={"status": "pending"}).json()
    admin.post(f"/api/v1/admin/fee-payments/{pend[0]['id']}/approve", json={})
    after = owner.get("/api/v1/fees/catalog").json()
    assert after["deal"] is None
    assert Decimal(next(p for p in after["packages"] if p["key"] == "pro")["price"]) == 5000
    assert Decimal(_plan(owner)["monthly_fee"]) == 5000
    assert Decimal(_quote(owner)["total"]) == 5000 and _quote(owner)["deal_months"] == 0


def test_special_price_with_no_end_and_removing_it(client, owner, monkeypatch):
    admin = _admin(client, monkeypatch)
    admin.put(f"/api/v1/admin/shops/{owner.shop_id}/deal", json={"plan": "basic", "price": 1200})
    five = _quote(owner, plan="basic", months=60)
    assert five["deal_months"] == 60 and Decimal(five["recurring"]) == 1200 * 60
    # nonsense is refused
    bad = admin.put(f"/api/v1/admin/shops/{owner.shop_id}/deal", json={"plan": "trial", "price": 1})
    assert bad.status_code == 422
    r = admin.delete(f"/api/v1/admin/shops/{owner.shop_id}/deal")
    assert r.status_code == 200 and r.json()["fee_deal"] is None
    assert Decimal(_quote(owner, plan="basic")["total"]) == 2000


def test_provider_records_a_payment_with_package_modules_and_months(client, owner, monkeypatch):
    admin = _admin(client, monkeypatch)
    admin.put(f"/api/v1/admin/shops/{owner.shop_id}/deal", json={"plan": "pro", "price": 3000})
    body = {"plan": "pro", "modules": ["loans"], "addons": [], "months": 3}
    # what it costs this shop, before recording: (3,000 + 500) x 3; any number of months
    q = admin.post(f"/api/v1/admin/shops/{owner.shop_id}/quote", json=body)
    assert q.status_code == 200, q.text
    assert Decimal(q.json()["total"]) == 10500 and q.json()["extras"] == ["loans"]
    assert owner.post(f"/api/v1/admin/shops/{owner.shop_id}/quote", json=body).status_code == 403
    # a shop itself cannot pick three months
    assert owner.post("/api/v1/fees/quote", json=body).status_code == 422

    before = _plan(owner)
    r = admin.post(
        f"/api/v1/admin/shops/{owner.shop_id}/payments",
        json={"amount": 10500, "method": "cash", "order": body},
    )
    assert r.status_code == 201, r.text
    assert r.json()["status"] == "approved" and r.json()["months"] == 3
    assert r.json()["order"]["plan"] == "pro" and r.json()["receipt_no"]
    now = _plan(owner)
    assert now["plan"] == "pro" and "loans" in now["modules"] and now["modules_custom"]
    assert Decimal(now["monthly_fee"]) == 3500
    assert now["expires_at"] != before["expires_at"] and now["days_left"] >= 85
    assert owner.get("/api/v1/loans").status_code == 200
    # a plain payment (no order) still only adds months
    r = admin.post(
        f"/api/v1/admin/shops/{owner.shop_id}/payments",
        json={"amount": 3500, "method": "cash", "months": 1},
    )
    assert r.status_code == 201 and r.json()["order"] is None
    assert _plan(owner)["plan"] == "pro" and _plan(owner)["days_left"] >= 115


def test_a_sale_for_everyone(client, owner, monkeypatch):
    admin = _admin(client, monkeypatch)
    admin.patch(
        f"/api/v1/admin/shops/{owner.shop_id}/plan", json={"plan": "basic", "monthly_fee": 1500}
    )
    body = {"prices": {"basic": 2000, "pro": 5000, "chain": 7500}, "sale_pct": 20}
    assert admin.put("/api/v1/admin/pricing", json=body).status_code == 200
    cat = owner.get("/api/v1/fees/catalog").json()
    assert cat["sale"] == {"pct": 20, "until": None}
    packs = {p["key"]: p for p in cat["packages"]}
    # 20 % off the list price; the shop's own agreed fee is never touched
    assert Decimal(packs["pro"]["price"]) == 4000 and Decimal(packs["pro"]["list_price"]) == 5000
    assert Decimal(packs["basic"]["price"]) == 1500
    mods = {m["key"]: m for m in cat["modules"]}
    assert (
        Decimal(mods["repairs"]["price"]) == 400 and Decimal(mods["repairs"]["list_price"]) == 500
    )
    q = _quote(owner, modules=[], months=1)
    assert Decimal(q["total"]) == 4000 and Decimal(q["saved"]) == 1000 and q["sale_pct"] == 20
    # after the sale the shop's monthly fee is the list price, not the sale price
    assert Decimal(q["monthly"]) == 5000
    # a sale that ended yesterday is no sale
    admin.put("/api/v1/admin/pricing", json={**body, "sale_until": "2020-01-01"})
    assert owner.get("/api/v1/fees/catalog").json()["sale"] is None
    assert Decimal(_quote(owner)["total"]) == 5000
    # switched off
    admin.put("/api/v1/admin/pricing", json={**body, "sale_pct": 0})
    assert Decimal(_quote(owner)["total"]) == 5000
    assert admin.put("/api/v1/admin/pricing", json={**body, "sale_pct": 95}).status_code == 422
