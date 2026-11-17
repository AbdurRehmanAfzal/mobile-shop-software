"""Owner 2026-11-17 (ADR-099): a phone entered by mistake could not be deleted because a fault had
been marked and cleared on it ("has moved since this purchase"). A fault mark, a price change, a
label or a check is not a move; a loan, a sale or a reservation still is."""

from tests.test_devices import _stock
from tests.test_purchases import _dev, _party

A, B, C = "490154203237518", "356938035643809", "352099001761481"


def _buy(owner, cat, imei, cost=70000):
    sup = owner.get("/api/v1/parties", params={"q": "Rehman Traders"}).json()
    sup = (sup["items"] if isinstance(sup, dict) else sup) or [_party(owner)]
    p = owner.post(
        "/api/v1/purchases",
        json={
            "kind": "supplier",
            "party_id": sup[0]["id"],
            "devices": [{"device": _dev(cat, imei), "cost": cost}],
            "paid": cost,
        },
    )
    assert p.status_code == 201, p.text
    return p.json()


def _event(owner, dev_id, kind):
    r = owner.post(f"/api/v1/devices/{dev_id}/events", json={"type": kind})
    assert r.status_code in (200, 201), r.text


def test_purchase_deleted_after_a_fault_was_marked_and_cleared(owner, cat):
    p = _buy(owner, cat, A)
    dev = p["lines"][0]["device_id"]
    _event(owner, dev, "marked_faulty")
    _event(owner, dev, "faulty_cleared")
    cash = owner.get("/api/v1/ledger/accounts").json()[0]["balance"]
    r = owner.post(f"/api/v1/purchases/{p['id']}/void", json={"reason": "wrong category"})
    assert r.status_code == 200, r.text
    assert owner.get(f"/api/v1/devices/{dev}").json()["status"] == "returned_to_supplier"
    # the 70,000 paid is back in the galla
    back = owner.get("/api/v1/ledger/accounts").json()[0]["balance"]
    assert float(back) - float(cash) == 70000


def test_purchase_deleted_while_still_marked_faulty(owner, cat):
    p = _buy(owner, cat, B)
    dev = p["lines"][0]["device_id"]
    _event(owner, dev, "marked_faulty")
    r = owner.post(f"/api/v1/purchases/{p['id']}/void", json={"reason": "wrong entry"})
    assert r.status_code == 200, r.text
    assert owner.get(f"/api/v1/devices/{dev}").json()["status"] == "returned_to_supplier"


def test_a_loan_still_blocks_the_delete(owner, cat):
    p = _buy(owner, cat, C)
    dev = p["lines"][0]["device_id"]
    shop_b = _party(owner, name="Bilal Mobiles", phone="03001111111", kinds=("shop",))
    assert (
        owner.post("/api/v1/loans", json={"device_id": dev, "party_id": shop_b["id"]}).status_code
        == 201
    )
    r = owner.post(f"/api/v1/purchases/{p['id']}/void", json={"reason": "oops"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "device_changed"


def test_old_stock_phone_removed_after_a_fault_mark(owner, cat):
    d = _stock(owner, cat, imei=A, condition="box_pack", cost_price=1000, asking_price=1500)
    _event(owner, d["id"], "marked_faulty")
    _event(owner, d["id"], "faulty_cleared")
    r = owner.post(f"/api/v1/devices/{d['id']}/cancel-opening", json={"reason": "wrong entry"})
    assert r.status_code == 200, r.text
