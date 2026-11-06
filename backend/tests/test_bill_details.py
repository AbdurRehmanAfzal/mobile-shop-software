"""Tax-invoice details on the bill (docs/36 §6): the amount in words, the cashier and time, cash given
and change, tax by rate, and phones under the Ninth Schedule (sales tax paid at import)."""

from decimal import Decimal

from app.core.words import amount_in_words
from tests.test_devices import _stock

A = "490154203237518"


def test_amount_in_words_lakh_and_crore():
    assert amount_in_words(568) == "Rupees Five Hundred Sixty-Eight Only"
    assert amount_in_words(Decimal(152000)) == "Rupees One Lakh Fifty-Two Thousand Only"
    assert (
        amount_in_words(12345678)
        == "Rupees One Crore Twenty-Three Lakh Forty-Five Thousand Six Hundred Seventy-Eight Only"
    )
    assert amount_in_words("45000.50") == "Rupees Forty-Five Thousand and Fifty Paisa Only"
    assert amount_in_words(568, "ur") == "صرف پانچ سو اڑسٹھ روپے"
    assert amount_in_words(152000, "ur") == "صرف ایک لاکھ باون ہزار روپے"


def test_phones_carry_no_tax_when_paid_at_import(owner, cat):
    owner.patch(
        "/api/v1/shops/current",
        json={"phones_tax_at_import": True, "ntn": "1234567", "default_locale": "en"},
    )
    assert owner.get("/api/v1/shops/current").json()["phones_tax_at_import"] is True
    d = _stock(owner, cat, imei=A, condition="box_pack", cost_price=38000, asking_price=40000)
    item = owner.post(
        "/api/v1/accessories",
        json={
            "name": "Fast charger",
            "category": "charger",
            "price": 1000,
            "opening_qty": 5,
            "opening_cost": 600,
        },
    ).json()
    r = owner.post(
        "/api/v1/sales",
        json={
            "devices": [{"device_id": d["id"], "price": 40000}],
            "misc": [
                {
                    "description": "Fast charger",
                    "qty": 1,
                    "unit_price": 1000,
                    "accessory_id": item["id"],
                }
            ],
            "tax_rate": 18,
            "paid": 41180,
            "cash_tendered": 42000,
        },
    )
    assert r.status_code == 201, r.text
    inv = r.json()
    # tax only on the charger: 18% of 1,000
    assert inv["tax_amount"] == "180.00" and inv["total"] == "41180.00"
    html = owner.client.get(
        f"/api/v1/sales/{inv['id']}/receipt", params={"lang": "en"}, headers=owner.headers()
    ).text
    for want in (
        "Total excl. tax",
        "Tax 18% on 1,000",
        "Ninth Schedule",
        "Rupees Forty-One Thousand One Hundred Eighty Only",
        "Cashier:",
        "Cash given",
        "Change",
        ">820<",
    ):
        assert want in html, want
    ur = owner.client.get(
        f"/api/v1/sales/{inv['id']}/receipt", params={"lang": "ur"}, headers=owner.headers()
    ).text
    assert "صرف اکتالیس ہزار ایک سو اسی روپے" in ur and "نواں شیڈول" in ur


def test_setting_off_taxes_phones_as_before_and_cash_given_checked(owner, cat):
    d = _stock(owner, cat, imei=A, condition="box_pack", cost_price=38000, asking_price=40000)
    inv = owner.post(
        "/api/v1/sales",
        json={"devices": [{"device_id": d["id"], "price": 40000}], "tax_rate": 18, "paid": 47200},
    ).json()
    assert inv["tax_amount"] == "7200.00"  # unchanged for shops that did not switch it on
    d2 = _stock(
        owner, cat, imei="356938035643809", condition="box_pack", cost_price=1000, asking_price=1500
    )
    r = owner.post(
        "/api/v1/sales",
        json={
            "devices": [{"device_id": d2["id"], "price": 1500}],
            "paid": 1500,
            "cash_tendered": 1000,
        },
    )
    assert r.status_code == 422 and r.json()["error"]["code"] == "tendered_below_paid"
