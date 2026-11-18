"""Owner 2026-11-18 (ADR-107): customers and dealers come from other countries too. A Pakistani
number is stored as it always was (03XXXXXXXXX); a number of another country with its country code
(+971501234567). WhatsApp links and messages use the number's own country code."""

import pathlib
import re

import pytest

from app.core.pk import DIAL_CODES, NATIONAL_LEN, dial_code, normalise_phone, wa_number
from app.modules.notifications import provider
from app.modules.notifications.service import wa_link
from tests.conftest import login


def test_pakistani_numbers_are_stored_as_before():
    for raw in (
        "03001234567",
        "+92 300 1234567",
        "0092-300-1234567",
        "923001234567",
        "3001234567",
        "۰۳۰۰۱۲۳۴۵۶۷",
    ):
        assert normalise_phone(raw) == "03001234567"
    assert wa_number("03001234567") == "923001234567"
    assert provider.to_international("0321-9876543") == "923219876543"
    assert wa_link("03219876543", "hi").startswith("https://wa.me/923219876543?text=")


def test_a_number_of_another_country_keeps_its_code():
    cases = {
        "+971 50 123 4567": "+971501234567",
        "00971501234567": "+971501234567",
        "+971 (0)50-123-4567": "+971501234567",  # the 0 people write after the code is dropped
        "+966 50 123 4567": "+966501234567",
        "+44 7911 123456": "+447911123456",
        "+1 (415) 555-2671": "+14155552671",
        "+93 70 123 4567": "+93701234567",
        "+86 138 0013 8000": "+8613800138000",
        "+81 90 1234 5678": "+819012345678",  # a country with no fixed length in the table
    }
    for raw, stored in cases.items():
        assert normalise_phone(raw) == stored, raw
        assert normalise_phone(stored) == stored  # storing it again changes nothing
        assert wa_number(stored) == stored[1:]
    assert provider.to_international("+971501234567") == "971501234567"
    assert wa_link("+971 50 123 4567", "hi").startswith("https://wa.me/971501234567?text=")
    assert dial_code("971501234567") == "971" and dial_code("14155552671") == "1"


@pytest.mark.parametrize(
    "raw",
    [
        "12345",
        "0501234567",  # another country's number without its code
        "971501234567",  # no + : cannot be told from a wrong Pakistani number
        "+97150123",  # too short for the UAE
        "+9715012345678",  # too long for the UAE
        "+924235761234",  # +92 must still be a Pakistani mobile
        "+999123456789",  # not a country code
        "+",
        "+971abc",
    ],
)
def test_wrong_numbers_are_refused(raw):
    with pytest.raises(ValueError):
        normalise_phone(raw)


def test_the_app_and_the_server_know_the_same_countries():
    """`frontend/src/lib/phone.ts` carries the same table; a country added on one side only would
    let the app accept what the server refuses."""
    ts = pathlib.Path(__file__).resolve().parents[2] / "frontend" / "src" / "lib" / "phone.ts"
    text = ts.read_text(encoding="utf-8")
    known = re.findall(r"\['([A-Z]{2})', '(\d+)', (\d+), (\d+), '[^']*'\]", text)
    assert len(known) > 30
    for iso, dial, lo, hi in known:
        assert dial in DIAL_CODES, iso
        if dial == "92":
            continue
        assert NATIONAL_LEN[dial] == (int(lo), int(hi)), iso
    assert {d for _, d, _, _ in known} - {"92"} == set(NATIONAL_LEN)
    others = re.search(r"const OTHERS =\n((?:\s+'[^']+' ?\+?\n)+)", text).group(1)
    pairs = re.findall(r"([A-Z]{2}) (\d+)", others)
    assert len(pairs) > 150
    for iso, dial in pairs:
        assert dial in DIAL_CODES, iso
        assert dial not in NATIONAL_LEN, iso  # a country with a known length belongs in KNOWN


def test_a_foreign_customer_and_dealer_in_the_shop(owner, client):
    # a dealer in Dubai, a customer in the UK
    r = owner.post(
        "/api/v1/parties",
        json={"name": "Dubai Trader", "phone": "+971 50 123 4567", "kinds": ["supplier"]},
    )
    assert r.status_code == 201, r.text
    dealer = r.json()
    assert dealer["phone"] == "+971501234567"
    r = owner.post(
        "/api/v1/parties",
        json={"name": "John", "phone": "00447911123456", "kinds": ["customer"]},
    )
    assert r.status_code == 201 and r.json()["phone"] == "+447911123456"
    # found by the number however it is written; the same number twice is still one person
    for way in ("+971501234567", "00971501234567", "+971 050 123 4567"):
        got = owner.get(f"/api/v1/parties/by-phone/{way}")
        assert got.status_code == 200 and got.json()["id"] == dealer["id"], way
    hits = owner.get("/api/v1/parties", params={"q": "971501"}).json()
    assert [p["id"] for p in hits] == [dealer["id"]]
    again = owner.post(
        "/api/v1/parties",
        json={"name": "Someone else", "phone": "00971501234567", "kinds": ["customer"]},
    )
    assert again.status_code in (200, 201, 409), again.text
    if again.status_code != 409:
        assert again.json()["id"] == dealer["id"]
    # a Pakistani person beside them, as before
    r = owner.post(
        "/api/v1/parties", json={"name": "Ali", "phone": "0300 1234567", "kinds": ["customer"]}
    )
    assert r.status_code == 201 and r.json()["phone"] == "03001234567"
    # a wrong number is refused with the server's own message
    bad = owner.post(
        "/api/v1/parties", json={"name": "X Y", "phone": "+97150", "kinds": ["customer"]}
    )
    assert bad.status_code == 422

    # a staff member with a foreign number can log in with it
    r = owner.post(
        "/api/v1/staff",
        json={
            "name": "Imran",
            "phone": "+966 50 123 4567",
            "password": "secret123",
            "role": "salesman",
        },
    )
    assert r.status_code == 201, r.text
    assert login(client, "+966501234567").get("/api/v1/parties").status_code == 200
