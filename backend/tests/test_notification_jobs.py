"""Owner (2026-10-29): udhaar reminders and the night report go out by themselves; queued WhatsApp
messages are sent through the Cloud API when it is configured."""

import datetime as dt
import uuid

from app.db.base import utcnow
from app.modules.auth.models import Shop
from app.modules.notifications import jobs, provider
from app.modules.notifications.models import JobRun, Message
from tests.test_devices import _stock
from tests.test_purchases import _party

IMEI_A = "490154203237518"
IMEI_B = "356938035643809"


def _udhaar_sale(owner, cat, party, imei, price=1000):
    d = _stock(owner, cat, imei=imei, condition="box_pack", cost_price=800, asking_price=price)
    r = owner.post(
        "/api/v1/sales",
        json={
            "party_id": party["id"],
            "devices": [{"device_id": d["id"], "price": price}],
            "paid": 0,
        },
    )
    assert r.status_code == 201, r.text


def _shop(db, owner):
    return db.get(Shop, uuid.UUID(owner.shop_id))


def test_reminders_pick_old_udhaar_and_skip_recently_reminded(owner, db, cat):
    ahmed = _party(owner, name="Ahmed Khan", phone="03219876543", kinds=("customer",))
    bilal = _party(owner, name="Bilal", phone="03219876544", kinds=("customer",))
    _udhaar_sale(owner, cat, ahmed, IMEI_A)
    _udhaar_sale(owner, cat, bilal, IMEI_B, price=2000)
    owner.put("/api/v1/notifications/settings", json={"language": "en"})

    rows = owner.get("/api/v1/notifications/reminders").json()
    assert [r["name"] for r in rows] == ["Bilal", "Ahmed Khan"]  # biggest balance first
    assert rows[0]["balance"] == "2000.00" and rows[0]["days_since"] == 0
    assert "Rs. 2,000 is outstanding" in rows[0]["body"]
    # nothing is 7 days old yet
    assert owner.get("/api/v1/notifications/reminders", params={"min_days": 7}).json() == []

    # send one by hand: a queued WhatsApp message with a wa.me link (no Cloud API here)
    r = owner.post("/api/v1/notifications/reminders", json={"party_ids": [ahmed["id"]]})
    assert r.status_code == 200, r.text
    (m,) = r.json()
    assert m["template_key"] == "udhaar_reminder" and m["status"] == "queued"
    assert m["link"].startswith("https://wa.me/923219876543?text=")
    assert owner.get("/api/v1/notifications/reminders").json()[1]["last_reminded_at"] is not None

    # the automatic run: Ahmed's sale is made "8 days old" and he was reminded just now -> skipped;
    # Bilal is due
    shop = _shop(db, owner)
    from app.modules.ledger.models import LedgerEntry

    for e in db.query(LedgerEntry).all():
        e.at = utcnow() - dt.timedelta(days=8)
    db.commit()
    msgs = jobs.queue_reminders(db, shop, party_ids=None, min_days=7, skip_reminded_within_days=7)
    db.commit()
    assert [m.recipient for m in msgs] == ["03219876544"]


def test_daily_report_once_a_day_at_the_set_time(owner, db, cat):
    c = _party(owner, name="Ahmed Khan", phone="03219876543", kinds=("customer",))
    _udhaar_sale(owner, cat, c, IMEI_A)
    owner.put(
        "/api/v1/notifications/settings",
        json={
            "owner_whatsapp": "03001234567",
            "owner_daily_report_whatsapp": True,
            "daily_report_time": "21:30",
            "language": "en",
        },
    )
    shop = _shop(db, owner)
    db.refresh(shop)
    # 21:00 shop time: not yet; 21:31: queued once; the next tick does nothing more
    tz = dt.timezone(dt.timedelta(hours=5))
    early = dt.datetime(2026, 10, 29, 21, 0, tzinfo=tz)
    assert jobs.tick(db, early) == {"daily_report": 0, "reminders": 0}
    late = dt.datetime(2026, 10, 29, 21, 31, tzinfo=tz)
    assert jobs.tick(db, late)["daily_report"] == 1
    assert jobs.tick(db, late)["daily_report"] == 0
    assert db.query(JobRun).count() == 1
    (m,) = db.query(Message).filter_by(template_key="daily_report").all()
    assert m.recipient == "03001234567" and m.audience == "owner"
    assert "Sold: 1 phones, Rs. 1,000" in m.body and "To get: Rs. 1,000" in m.body
    assert "Phones in stock: 0" in m.body

    # "send now" from the settings screen
    r = owner.post("/api/v1/notifications/daily-report")
    assert r.status_code == 200, r.text
    assert r.json()["template_key"] == "daily_report"


def test_dispatch_sends_through_the_cloud_api(owner, db, cat, monkeypatch):
    c = _party(owner, name="Ahmed Khan", phone="03219876543", kinds=("customer",))
    _udhaar_sale(owner, cat, c, IMEI_A)
    assert owner.get("/api/v1/notifications/provider").json() == {"whatsapp_api": False}
    owner.post("/api/v1/notifications/reminders", json={})
    (m,) = db.query(Message).all()
    assert m.status == "queued"

    sent: list[tuple[str, str]] = []

    def fake_send(recipient, body, template_key=None):
        if recipient == "03219876543":
            sent.append((recipient, template_key))
            return "wamid.123"
        raise RuntimeError("WhatsApp API 400: bad number")

    monkeypatch.setattr(provider, "configured", lambda: True)
    monkeypatch.setattr(provider, "send_whatsapp", fake_send)
    assert jobs.dispatch(db) == {"sent": 1, "failed": 0}
    db.refresh(m)
    assert m.status == "sent" and m.provider == "whatsapp_api" and m.provider_id == "wamid.123"
    assert sent == [("03219876543", "udhaar_reminder")]

    # a failed send keeps the message, with the reason, for a retry by hand
    bad = _party(owner, name="Bad", phone="03219876500", kinds=("customer",))
    _udhaar_sale(owner, cat, bad, IMEI_B)
    owner.post("/api/v1/notifications/reminders", json={"party_ids": [bad["id"]]})
    failed = db.query(Message).filter_by(party_id=uuid.UUID(bad["id"])).one()
    db.refresh(failed)
    assert failed.status == "failed" and "bad number" in failed.error
    assert provider.to_international("0321-9876543") == "923219876543"
