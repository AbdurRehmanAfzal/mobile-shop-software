"""Owner addendum 3 (2026-10-31, docs/19): subscription reminders — stages by date, the popup
schedule and server-side snooze, billing settings only for the provider, payment proof → pending →
verified with a receipt, soft-lock that still lets the shop view / export / back up / pay, renewal
codes that work offline, and nothing ever deleted."""

import datetime as dt
import io
import uuid
import zipfile

from app.db.base import utcnow
from app.modules.auth.models import Organisation
from app.modules.plan import clockguard, renewal
from tests.conftest import login, signup
from tests.test_purchases import _dev, _party

SUPER = "03990000099"


def _admin(client, monkeypatch):
    monkeypatch.setattr("app.core.config.settings.superuser_phones", SUPER, raising=False)
    monkeypatch.setattr("app.core.config.settings.admin_whatsapp", SUPER, raising=False)
    signup(client, shop_name="OOP Admin", owner_name="Product Owner", phone=SUPER)
    return login(client, SUPER)


def _expire_in(db, owner, days: int):
    org = (
        db.get(Organisation, uuid.UUID(owner.me["shops"][0]["organisation_id"]))
        if "organisation_id" in owner.me["shops"][0]
        else None
    )
    if org is None:
        from app.modules.auth.models import Shop

        org = db.get(Shop, uuid.UUID(owner.shop_id)).organisation
    org.plan_expires_at = utcnow() + dt.timedelta(days=days)
    org.plan = "pro"
    org.monthly_fee = 2500
    db.commit()
    return org


def _salesman(client, owner, phone="03451112233"):
    owner.post(
        "/api/v1/staff",
        json={"name": "Sales", "phone": phone, "password": "secret123", "role": "salesman"},
    )
    return login(client, phone)


def test_stages_by_date_and_the_bar_tone(client, owner, db, monkeypatch):
    clockguard.reset_for_tests()
    _admin(client, monkeypatch)
    r = owner.get("/api/v1/plan/reminder").json()
    assert r["stage"] == "none" and r["state"] == "ACTIVE" and r["tone"] is None
    for days, stage, state, tone in [
        (20, "none", "ACTIVE", None),
        (7, "info", "EXPIRING_SOON", "yellow"),
        (3, "warn", "EXPIRING_SOON", "orange"),
        (1, "urgent", "EXPIRING_SOON", "red"),
        (0, "urgent", "EXPIRING_SOON", "red"),
        (-1, "grace", "GRACE", "red"),
        (-7, "grace", "GRACE", "red"),
        (-8, "locked", "EXPIRED", "locked"),
    ]:
        _expire_in(db, owner, days)
        r = owner.get("/api/v1/plan/reminder").json()
        assert (r["stage"], r["state"], r["tone"]) == (stage, state, tone), (days, r)
        assert r["grace_days"] == 7 and r["amount_due"] == "2500.00" and r["currency"] == "PKR"
    # the lock and the way back are audited
    _expire_in(db, owner, 5)
    owner.get("/api/v1/plan/reminder")
    rows = owner.get("/api/v1/audit", params={"entity": "organisation"}).json()
    rows = rows["items"] if isinstance(rows, dict) else rows
    actions = [x["action"] for x in rows]
    assert "lock" in actions and "unlock" in actions


