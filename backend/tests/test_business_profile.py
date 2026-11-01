"""Business profile (docs/30): the shop's legal name, tagline, owner, contact, NTN / STRN / FBR POS
ID, bank details, terms, currency label and print choices are saved and validated; the logo is
uploaded; and the printed bill shows what the shop chose."""

import io

from PIL import Image

from tests.test_payments import IMEI_A, _sale
from tests.test_purchases import _party


def _png() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (60, 30), (20, 120, 200)).save(buf, "PNG")
    return buf.getvalue()


def test_profile_saved_and_validated(owner):
    r = owner.patch(
        "/api/v1/shops/current",
        json={
            "legal_name": "Al-Madina Traders (Pvt) Ltd",
            "tagline": "Phones you can trust",
            "tagline_ur": "بھروسے کے موبائل",
            "business_type": "company",
            "registration_no": "0123456",
            "established_year": 2012,
            "province": "punjab",
            "email": "info@almadina.pk",
            "website": "almadina.pk",
            "social": {"facebook": "fb.com/almadina", "instagram": "", "junk": "x"},
            "opening_hours": "11 am – 10 pm, Friday closed",
            "owner_name": "Hamza Iqbal",
            "owner_cnic": "3520212345671",
            "ntn": "1234567-8",
            "strn": "32-77-8761-234-56",
            "fbr_pos_id": "POS-998877",
            "bank_details": {"bank": "Meezan", "title": "Al-Madina", "iban": "PK36MEZN0000000123456789"},
            "terms": "No return after 7 days. Warranty by the company.",
            "currency": {"symbol": "PKR", "position": "after", "decimals": 0},
            "print_prefs": {"logo": True, "owner": True, "bank": True},
            "address": "Shop 12, Hall Road",
            "whatsapp": "03001234567",
        },
    )
    assert r.status_code == 200, r.text
    s = owner.get("/api/v1/shops/current").json()
    assert s["legal_name"].startswith("Al-Madina") and s["owner_cnic"] == "35202-1234567-1"
    assert s["ntn"] == "1234567-8" and s["strn"] == "3277876123456" and s["social"] == {"facebook": "fb.com/almadina"}
    assert s["currency"] == {"code": "PKR", "symbol": "PKR", "position": "after", "decimals": 0}
    assert s["address"] == "Shop 12, Hall Road" and s["bank_details"]["iban"].startswith("PK36")
    # me carries the currency for the app's money labels
    me = owner.get("/api/v1/me").json()
    shop = next(x for x in me["shops"] if x["id"] == owner.shop_id)
    assert shop["currency"]["symbol"] == "PKR"
    for bad in ({"ntn": "12"}, {"strn": "123"}, {"email": "nope"}, {"currency": {"symbol": "$"}}, {"province": "mars"}, {"owner_cnic": "123"}):
        assert owner.patch("/api/v1/shops/current", json=bad).status_code == 422, bad


def test_logo_upload_and_the_printed_bill(client, owner, cat):
    r = owner.post("/api/v1/shops/current/logo", files={"file": ("logo.png", _png(), "image/png")})
    assert r.status_code == 200, r.text
    assert r.json()["logo_path"].endswith(".png")
    assert owner.post("/api/v1/shops/current/logo", files={"file": ("x.pdf", b"%PDF-1", "application/pdf")}).status_code == 422
    owner.patch(
        "/api/v1/shops/current",
        json={
            "tagline": "Phones you can trust",
            "ntn": "1234567-8",
            "fbr_pos_id": "POS-998877",
            "owner_name": "Hamza Iqbal",
            "terms": "No return after 7 days.",
            "bank_details": {"bank": "Meezan", "iban": "PK36MEZN0000000123456789"},
            "currency": {"symbol": "PKR", "position": "after"},
            "print_prefs": {"owner": True, "bank": True},
        },
    )
    c = _party(owner, name="Ahmed Khan", phone="03219876543", kinds=("customer",))
    inv = _sale(owner, cat, c, IMEI_A, 50000, 30000)
    html = owner.get(f"/api/v1/sales/{inv['id']}/receipt?lang=en").text
    assert "data:image/png;base64," in html
    assert "Phones you can trust" in html and "NTN 1234567-8" in html and "FBR POS POS-998877" in html
    assert "Prop. Hamza Iqbal" in html and "No return after 7 days." in html and "PK36MEZN" in html
    assert "50,000 PKR" in html
    # print choices switch things off; removing the logo removes it from the bill
    owner.patch("/api/v1/shops/current", json={"print_prefs": {"logo": False, "ntn": False, "bank": False, "terms": False}})
    html = owner.get(f"/api/v1/sales/{inv['id']}/receipt?lang=en").text
    assert "data:image" not in html and "NTN" not in html and "PK36MEZN" not in html and "No return" not in html
    assert owner.delete("/api/v1/shops/current/logo").json()["logo_path"] is None


def test_only_settings_managers_change_the_profile(client, owner):
    from tests.conftest import login

    owner.post("/api/v1/staff", json={"name": "Sales", "phone": "03451112233", "password": "secret123", "role": "salesman"})
    s = login(client, "03451112233")
    assert s.patch("/api/v1/shops/current", json={"tagline": "x"}).status_code == 403
    assert s.post("/api/v1/shops/current/logo", files={"file": ("logo.png", _png(), "image/png")}).status_code == 403
