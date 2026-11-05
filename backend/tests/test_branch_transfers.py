"""Phones and items moved between two branches of one owner (docs/35 §5 item 2, ADR-046)."""

from tests.conftest import login
from tests.test_devices import _stock

A, B = "490154203237518", "356938035643809"


def _branch(owner) -> str:
    r = owner.post("/api/v1/shops", json={"name": "Branch 2", "city": "Lahore"})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _status(owner, device_id, shop_id=None):
    return owner.get(f"/api/v1/devices/{device_id}", shop_id=shop_id).json()["status"]


def test_phone_and_item_move_to_a_branch(client, owner, cat):
    d = _stock(owner, cat, imei=A, condition="box_pack", cost_price=1000, asking_price=1500)
    item = owner.post("/api/v1/accessories", json={"name": "Type-C cable", "price": 300, "opening_qty": 10, "opening_cost": 120}).json()
    home = owner.shop_id
    two = _branch(owner)
    assert [b["id"] for b in owner.get("/api/v1/transfers/branches").json()] == [two]

    r = owner.post("/api/v1/transfers", json={"to_shop_id": two, "devices": [d["id"]], "items": [{"id": item["id"], "qty": 4}], "note": "for the weekend"})
    assert r.status_code == 201, r.text
    t = r.json()
    assert t["no"] == "TRF-000001" and t["direction"] == "out" and t["other_shop"] == "Branch 2"
    assert t["total_cost"] == "1480.00"  # 1000 + 4 × 120

    # the sending shop: the phone is gone from stock, its history stays here
    assert _status(owner, d["id"]) == "transferred"
    hist = owner.get(f"/api/v1/devices/{d['id']}/history").json()
    events = hist if isinstance(hist, list) else hist["events"]
    assert events[-1]["type"] == "transferred_out"
    assert owner.get(f"/api/v1/accessories/{item['id']}").json()["qty"] == 6

    # the branch: the same unit, same cost / asking / barcode, in stock; the item with 4 pieces at 120
    dev_line = next(ln for ln in owner.get(f"/api/v1/transfers/{t['id']}", shop_id=two).json()["lines"] if ln["kind"] == "device")
    there = owner.get(f"/api/v1/devices/{dev_line['device_id']}", shop_id=two).json()
    assert there["status"] == "in_stock" and there["imei1"] == A
    assert there["cost_price"] == "1000.00" and there["asking_price"] == "1500.00"
    assert there["barcode"] == d["barcode"]
    items_two = owner.get("/api/v1/accessories", shop_id=two).json()
    cable = next(i for i in items_two if i["name"] == "Type-C cable")
    assert cable["qty"] == 4 and cable["sku"] == item["sku"]
    seen_in = owner.get("/api/v1/transfers", shop_id=two).json()
    assert seen_in[0]["direction"] == "in" and seen_in[0]["other_shop"]

    # money: stock at cost moved, nothing sold; both shops still balanced, profit unchanged
    for sid in (home, two):
        bs = owner.get("/api/v1/reports/balance-sheet", shop_id=sid).json()
        assert bs["balanced"] is True
        assert next(x["amount"] for x in bs["owner"] if x["key"] == "profit") == "0.00"
    bs_home = owner.get("/api/v1/reports/balance-sheet").json()
    assert next(x["amount"] for x in bs_home["owner"] if x["key"] == "branch_transfer") == "-1480.00"
    bs_two = owner.get("/api/v1/reports/balance-sheet", shop_id=two).json()
    assert next(x["amount"] for x in bs_two["assets"] if x["key"] == "inventory") == "1480.00"

    # it can be sold in the branch, and sent back home later (the old row there comes back)
    r = owner.post("/api/v1/transfers", shop_id=two, json={"to_shop_id": home, "devices": [dev_line["device_id"]]})
    assert r.status_code == 201, r.text
    assert _status(owner, d["id"]) == "in_stock"
    assert _status(owner, dev_line["device_id"], shop_id=two) == "transferred"


def test_transfer_rules(client, owner, other_owner, cat):
    d = _stock(owner, cat, imei=B, condition="box_pack", cost_price=800, asking_price=1200)
    two = _branch(owner)
    # not another owner's shop
    r = owner.post("/api/v1/transfers", json={"to_shop_id": other_owner.shop_id, "devices": [d["id"]]})
    assert r.status_code == 404
    # not the same shop, not an empty list
    assert owner.post("/api/v1/transfers", json={"to_shop_id": owner.shop_id, "devices": [d["id"]]}).status_code == 404
    assert owner.post("/api/v1/transfers", json={"to_shop_id": two, "devices": []}).status_code == 422
    # a phone not in stock cannot go
    owner.post("/api/v1/sales", json={"devices": [{"device_id": d["id"], "price": 1200}], "paid": 1200})
    r = owner.post("/api/v1/transfers", json={"to_shop_id": two, "devices": [d["id"]]})
    assert r.status_code == 409 and r.json()["error"]["code"] == "device_not_in_stock"
    # a salesman cannot move stock
    owner.post("/api/v1/staff", json={"name": "Sales", "phone": "03451112255", "password": "secret123", "role": "salesman"})
    s = login(client, "03451112255")
    assert s.get("/api/v1/transfers/branches").status_code == 403
    # the generic events endpoint cannot fake a transfer
    d2 = _stock(owner, cat, imei=A, condition="box_pack", cost_price=500, asking_price=700)
    r = owner.post(f"/api/v1/devices/{d2['id']}/events", json={"type": "transferred_out"})
    assert r.status_code in (400, 409, 422)