def test_popup_schedule_snooze_and_staff_notice(client, owner, db, monkeypatch):
    clockguard.reset_for_tests()
    _admin(client, monkeypatch)
    # 7 days: bar only
    _expire_in(db, owner, 7)
    r = owner.get("/api/v1/plan/reminder").json()
    assert r["show_popup"] is False and r["snooze_options"] == []
    # 3 days: popup once a day, snooze up to 3 days but never past the expiry
    _expire_in(db, owner, 3)
    r = owner.get("/api/v1/plan/reminder").json()
    assert r["show_popup"] is True and r["snooze_options"] == ["4h", "tomorrow"]
    assert r["close_option"] == "tomorrow" and r["billing"] is not None and r["audience"] == "owner"
    owner.post("/api/v1/plan/reminder/shown")
    assert owner.get("/api/v1/plan/reminder").json()["show_popup"] is False  # same day
    # a snooze holds across reloads (it is on the server), and "3d" is refused this close
    assert owner.post("/api/v1/plan/reminder/snooze", json={"option": "3d"}).status_code == 422
    r = owner.post("/api/v1/plan/reminder/snooze", json={"option": "4h"})
    assert r.status_code == 200 and r.json()["snoozed_until"]
    assert owner.get("/api/v1/plan/reminder").json()["show_popup"] is False
    # 1 day: only "a few hours"
    _expire_in(db, owner, 1)
    r = owner.get("/api/v1/plan/reminder").json()
    assert r["snooze_options"] == ["4h"] and r["close_option"] == "4h"
    # grace: on every login; otherwise again after a few hours
    _expire_in(db, owner, -2)
    assert (
        owner.get("/api/v1/plan/reminder", params={"event": "login"}).json()["show_popup"] is True
    )
    owner.post("/api/v1/plan/reminder/shown")
    assert (
        owner.get("/api/v1/plan/reminder", params={"event": "open"}).json()["show_popup"] is False
    )
    assert (
        owner.get("/api/v1/plan/reminder", params={"event": "login"}).json()["show_popup"] is True
    )
    # the salesman: the short notice only — no popup, no billing details, no snooze
    sales = _salesman(client, owner)
    r = sales.get("/api/v1/plan/reminder").json()
    assert r["audience"] == "staff" and r["show_popup"] is False and r["billing"] is None
    assert r["stage"] == "grace" and r["days_left"] == -2
    assert sales.post("/api/v1/plan/reminder/snooze", json={"option": "4h"}).status_code == 403
    assert sales.get("/api/v1/admin/billing").status_code == 403
    assert sales.get("/api/v1/fees").status_code == 403
    assert sales.get("/api/v1/plan/backup").status_code == 403


def test_billing_settings_belong_to_the_provider(client, owner, db, monkeypatch):
    admin = _admin(client, monkeypatch)
    b = admin.get("/api/v1/admin/billing").json()
    assert b["placeholders"] is True and b["schedule"]["grace_days"] == 7
    # the shopkeeper never sees placeholder bank lines
    _expire_in(db, owner, 3)
    r = owner.get("/api/v1/plan/reminder").json()
    assert r["billing"]["bank"] is None and r["billing"]["support"]["whatsapp"] is None
    # the provider fills them in; the owner cannot
    assert (
        owner.put("/api/v1/admin/billing", json={"schedule": {"grace_days": 30}}).status_code == 403
    )
    r = admin.put(
        "/api/v1/admin/billing",
        json={
            "bank": {
                "bank_name": "Meezan Bank",
                "account_title": "OOP Solutions",
                "account_number": "0123456789",
                "iban": "PK36MEZN0000000123456789",
                "branch": "Faisalabad",
            },
            "support": {"phone": "+92 316 4001668", "whatsapp": "+92 316 4001668"},
            "schedule": {"grace_days": 10, "warn_days": 4},
        },
    )
    assert r.status_code == 200 and r.json()["placeholders"] is False
    assert r.json()["schedule"] == {
        "info_days": 7,
        "warn_days": 4,
        "urgent_days": 1,
        "grace_days": 10,
        "snooze_hours": 4,
    }
    r = owner.get("/api/v1/plan/reminder").json()
    assert r["billing"]["bank"]["iban"].startswith("PK36") and r["grace_days"] == 10
    assert r["billing"]["support"]["whatsapp"] == "+92 316 4001668"
    # 4 days before is now a popup day; a shop can get its own grace
    _expire_in(db, owner, 4)
    assert owner.get("/api/v1/plan/reminder").json()["stage"] == "warn"
    admin.patch(
        f"/api/v1/admin/shops/{owner.shop_id}/plan", json={"set_grace": True, "grace_days": 2}
    )
    _expire_in(db, owner, -3)
    assert owner.get("/api/v1/plan/reminder").json()["stage"] == "locked"


