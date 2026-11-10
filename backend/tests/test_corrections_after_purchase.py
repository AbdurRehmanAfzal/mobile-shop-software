"""Owner 2026-11-09 (ADR-056): a typing mistake found after the phone was put in stock — a wrong IMEI
or the wrong dealer / customer — is put right by the owner or manager. Nothing is erased: the
phone's history and the ledger keep the old value and the correction."""

from tests.conftest import login
from tests.test_purchases import IMEI_A, IMEI_B, _dev, _party

FIXED = "353456789012348"
IMEI2 = "353456789012355"


def _buy(owner, cat, party, imei=IMEI_A, cost=1000, paid=0, **extra):
    r = owner.post(
        "/api/v1/purchases",
        json={
            "kind": "supplier",
            "party_id": party["id"],
            "devices": [{"device": _dev(cat, imei, **extra), "cost": cost}],
            "paid": paid,
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


def test_wrong_imei_put_right(client, owner, cat):
    sup = _party(owner)
    p = _buy(owner, cat, sup, imei2=IMEI_B)
    dev = p["lines"][0]["device_id"]
    url = f"/api/v1/devices/{dev}/correct-imei"

    # a salesman may not; a reason is needed; the number must be a real IMEI
    owner.post(
        "/api/v1/staff",
        json={"name": "Sales", "phone": "03451112233", "password": "secret123", "role": "salesman"},
    )
    s = login(client, "03451112233")
    assert s.post(url, json={"imei1": FIXED, "reason": "typo"}).status_code == 403
    assert owner.post(url, json={"imei1": FIXED}).status_code == 422
    assert (
        owner.post(url, json={"imei1": "12345", "reason": "typo"}).json()["error"]["code"]
        == "imei_invalid"
    )

    r = owner.post(url, json={"imei1": FIXED, "imei2": IMEI2, "reason": "typed two digits wrong"})
    assert r.status_code == 200, r.text
    assert r.json()["imei1"] == FIXED and r.json()["imei2"] == IMEI2
    # the history keeps the old numbers and why
    hist = owner.get(f"/api/v1/devices/{dev}/history").json()
    fixes = [e for e in hist if e["type"] == "corrected"]
    assert {(e["data"]["field"], e["data"]["from"], e["data"]["to"]) for e in fixes} == {
        ("imei1", IMEI_A, FIXED),
        ("imei2", IMEI_B, IMEI2),
    }
    assert fixes[0]["data"]["reason"] == "typed two digits wrong"
    assert owner.get(f"/api/v1/devices/imei/{FIXED}").json()["device"]["id"] == dev
    assert owner.get(f"/api/v1/devices/imei/{IMEI_A}").json()["found"] is False

    # a number another phone already has is refused; IMEI 2 can be removed
    other = _buy(owner, cat, sup, imei=IMEI_A)
    r = owner.post(
        f"/api/v1/devices/{other['lines'][0]['device_id']}/correct-imei",
        json={"imei1": FIXED, "reason": "x1"},
    )
    assert r.status_code == 409 and r.json()["error"]["code"] == "imei_exists"
    r = owner.post(url, json={"clear_imei2": True, "reason": "single SIM"})
    assert r.status_code == 200 and r.json()["imei2"] is None
    assert (
        owner.post(url, json={"imei1": FIXED, "reason": "again"}).json()["error"]["code"]
        == "nothing_changed"
    )


def test_wrong_seller_put_right(client, owner, cat):
    wrong = _party(owner, name="Wrong Traders", phone="03001111111")
    right = _party(owner, name="Right Traders", phone="03002222222")
    p = _buy(owner, cat, wrong, cost=1000, paid=300)
    assert owner.get(f"/api/v1/parties/{wrong['id']}").json()["balance"] == "-700.00"

    r = owner.post(
        f"/api/v1/purchases/{p['id']}/party",
        json={"party_id": right["id"], "reason": "picked the wrong dealer"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["party_id"] == right["id"]
    # the bill and what was paid with it moved to the right khata; the old one is clear
    assert owner.get(f"/api/v1/parties/{wrong['id']}").json()["balance"] == "0.00"
    assert owner.get(f"/api/v1/parties/{right['id']}").json()["balance"] == "-700.00"
    # cash did not move
    assert owner.get("/api/v1/ledger/accounts").json()[0]["balance"] == "-300.00"
    hist = owner.get(f"/api/v1/devices/{p['lines'][0]['device_id']}/history").json()
    fix = next(e for e in hist if e["type"] == "corrected")
    assert fix["data"] == {
        "field": "seller",
        "from": "Wrong Traders",
        "to": "Right Traders",
        "reason": "picked the wrong dealer",
        "purchase_no": p["no"],
    }
    # same person again / unknown person
    assert (
        owner.post(
            f"/api/v1/purchases/{p['id']}/party", json={"party_id": right["id"], "reason": "x1"}
        ).json()["error"]["code"]
        == "same_party"
    )

    # once a later payment was made against the bill, it is refused
    p2 = _buy(owner, cat, wrong, imei=IMEI_B, cost=500)
    pay = owner.post(
        "/api/v1/payments",
        json={
            "party_id": wrong["id"],
            "direction": "out",
            "amount": 200,
            "allocations": [{"document_type": "purchase", "document_id": p2["id"], "amount": 200}],
        },
    )
    assert pay.status_code == 201, pay.text
    r = owner.post(
        f"/api/v1/purchases/{p2['id']}/party", json={"party_id": right["id"], "reason": "x1"}
    )
    assert r.status_code == 409 and r.json()["error"]["code"] == "purchase_has_later_money"

    # staff may not
    owner.post(
        "/api/v1/staff",
        json={"name": "Sales", "phone": "03451112233", "password": "secret123", "role": "salesman"},
    )
    s = login(client, "03451112233")
    assert (
        s.post(
            f"/api/v1/purchases/{p['id']}/party", json={"party_id": wrong["id"], "reason": "x1"}
        ).status_code
        == 403
    )


def test_stock_shows_the_seller_after_a_change(owner, cat):
    """Owner 2026-11-10: after "change dealer / customer" the stock list, the phone and the
    "bought from" filter show the new person (the purchase event keeps the old one)."""
    wrong = _party(owner, name="Old Seller", phone="03004444444")
    right = _party(owner, name="New Seller", phone="03005555555")
    p = _buy(owner, cat, wrong)
    dev = p["lines"][0]["device_id"]
    r = owner.post(
        f"/api/v1/purchases/{p['id']}/party", json={"party_id": right["id"], "reason": "wrong one"}
    )
    assert r.status_code == 200, r.text
    row = next(d for d in owner.get("/api/v1/devices").json() if d["id"] == dev)
    assert row["source_party_name"] == "New Seller"
    assert owner.get(f"/api/v1/devices/{dev}").json()["source_party_name"] == "New Seller"
    ids = lambda who: [
        d["id"] for d in owner.get(f"/api/v1/devices?supplier_id={who['id']}").json()
    ]
    assert dev in ids(right)
    assert dev not in ids(wrong)
