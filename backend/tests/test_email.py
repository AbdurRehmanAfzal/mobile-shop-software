"""Owner (2026-10-30): email through any SMTP account — the night report and the sale/purchase mails
that were only queued until now. A fake SMTP server stands in here."""

import datetime as dt
from typing import ClassVar

from app.core.clock import today
from app.core.config import settings
from app.modules.notifications import jobs, provider
from app.modules.notifications.models import Message


class FakeSMTP:
    sent: ClassVar[list[dict]] = []

    def __init__(self, host, port, timeout=0):
        self.host, self.port = host, port

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def starttls(self):
        FakeSMTP.sent.append({"tls": True})

    def login(self, user, password):
        FakeSMTP.sent.append({"login": user})

    def send_message(self, msg):
        FakeSMTP.sent.append(
            {"to": msg["To"], "subject": msg["Subject"], "body": msg.get_content()}
        )


def _smtp(monkeypatch):
    monkeypatch.setattr(settings, "smtp_host", "smtp.example.com")
    monkeypatch.setattr(settings, "smtp_user", "shop@example.com")
    monkeypatch.setattr(settings, "smtp_password", "app-password")
    monkeypatch.setattr(settings, "smtp_from", "Mobile Shop <shop@example.com>")
    monkeypatch.setattr(provider.smtplib, "SMTP", FakeSMTP)
    FakeSMTP.sent = []


def test_night_report_by_email_and_dispatch(owner, db, monkeypatch):
    assert owner.get("/api/v1/notifications/provider").json()["email"] is False
    _smtp(monkeypatch)
    assert owner.get("/api/v1/notifications/provider").json()["email"] is True
    r = owner.put(
        "/api/v1/notifications/settings",
        json={
            "owner_email": "malik@example.com",
            "owner_daily_report_email": True,
            "daily_report_time": "21:30",
            "language": "en",
        },
    )
    assert r.status_code == 200, r.text
    # send now: queued as email, sent through SMTP at once
    r = owner.post("/api/v1/notifications/daily-report")
    assert r.status_code == 200, r.text
    m = r.json()
    assert (
        m["channel"] == "email" and m["status"] == "sent" and m["recipient"] == "malik@example.com"
    )
    assert FakeSMTP.sent[-1]["to"] == "malik@example.com" and "Sold:" in FakeSMTP.sent[-1]["body"]
    assert any(x.get("login") == "shop@example.com" for x in FakeSMTP.sent)

    # the night tick also queues it by email (no WhatsApp number set)
    d = today()
    tz = dt.timezone(dt.timedelta(hours=5))
    assert (
        jobs.tick(db, dt.datetime(d.year, d.month, d.day, 21, 31, tzinfo=tz))["daily_report"] == 1
    )
    assert db.query(Message).filter_by(template_key="daily_report", channel="email").count() == 2


def test_email_failure_is_kept_on_the_row(owner, db, monkeypatch):
    _smtp(monkeypatch)

    def boom(self, msg):
        raise RuntimeError("535 bad credentials")

    monkeypatch.setattr(FakeSMTP, "send_message", boom)
    owner.put(
        "/api/v1/notifications/settings",
        json={"owner_email": "malik@example.com", "owner_daily_report_email": True},
    )
    r = owner.post("/api/v1/notifications/daily-report")
    assert r.status_code == 200
    assert r.json()["status"] == "failed" and "535" in (r.json().get("error") or "")