def test_payment_proof_then_verification_with_receipt_and_thanks(client, owner, db, monkeypatch):
    clockguard.reset_for_tests()
    admin = _admin(client, monkeypatch)
    _expire_in(db, owner, 2)
    before = owner.get("/api/v1/fees").json()["plan"]["expires_at"]
    r = owner.post(
        "/api/v1/fees",
        json={
            "amount": 2500,
            "method": "Easypaisa",
            "reference": "TX-1",
            "months": 1,
            "paid_on": dt.date.today().isoformat(),
        },
    )
    assert r.status_code == 201 and r.json()["paid_on"] == dt.date.today().isoformat()
    # pending: the popup stops, the bar turns calm blue, /me knows
    rem = owner.get("/api/v1/plan/reminder").json()
    assert (
        rem["pending_payment"]["amount"] == "2500.00"
        and rem["show_popup"] is False
        and rem["tone"] == "blue"
    )
    assert (
        owner.get("/api/v1/me").json()["plan"]["pending_payment_id"] == rem["pending_payment"]["id"]
    )
    # the provider heard about it
    msgs = admin.get("/api/v1/notifications").json()
    msgs = msgs["items"] if isinstance(msgs, dict) else msgs
    assert any(m.get("template_key") == "fee_submitted_admin" for m in msgs)
    # verified: the expiry moves a month, a receipt number is given, the thank-you shows once
    pid = rem["pending_payment"]["id"]
    r = admin.post(f"/api/v1/admin/fee-payments/{pid}/approve", json={})
    assert r.status_code == 200 and r.json()["receipt_no"] == "SUB-0001"
    after = owner.get("/api/v1/fees").json()["plan"]
    assert after["expires_at"] > before and after["status"] == "ok" and after["started_at"]
    rem = owner.get("/api/v1/plan/reminder").json()
    assert rem["stage"] == "none" and rem["pending_payment"] is None and rem["tone"] is None
    assert (
        rem["renewed"]["receipt_no"] == "SUB-0001"
        and rem["renewed"]["until"] == after["expires_at"]
    )
    owner.post("/api/v1/plan/reminder/thanks", json={"payment_id": pid})
    assert owner.get("/api/v1/plan/reminder").json()["renewed"] is None
    # the receipt page
    r = owner.get(f"/api/v1/plan/receipts/{pid}")
    assert r.status_code == 200 and "SUB-0001" in r.text and "Renewal receipt" in r.text
    assert owner.get(f"/api/v1/plan/receipts/{pid}", params={"lang": "ur"}).text.count("تجدید") >= 1
    # a second verified payment gets the next number; a manual one by the provider too
    r = admin.post(
        f"/api/v1/admin/shops/{owner.shop_id}/payments",
        json={"amount": 5000, "method": "cash", "months": 2},
    )
    assert (
        r.status_code == 201
        and r.json()["receipt_no"] == "SUB-0002"
        and r.json()["status"] == "approved"
    )
    # audit trail: report, verify
    rows = owner.get("/api/v1/audit", params={"entity": "fee_payment"}).json()
    rows = rows["items"] if isinstance(rows, dict) else rows
    assert {"report", "verify"} <= {x["action"] for x in rows}


