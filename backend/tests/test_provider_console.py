"""Provider console (docs/28): collections by month / channel / plan, MRR, pending / coming / overdue
fees, every shop's plan, time left and payments, cloud vs one-PC usage, and license keys that are
kept, resent, renewed, revoked and shown by a magic link; the one-PC heartbeat; super admin only."""

import datetime as dt
import uuid

from app.db.base import utcnow
from app.modules.auth.models import Organisation, Shop
from app.modules.plan import clockguard, renewal
from tests.test_plan_reminders import _admin


def _org(db, actor) -> Organisation:
    return db.get(Shop, uuid.UUID(actor.shop_id)).organisation


def _keys(monkeypatch):
    priv, pub = renewal.keygen()
    monkeypatch.setattr("app.core.config.settings.renewal_private_key", priv, raising=False)
    monkeypatch.setattr("app.core.config.settings.renewal_public_key", pub, raising=False)


def _pay(admin, shop_id, amount, method, months=1, paid_on=None):
    r = admin.post(f"/api/v1/admin/shops/{shop_id}/payments", json={"amount": amount, "method": method, "months": months, "paid_on": paid_on})
    assert r.status_code == 201, r.text


def test_overview_collections_coming_overdue_and_usage(client, owner, other_owner, db, monkeypatch):
    clockguard.reset_for_tests()
    admin = _admin(client, monkeypatch)
    a, b = _org(db, owner), _org(db, other_owner)
    a.plan, a.monthly_fee, a.plan_expires_at = "pro", 3000, utcnow() + dt.timedelta(days=5)
    b.plan, b.monthly_fee, b.plan_expires_at = "basic", 1500, utcnow() - dt.timedelta(days=3)
    db.commit()
    today = dt.date.today()
    _pay(admin, owner.shop_id, 3000, "easypaisa")
    _pay(admin, owner.shop_id, 3000, "bank", paid_on=(today.replace(day=1) - dt.timedelta(days=2)).isoformat())
    _pay(admin, other_owner.shop_id, 1500, "jazzcash")
    # a pending proof from the shop
    owner.post("/api/v1/fees", json={"amount": 3000, "method": "sadapay", "reference": "TX9", "months": 1})
    o = admin.get("/api/v1/admin/business/overview").json()
    assert o["collected_total"] == "7500.00" and o["paying_shops"] == 2
    assert o["collected_prev_month"] == "3000.00" and o["collected_month"] == "4500.00"
    assert {c["method"]: c["amount"] for c in o["by_channel"]} == {"easypaisa": "3000.00", "bank": "3000.00", "jazzcash": "1500.00"}
    assert o["pending_count"] == 1 and o["pending_amount"] == "3000.00"
    # the recorded payments moved both plans forward a month: owner's pro ends in ~2 months
    assert o["mrr"] == "4500.00" and o["counts"]["paid"] == 2
    assert len(o["monthly"]) == 12 and o["monthly"][-1]["amount"] == "4500.00"
    # usage: every API call above touched the shop's last use; both are cloud and online
    assert o["counts"]["cloud"] >= 2 and o["counts"]["online_now"] >= 2
    rows = {r["shop_id"]: r for r in admin.get("/api/v1/admin/business/shops").json()}
    mine = rows[owner.shop_id]
    assert mine["paid_total"] == "6000.00" and mine["payments"] == 2 and mine["last_channel"] in ("easypaisa", "bank")
    assert mine["pending_amount"] == "3000.00" and mine["deployment"] == "cloud" and mine["online"] is True
    assert mine["plan"] == "pro" and mine["days_left"] > 30
    # coming fee: a shop whose plan ends in 10 days
    a.plan_expires_at = utcnow() + dt.timedelta(days=10)
    b.plan_expires_at = utcnow() - dt.timedelta(days=3)
    db.commit()
    o = admin.get("/api/v1/admin/business/overview").json()
    assert o["coming_30"] == {"count": 1, "amount": "3000.00"} and o["coming_7"]["count"] == 0
    assert o["overdue"] == {"count": 1, "amount": "1500.00"}
    pays = admin.get("/api/v1/admin/business/payments", params={"method": "bank"}).json()
    assert [p["amount"] for p in pays["rows"]] == ["3000.00"] and "easypaisa" in pays["methods"]
    assert admin.get("/api/v1/admin/business/shops", params={"status": "expired"}).json()[0]["shop_id"] == other_owner.shop_id
    # only the product owner
    assert owner.get("/api/v1/admin/business/overview").status_code == 403


