"""FBR Digital Invoicing (docs/36 §4, ADR-050) against a stand-in for FBR: settings and the secret
token, the bill queued with the sale, accepted / rejected / unreachable, never posted twice, and the
FBR number with its QR on the printed bill."""

from tests.conftest import login
from tests.test_devices import _stock

A = "490154203237518"
calls: list[dict] = []


def _fbr(monkeypatch, outcome="ok"):
    """replace the call to FBR: 'ok' accepts, 'reject' says invalid, 'down' is unreachable"""
    calls.clear()

    def fake_post(body, token, *, validate_only=False):
        calls.append({"body": body, "token": token, "validate_only": validate_only})
        if outcome == "down":
            return None, None, "FBR not reachable: ConnectError"
        if outcome == "reject":
            return (
                None,
                {
                    "validationResponse": {
                        "statusCode": "01",
                        "status": "Invalid",
                        "error": "Invalid HS code",
                    }
                },
                "Invalid HS code",
            )
        return (
            "7000007DI1747119701593",
            {"invoiceNumber": "7000007DI1747119701593", "validationResponse": {"statusCode": "00"}},
            None,
        )

    monkeypatch.setattr("app.modules.fbr.service.post", fake_post)


def _turn_on(owner):
    owner.patch(
        "/api/v1/shops/current",
        json={"ntn": "0786909", "province": "sindh", "phones_tax_at_import": True},
    )
    r = owner.put(
        "/api/v1/fbr/settings",
        json={"enabled": True, "env": "sandbox", "token": "secret-di-token-123"},
    )
    assert r.status_code == 200, r.text
    return r.json()


def _sale(owner, cat, imei=A, taxed=True):
    d = _stock(owner, cat, imei=imei, condition="box_pack", cost_price=38000, asking_price=40000)
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
            "tax_rate": 18 if taxed else 0,
            "paid": 41180 if taxed else 41000,
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


def test_settings_keep_the_token_secret(client, owner):
    r = owner.put("/api/v1/fbr/settings", json={"enabled": True, "token": "abc"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "fbr_not_ready"  # no NTN yet
    s = _turn_on(owner)
    assert (
        s["enabled"] and s["token_set"] and s["ready"] and "token" not in s and "token_enc" not in s
    )
    assert "secret-di-token-123" not in owner.get("/api/v1/fbr/settings").text
    assert "secret-di-token-123" not in owner.get("/api/v1/shops/current").text
    owner.post(
        "/api/v1/staff",
        json={"name": "Sales", "phone": "03451112277", "password": "secret123", "role": "salesman"},
    )
    assert login(client, "03451112277").get("/api/v1/fbr/settings").status_code == 403


def test_bill_is_sent_once_and_prints_the_fbr_number(owner, cat, monkeypatch):
    _turn_on(owner)
    _fbr(monkeypatch, "ok")
    inv = _sale(owner, cat)
    st = owner.get(f"/api/v1/fbr/invoice/{inv['id']}").json()
    assert st is not None and st["status"] in ("pending", "sent")
    owner.post("/api/v1/fbr/send-pending")
    st = owner.get(f"/api/v1/fbr/invoice/{inv['id']}").json()
    assert st["status"] == "sent" and st["fbr_invoice_no"] == "7000007DI1747119701593"
    # what went to FBR: the seller, the scenario (sandbox), a phone with no tax and a charger at 18%
    body = calls[-1]["body"]
    assert calls[-1]["token"] == "secret-di-token-123"
    assert (
        body["invoiceType"] == "Sale Invoice"
        and body["sellerNTNCNIC"] == "0786909"
        and body["sellerProvince"] == "SINDH"
    )
    assert body["buyerRegistrationType"] == "Unregistered" and "scenarioId" in body
    phone, charger = body["items"]
    assert (
        phone["saleType"] == "Mobile Phones"
        and phone["hsCode"] == "8517.1300"
        and phone["salesTaxApplicable"] == 0
    )
    assert (
        charger["rate"] == "18%"
        and charger["valueSalesExcludingST"] == 1000
        and charger["salesTaxApplicable"] == 180
        and charger["totalValues"] == 1180
    )
    # sending again does nothing: an accepted bill is never posted twice
    n = len(calls)
    owner.post("/api/v1/fbr/send-pending")
    owner.post(f"/api/v1/fbr/submissions/{st['id']}/send")
    assert len(calls) == n
    html = owner.client.get(
        f"/api/v1/sales/{inv['id']}/receipt", params={"lang": "en"}, headers=owner.headers()
    ).text
    assert (
        "FBR Digital Invoicing System" in html
        and "7000007DI1747119701593" in html
        and "<svg" in html
    )


def test_unreachable_waits_and_rejected_needs_a_fix(owner, cat, monkeypatch):
    _turn_on(owner)
    _fbr(monkeypatch, "down")
    inv = _sale(owner, cat)
    owner.post("/api/v1/fbr/send-pending")
    st = owner.get(f"/api/v1/fbr/invoice/{inv['id']}").json()
    assert st["status"] == "pending" and st["attempts"] >= 1 and "not reachable" in st["last_error"]
    html = owner.client.get(
        f"/api/v1/sales/{inv['id']}/receipt", params={"lang": "en"}, headers=owner.headers()
    ).text
    assert "FBR: waiting to be sent" in html
    # FBR reads it and says no: it stops trying until the shop presses "Send again"
    _fbr(monkeypatch, "reject")
    owner.post(f"/api/v1/fbr/submissions/{st['id']}/send")
    st = owner.get(f"/api/v1/fbr/invoice/{inv['id']}").json()
    assert st["status"] == "rejected" and st["last_error"] == "Invalid HS code"
    n = len(calls)
    owner.post("/api/v1/fbr/send-pending")
    assert len(calls) == n
    # fixed (e.g. the HS code in Settings), sent again: accepted
    _fbr(monkeypatch, "ok")
    st = owner.post(f"/api/v1/fbr/submissions/{st['id']}/send").json()
    assert st["status"] == "sent"
    lst = owner.get("/api/v1/fbr/submissions").json()
    assert lst["counts"]["sent"] == 1 and lst["rows"][0]["invoice_no"] == inv["no"]


def test_shops_without_fbr_are_untouched(owner, cat, monkeypatch):
    _fbr(monkeypatch, "ok")
    inv = _sale(owner, cat, taxed=False)
    assert owner.get(f"/api/v1/fbr/invoice/{inv['id']}").json() is None
    owner.post("/api/v1/fbr/send-pending")
    assert calls == []


def test_a_wrong_token_is_a_rejection_not_a_retry(monkeypatch):
    import httpx

    from app.modules.fbr import service

    class R:
        status_code = 401

        def json(self):
            raise ValueError

    monkeypatch.setattr(httpx, "post", lambda *a, **k: R())
    number, answer, error = service.post({}, "bad-token")
    assert number is None and answer == {"httpStatus": 401} and "token" in error