def test_soft_lock_views_exports_backs_up_and_pays_but_cannot_sell(
    client, owner, cat, db, monkeypatch
):
    clockguard.reset_for_tests()
    admin = _admin(client, monkeypatch)
    sup = _party(owner, name="Dealer", phone="03005556666", kinds=("supplier",))
    pur = owner.post(
        "/api/v1/purchases",
        json={
            "kind": "supplier",
            "party_id": sup["id"],
            "devices": [{"device": _dev(cat, "490154203237518"), "cost": 800}],
            "paid": 800,
        },
    ).json()
    dev = pur["lines"][0]["device_id"]
    _expire_in(db, owner, -30)
    assert owner.get("/api/v1/plan/reminder").json()["stage"] == "locked"
    # cannot sell or buy
    r = owner.post(
        "/api/v1/sales", json={"devices": [{"device_id": dev, "price": 1000}], "paid": 1000}
    )
    assert r.status_code == 403 and r.json()["error"]["code"] == "plan_expired"
    assert (
        owner.post(
            "/api/v1/parties", json={"name": "X Y", "phone": "03001112233", "kinds": ["customer"]}
        ).status_code
        == 403
    )
    # can still see, export, back up
    assert len(owner.get("/api/v1/devices").json()) == 1
    assert owner.get("/api/v1/exports/stock", params={"format": "xlsx"}).status_code == 200
    r = owner.get("/api/v1/plan/backup")
    assert r.status_code == 200 and r.headers["content-type"] == "application/zip"
    names = zipfile.ZipFile(io.BytesIO(r.content)).namelist()
    assert {
        "stock-all.csv",
        "people.csv",
        "udhaar-khata.csv",
        "sales.csv",
        "purchases.csv",
        "expenses.csv",
        "accessories.csv",
        "README.txt",
    } <= set(names)
    assert "490154203237518" in zipfile.ZipFile(io.BytesIO(r.content)).read("stock-all.csv").decode(
        "utf-8-sig"
    )
    # can still pay (and snooze the reminder)
    assert (
        owner.post(
            "/api/v1/fees", json={"amount": 2500, "method": "JazzCash", "months": 1}
        ).status_code
        == 201
    )
    pid = owner.get("/api/v1/fees").json()["payments"][0]["id"]
    admin.post(f"/api/v1/admin/fee-payments/{pid}/approve", json={})
    # renewed: full access at once, nothing was deleted
    assert owner.get("/api/v1/plan/reminder").json()["stage"] == "none"
    assert (
        owner.post(
            "/api/v1/sales", json={"devices": [{"device_id": dev, "price": 1000}], "paid": 1000}
        ).status_code
        == 201
    )
    assert (
        len(owner.get("/api/v1/devices").json()) == 1
        and len(owner.get("/api/v1/parties").json()) == 1
    )


def test_renewal_code_works_once_and_only_for_its_shop(client, owner, other_owner, db, monkeypatch):
    clockguard.reset_for_tests()
    priv, pub = renewal.keygen()
    monkeypatch.setattr("app.core.config.settings.renewal_private_key", priv, raising=False)
    monkeypatch.setattr("app.core.config.settings.renewal_public_key", pub, raising=False)
    admin = _admin(client, monkeypatch)
    _expire_in(db, owner, -20)
    r = admin.post(f"/api/v1/admin/shops/{owner.shop_id}/renewal-code", json={"months": 2})
    assert r.status_code == 200 and r.json()["code"].startswith("MS1.")
    code = r.json()["code"]
    # another shop cannot use it; a changed character fails the signature
    assert (
        other_owner.post("/api/v1/plan/redeem", json={"code": code}).json()["error"]["code"]
        == "renewal_code_other_shop"
    )
    broken = code[:-2] + ("AA" if not code.endswith("AA") else "BB")
    assert (
        owner.post("/api/v1/plan/redeem", json={"code": broken}).json()["error"]["code"]
        == "renewal_code_invalid"
    )
    # the right shop, while locked (paying is allowed): plan extended 2 months from today
    r = owner.post("/api/v1/plan/redeem", json={"code": code})
    assert r.status_code == 200, r.text
    until = dt.datetime.fromisoformat(r.json()["until"])
    assert 58 <= (until.date() - dt.date.today()).days <= 62 and r.json()["receipt_no"].startswith(
        "SUB-"
    )
    assert owner.get("/api/v1/plan/reminder").json()["stage"] == "none"
    # once only
    assert (
        owner.post("/api/v1/plan/redeem", json={"code": code}).json()["error"]["code"]
        == "renewal_code_used"
    )
    # a salesman cannot redeem
    sales = _salesman(client, owner)
    assert sales.post("/api/v1/plan/redeem", json={"code": code}).status_code == 403


def test_clock_rolled_back_does_not_stretch_a_plan(db, owner, monkeypatch):
    clockguard.reset_for_tests()
    org = _expire_in(db, owner, -8)
    real = utcnow()
    # the machine has seen "now"; then its clock is set back ten days
    assert clockguard.now(db) >= real
    monkeypatch.setattr("app.modules.plan.clockguard.utcnow", lambda: real - dt.timedelta(days=10))
    assert clockguard.now(db) >= real and clockguard.rolled_back() is True
    from app.modules.plan import billing, reminders

    assert reminders.stage_of(org, billing.schedule(db), clockguard.now(db))[0] == "locked"
    clockguard.reset_for_tests()
