"""Owner 2026-11-13 (ADR-067): a purchase entered as "paid in full in cash" that really came on
udhaar is put right — even after its phones were sold. The cash goes back to the galla, the seller's
khata shows what is owed; nothing is erased and the phones are not touched."""

from tests.conftest import login
from tests.test_corrections_after_purchase import _buy
from tests.test_purchases import IMEI_B, _party


def _bal(owner, p):
    return owner.get(f"/api/v1/parties/{p['id']}").json()["balance"]


def _cash(owner):
    return owner.get("/api/v1/ledger/accounts").json()[0]["balance"]


def test_cash_purchase_made_udhaar_after_the_phone_was_sold(client, owner, cat):
    sup = _party(owner, name="Udhaar Dealer", phone="03007771111")
    p = _buy(owner, cat, sup, cost=20000, paid=20000)
    dev = p["lines"][0]["device_id"]
    assert _bal(owner, sup) == "0.00"
    assert _cash(owner) == "-20000.00"
    # the phone is sold before anyone notices
    sale = owner.post(
        "/api/v1/sales", json={"devices": [{"device_id": dev, "price": 25000}], "paid": 25000}
    )
    assert sale.status_code == 201, sale.text
    assert _cash(owner) == "5000.00"

    url = f"/api/v1/purchases/{p['id']}/paid"
    r = owner.post(
        url, json={"paid_now": 0, "due_date": "2026-12-01", "reason": "it came on udhaar"}
    )
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["paid"] == "0.00" and out["balance_due"] == "20000.00"
    assert out["due_date"] == "2026-12-01"
    assert out["payment"] is None
    # the 20,000 is back in the galla; the dealer is owed it
    assert _cash(owner) == "25000.00"
    assert _bal(owner, sup) == "-20000.00"
    # the phone stays sold; its history keeps the change
    d = owner.get(f"/api/v1/devices/{dev}").json()
    assert d["status"] == "sold"
    fix = next(
        e for e in owner.get(f"/api/v1/devices/{dev}/history").json() if e["type"] == "corrected"
    )
    assert fix["data"]["field"] == "paid"
    assert (fix["data"]["from"], fix["data"]["to"]) == ("20000.00", "0.00")

    # part of it was paid after all: 5,000 online
    r = owner.post(
        url,
        json={
            "paid_now": 5000,
            "payment": {"method": "online", "bank": "JazzCash", "reference": "T1"},
            "reason": "5,000 was sent by JazzCash",
        },
    )
    assert r.status_code == 200, r.text
    assert r.json()["paid"] == "5000.00" and r.json()["payment"]["bank"] == "JazzCash"
    assert _bal(owner, sup) == "-15000.00"
    assert _cash(owner) == "25000.00"  # the cash drawer did not move

    # the same amount again; out of range; a salesman may not
    assert owner.post(url, json={"paid_now": 5000, "reason": "x1"}).json()["error"]["code"] == (
        "same_paid"
    )
    assert owner.post(url, json={"paid_now": 30000, "reason": "x1"}).json()["error"]["code"] == (
        "paid_out_of_range"
    )
    owner.post(
        "/api/v1/staff",
        json={"name": "Sales", "phone": "03451112233", "password": "secret123", "role": "salesman"},
    )
    s = login(client, "03451112233")
    assert s.post(url, json={"paid_now": 0, "reason": "x1"}).status_code == 403


def test_later_payments_stay(owner, cat):
    sup = _party(owner, name="Later Dealer", phone="03007772222")
    p = _buy(owner, cat, sup, imei=IMEI_B, cost=10000, paid=4000)
    pay = owner.post(
        "/api/v1/payments",
        json={
            "party_id": sup["id"],
            "direction": "out",
            "amount": 3000,
            "allocations": [{"document_type": "purchase", "document_id": p["id"], "amount": 3000}],
        },
    )
    assert pay.status_code == 201, pay.text
    # at the purchase nothing was paid really: 4,000 back; the later 3,000 stays
    r = owner.post(f"/api/v1/purchases/{p['id']}/paid", json={"paid_now": 0, "reason": "udhaar"})
    assert r.status_code == 200, r.text
    assert r.json()["paid"] == "3000.00" and r.json()["balance_due"] == "7000.00"
    assert _bal(owner, sup) == "-7000.00"
    # the room is total − later payments
    r = owner.post(f"/api/v1/purchases/{p['id']}/paid", json={"paid_now": 8000, "reason": "x1"})
    assert r.json()["error"]["code"] == "paid_out_of_range"