def test_keys_are_kept_resent_renewed_revoked_and_shown_by_magic_link(client, owner, db, monkeypatch):
    clockguard.reset_for_tests()
    _keys(monkeypatch)
    admin = _admin(client, monkeypatch)
    r = admin.post(f"/api/v1/admin/shops/{owner.shop_id}/renewal-code", json={"months": 3, "note": "lost phone"})
    key = r.json()["key"]
    assert key["status"] == "issued" and key["months"] == 3 and key["link_active"] and key["code"] == r.json()["code"]
    # the provider finds it again and resends it on WhatsApp
    listed = admin.get("/api/v1/admin/business/keys", params={"shop_id": owner.shop_id}).json()
    assert [k["id"] for k in listed] == [key["id"]]
    s = admin.post(f"/api/v1/admin/keys/{key['id']}/send", json={"via": "whatsapp", "site": "https://app.example"}).json()
    assert s["whatsapp"].startswith("https://wa.me/92") and "MS1." in s["text"] and s["link"].startswith("https://app.example/key/")
    assert s["key"]["sent_count"] == 1 and s["key"]["last_sent_via"] == "whatsapp"
    token = s["link"].rsplit("/", 1)[1]
    # the shopkeeper opens the magic link — no login
    shown = client.get(f"/api/v1/public/key/{token}").json()
    assert shown["code"] == key["code"] and shown["months"] == 3 and shown["shop"]
    assert admin.get("/api/v1/admin/business/keys").json()[0]["view_count"] == 1
    assert client.get("/api/v1/public/key/not-a-token").status_code == 404
    # renew: a new key, the old unused one revoked; the old link stops working
    new = admin.post(f"/api/v1/admin/keys/{key['id']}/renew", json={}).json()
    assert new["status"] == "issued" and new["renewed_from"] == key["id"] and new["code"] != key["code"]
    assert client.get(f"/api/v1/public/key/{token}").status_code == 404
    old_code = key["code"]
    r = owner.post("/api/v1/plan/redeem", json={"code": old_code})
    assert r.status_code == 422 and r.json()["error"]["code"] == "renewal_code_revoked"
    # the new key redeems on the cloud and is marked used; it cannot be revoked any more
    assert owner.post("/api/v1/plan/redeem", json={"code": new["code"]}).status_code == 200
    used = next(k for k in admin.get("/api/v1/admin/business/keys").json() if k["id"] == new["id"])
    assert used["status"] == "redeemed" and used["redeemed_where"] == "cloud"
    assert admin.post(f"/api/v1/admin/keys/{new['id']}/revoke", json={"reason": "x"}).status_code == 409
    o = admin.get("/api/v1/admin/business/overview").json()
    assert o["keys"] == {"issued": 0, "redeemed": 1, "revoked": 1}
    assert owner.post(f"/api/v1/admin/keys/{new['id']}/send", json={}).status_code == 403


def test_one_pc_heartbeat_and_key_binding(client, owner, db, monkeypatch):
    clockguard.reset_for_tests()
    _keys(monkeypatch)
    admin = _admin(client, monkeypatch)
    org = _org(db, owner)
    k = admin.post(f"/api/v1/admin/shops/{owner.shop_id}/renewal-code", json={"months": 1}).json()["key"]
    admin.post(f"/api/v1/admin/keys/{k['id']}/revoke", json={"reason": "typo"})
    beat = client.post("/api/v1/public/heartbeat", json={"org_id": str(org.id), "install_id": "PC-1", "version": "2.0"}).json()
    assert beat["ok"] and len(beat["revoked"]) == 1
    row = next(r for r in admin.get("/api/v1/admin/business/shops").json() if r["shop_id"] == owner.shop_id)
    assert row["deployment"] == "local" and row["install_version"] == "2.0" and row["online"] is True
    assert admin.get("/api/v1/admin/business/shops", params={"deployment": "local"}).json()[0]["shop_id"] == owner.shop_id
    assert client.post("/api/v1/public/heartbeat", json={"org_id": str(uuid.uuid4()), "install_id": "PC-2"}).json() == {"ok": False}
    # the provider can also set it by hand
    assert admin.patch(f"/api/v1/admin/shops/{owner.shop_id}/deployment", json={"deployment": "cloud"}).json() == {"deployment": "cloud"}


def test_local_install_binds_the_first_key(client, owner, other_owner, db, monkeypatch):
    """on a one-PC install the shop's organisation id differs from the provider's customer id: the
    first valid key links them, later keys must be for the same customer"""
    clockguard.reset_for_tests()
    _keys(monkeypatch)
    admin = _admin(client, monkeypatch)
    saas = _org(db, other_owner)  # the customer as the provider knows it
    code = admin.post(f"/api/v1/admin/shops/{other_owner.shop_id}/renewal-code", json={"months": 2}).json()["code"]
    monkeypatch.setattr("app.core.config.settings.local_mode", True, raising=False)
    r = owner.post("/api/v1/plan/redeem", json={"code": code})
    assert r.status_code == 200, r.text
    db.expire_all()
    assert _org(db, owner).license_org_id == saas.id
    # a key for yet another customer is refused now
    third = admin.post(f"/api/v1/admin/shops/{admin.shop_id}/renewal-code", json={"months": 1}).json()["code"]
    assert owner.post("/api/v1/plan/redeem", json={"code": third}).json()["error"]["code"] == "renewal_code_other_shop"
