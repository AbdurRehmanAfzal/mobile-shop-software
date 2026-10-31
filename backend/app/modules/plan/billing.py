"""Billing settings of the software provider: bank / wallet details, support contact, the reminder
schedule and the grace days. Kept in `platform_settings` (key `billing`), edited only in Super
admin. Seeded with placeholders the owner replaces (README → "Billing settings")."""

import copy

from sqlalchemy.orm import Session

from app.modules.admin.fees import PlatformSetting, accounts

KEY = "billing"

PLACEHOLDER = "PLACEHOLDER"

DEFAULTS: dict = {
    "bank": {
        "bank_name": "PLACEHOLDER Bank",
        "account_title": "PLACEHOLDER Account Title",
        "account_number": "PLACEHOLDER-0000000000",
        "iban": "PK00PLAC0000000000000000",
        "branch": "PLACEHOLDER Branch",
    },
    # wallets (Easypaisa / JazzCash / SadaPay …) come from the existing `payment_accounts` setting
    "support": {
        "phone": "+92 300 0000000",  # PLACEHOLDER
        "whatsapp": "+92 300 0000000",  # PLACEHOLDER
    },
    "qr_path": None,  # optional: an uploaded image (purpose `billing`) shown in the popup
    "schedule": {
        "info_days": 7,  # yellow bar only
        "warn_days": 3,  # orange bar + popup once a day
        "urgent_days": 1,  # red bar + popup, snooze a few hours
        "grace_days": 7,  # after expiry: still works, red bar, popup on every login
        "snooze_hours": 4,  # the "few hours"
    },
    # a short note shown in the popup under the warning, per language (optional)
    "note": {"en": "", "ur": "", "roman": ""},
}


def get(db: Session) -> dict:
    row = db.get(PlatformSetting, KEY)
    value = copy.deepcopy(DEFAULTS)
    if row and isinstance(row.value, dict):
        for k, v in row.value.items():
            if isinstance(v, dict) and isinstance(value.get(k), dict):
                value[k].update(v)
            else:
                value[k] = v
    return value


def set_(db: Session, value: dict) -> dict:
    clean = get(db)
    for k in ("bank", "support", "schedule", "note"):
        if isinstance(value.get(k), dict):
            clean[k].update({kk: vv for kk, vv in value[k].items() if kk in clean[k]})
    if "qr_path" in value:
        clean["qr_path"] = value["qr_path"] or None
    s = clean["schedule"]
    for k in ("info_days", "warn_days", "urgent_days", "grace_days", "snooze_hours"):
        s[k] = max(0, min(int(s[k]), 365))
    if not (s["urgent_days"] <= s["warn_days"] <= s["info_days"]):
        s["info_days"], s["warn_days"], s["urgent_days"] = (
            max(s["info_days"], s["warn_days"], s["urgent_days"]),
            sorted([s["info_days"], s["warn_days"], s["urgent_days"]])[1],
            min(s["info_days"], s["warn_days"], s["urgent_days"]),
        )
    row = db.get(PlatformSetting, KEY)
    if row is None:
        db.add(PlatformSetting(key=KEY, value=clean))
    else:
        row.value = clean
    db.commit()
    return clean


def is_placeholder(value: dict) -> bool:
    b = value.get("bank", {})
    return any(PLACEHOLDER in str(v) for v in b.values()) or "0000000" in str(
        value.get("support", {}).get("whatsapp", "")
    )


def for_shopkeeper(db: Session) -> dict:
    """What the owner sees in the popup / payment screen: bank, wallets, support, QR, note.
    Placeholder bank lines are left out so a half-configured install never shows fake numbers."""
    v = get(db)
    bank = v["bank"] if not any(PLACEHOLDER in str(x) for x in v["bank"].values()) else None
    support = v["support"]
    if "0000000" in str(support.get("whatsapp", "")):
        support = {"phone": None, "whatsapp": None}
    return {
        "bank": bank,
        "wallets": accounts(db),
        "support": support,
        "qr_path": v.get("qr_path"),
        "note": v.get("note", {}),
    }


def schedule(db: Session) -> dict:
    return get(db)["schedule"]
