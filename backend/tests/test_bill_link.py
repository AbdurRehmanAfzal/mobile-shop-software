"""Owner 2026-11-07: a QR on every sale bill opens the bill online without a login. The page shows
the bill and what is left on it, never the customer's name or phone, the full IMEI, a cost or the
khata balance; a changed link opens nothing; the shop can switch the QR off."""

from tests.test_devices import _stock
from tests.test_purchases import _party

IMEI = "490154203237518"


def _receipt(owner, inv_id):
    return owner.client.get(
        f"/api/v1/sales/{inv_id}/receipt", params={"lang": "en"}, headers=owner.headers()
    ).text


def test_bill_qr_opens_the_bill_and_nothing_private(client, owner, cat, monkeypatch):
    monkeypatch.setattr(
        "app.core.config.settings.public_url", "https://shop.example.pk/", raising=False
    )
    c = _party(owner, name="Ahmed Khan", phone="03219876543", kinds=("customer",))
    d = _stock(owner, cat, imei=IMEI, condition="box_pack", cost_price=40000, asking_price=45000)
    inv = owner.post(
        "/api/v1/sales",
        json={
            "party_id": c["id"],
            "devices": [{"device_id": d["id"], "price": 45000}],
            "misc": [{"description": "Cover", "qty": 2, "unit_price": 500}],
            "paid": 30000,
        },
    ).json()

    # the printed bill carries a QR that holds the signed link
    from app.modules.sales import bill_link

    tok = bill_link.token(__import__("uuid").UUID(inv["id"]))
    html = _receipt(owner, inv["id"])
    assert "Scan to see this bill online" in html and "<svg" in html

    r = client.get(f"/api/v1/public/bill/{tok}")  # no login
    assert r.status_code == 200, r.text
    v = r.json()
    assert v["no"] == inv["no"] and v["state"] == "partial"
    assert v["total"] == "46000.00" and v["paid"] == "30000.00" and v["due"] == "16000.00"
    assert [ln["qty"] for ln in v["lines"]] == [1, 2]
    assert v["lines"][0]["imei_last4"] == "7518"
    for secret in ("Ahmed", "03219876543", IMEI, "40000"):
        assert secret not in r.text

    # a changed or made-up link opens nothing
    raw, sig = tok.split(".")
    assert client.get(f"/api/v1/public/bill/{raw}.{'0' * len(sig)}").status_code == 404
    assert client.get("/api/v1/public/bill/nonsense").status_code == 404

    # the shop switches the QR off
    owner.patch("/api/v1/shops/current", json={"print_prefs": {"qr": False}})
    assert "Scan to see this bill online" not in _receipt(owner, inv["id"])


def test_without_a_public_address_the_qr_holds_the_bill_number(owner, cat, monkeypatch):
    monkeypatch.setattr("app.core.config.settings.public_url", "", raising=False)
    monkeypatch.setattr(
        "app.core.config.settings.webauthn_origins", "http://localhost:5173", raising=False
    )
    inv = owner.post(
        "/api/v1/sales",
        json={"misc": [{"description": "Charger", "qty": 1, "unit_price": 1500}], "paid": 1500},
    ).json()
    html = _receipt(owner, inv["id"])
    assert "Bill no." in html and "Scan to see" not in html
