"""Sending a WhatsApp message by itself, through Meta's WhatsApp Cloud API (owner 2026-10-29:
reminders and the night report should go out without the shopkeeper tapping each one).

Set WHATSAPP_TOKEN and WHATSAPP_PHONE_ID (the business number's id in Meta Business) on the
server. Without them nothing changes: messages stay queued with a wa.me link and the shopkeeper
sends them by hand from Messages.

Meta lets a business write free text only inside 24 hours of the customer's last message; a
message started by the business (a reminder, a receipt) must use an approved template. Map our
template keys to approved template names in WHATSAPP_TEMPLATES, e.g.
    {"udhaar_reminder": {"name": "udhaar_reminder_ur", "lang": "ur"}}
Each template's body must have exactly one {{1}} that takes the whole text we render. Keys without
a mapping are sent as plain text (fine for test numbers and inside the 24-hour window)."""

import json
import re
import smtplib
from email.message import EmailMessage
from email.utils import make_msgid

import httpx

from app.core.config import settings


def configured() -> bool:
    return bool(settings.whatsapp_token and settings.whatsapp_phone_id)


def _templates() -> dict[str, dict]:
    try:
        return json.loads(settings.whatsapp_templates or "{}")
    except ValueError:
        return {}


def to_international(phone: str) -> str:
    """03001234567 -> 923001234567 (Meta wants the number without + or 00)."""
    digits = re.sub(r"\D", "", phone)
    if digits.startswith("0092"):
        digits = digits[2:]
    if digits.startswith("0"):
        digits = "92" + digits[1:]
    return digits


def send_whatsapp(recipient: str, body: str, template_key: str | None = None) -> str:
    """Returns Meta's message id. Raises httpx.HTTPError / RuntimeError when it did not go."""
    url = (
        f"https://graph.facebook.com/{settings.whatsapp_api_version}"
        f"/{settings.whatsapp_phone_id}/messages"
    )
    tpl = _templates().get(template_key or "")
    payload: dict = {"messaging_product": "whatsapp", "to": to_international(recipient)}
    if tpl:
        payload["type"] = "template"
        payload["template"] = {
            "name": tpl["name"],
            "language": {"code": tpl.get("lang", "en")},
            "components": [{"type": "body", "parameters": [{"type": "text", "text": body}]}],
        }
    else:
        payload["type"] = "text"
        payload["text"] = {"preview_url": False, "body": body}
    r = httpx.post(
        url,
        json=payload,
        headers={"Authorization": f"Bearer {settings.whatsapp_token}"},
        timeout=20,
    )
    if r.status_code >= 400:
        try:
            detail = r.json().get("error", {}).get("message") or r.text
        except ValueError:
            detail = r.text
        raise RuntimeError(f"WhatsApp API {r.status_code}: {detail[:300]}")
    data = r.json()
    return (data.get("messages") or [{}])[0].get("id") or ""


# ---- email over SMTP -----------------------------------------------------------------------


def email_configured() -> bool:
    return bool(settings.smtp_host and (settings.smtp_from or settings.smtp_user))


def send_email(recipient: str, subject: str, body: str) -> str:
    """Plain-text mail through the configured SMTP account. Returns the Message-ID."""
    msg = EmailMessage()
    msg["From"] = settings.smtp_from or settings.smtp_user
    msg["To"] = recipient
    msg["Subject"] = subject or settings.app_name
    msg["Message-ID"] = make_msgid()
    msg.set_content(body)
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as smtp:
        if settings.smtp_starttls:
            smtp.starttls()
        if settings.smtp_user:
            smtp.login(settings.smtp_user, settings.smtp_password)
        smtp.send_message(msg)
    return msg["Message-ID"]
