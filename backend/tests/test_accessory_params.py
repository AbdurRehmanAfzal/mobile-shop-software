"""Owner addendum 5 (docs/24 §E): units, cost batches, weighted average / FIFO, negative-stock
setting, price tiers and the minimum price, immutable history, idempotent backfill, supplier SKUs."""

from tests.conftest import login
from tests.test_purchases import _party


def _item(owner, name="Type-C cable 1m", **extra):
    r = owner.post(
        "/api/v1/accessories",
        json={"name": name, "category": "cable", "price": 300, "reorder_level": 10, **extra},
    )
    assert r.status_code == 201, r.text
    return r.json()


def _buy(owner, sup, item, qty, unit_cost, unit="piece", paid=0, **extra):
    r = owner.post(
        "/api/v1/purchases",
        json={
            "kind": "supplier",
            "party_id": sup["id"],
            "misc": [
                {
                    "description": item["name"],
                    "accessory_id": item["id"],
                    "qty": qty,
                    "unit": unit,
                    "unit_cost": unit_cost,
                }
            ],
            "paid": paid,
            **extra,
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


def _sell(actor, item, qty, price, party=None, **extra):
    return actor.post(
        "/api/v1/sales",
        json={
            "party_id": party["id"] if party else None,
            "misc": [
                {"description": item["name"], "accessory_id": item["id"], "qty": qty, "unit_price": price}
            ],
            "paid": price * qty,
            **extra,
        },
    )


def test_five_dozen_become_sixty_pieces_with_cost_per_piece_and_supplier_balance(owner):
    sup = _party(owner)
    a = _item(owner)
    p = _buy(owner, sup, a, 5, 1200, unit="dozen", paid=2000, supplier_invoice_no="RT-77")
    got = owner.get(f"/api/v1/accessories/{a['id']}").json()
    assert got["qty"] == 60 and got["avg_cost"] == "100.00" and got["unit"] == "piece"
    line = p["lines"][0]
    assert line["qty"] == 60 and line["unit_cost"] == "100.00"
    assert line["pack_unit"] == "dozen" and line["pack_qty"] == 5
    assert p["total"] == "6000.00" and p["supplier_invoice_no"] == "RT-77"
    assert owner.get(f"/api/v1/parties/{sup['id']}").json()["balance"] == "-4000.00"
    # freight is spread over the lines and lands in the cost per piece
    p2 = _buy(owner, sup, a, 1, 1200, unit="dozen", extra_costs=120, extra_costs_note="van")
    assert p2["total"] == "1320.00" and p2["lines"][0]["unit_cost"] == "110.00"
    assert p2["lines"][0]["extra_cost_share"] == "120.00"


def test_two_purchases_give_weighted_average_and_two_visible_batches(owner):
    sup = _party(owner)
    a = _item(owner)
    _buy(owner, sup, a, 10, 100)
    _buy(owner, sup, a, 10, 200)
    got = owner.get(f"/api/v1/accessories/{a['id']}").json()
    assert got["qty"] == 20 and got["avg_cost"] == "150.00"
    b = owner.get(f"/api/v1/accessories/{a['id']}/batches").json()
    assert [(x["qty_in"], x["qty_left"], x["unit_cost"], x["party_name"]) for x in b] == [
        (10, 10, "200.00", "Rehman Traders"),
        (10, 10, "100.00", "Rehman Traders"),
    ]
    tl = owner.get(f"/api/v1/accessories/{a['id']}/timeline").json()
    kinds = [(r["kind"], r.get("reason") or r.get("field")) for r in tl]
    assert ("move", "purchase") in kinds and ("price", "avg_cost") in kinds
    buy = next(r for r in tl if r["kind"] == "move")
    assert buy["party_name"] == "Rehman Traders" and buy["amount"] == "2000.00" and buy["paid"] == "0.00"


def test_sale_in_pieces_reduces_dozen_stock_and_blocks_overselling_unless_allowed(owner):
    sup = _party(owner)
    a = _item(owner)
    _buy(owner, sup, a, 1, 1200, unit="dozen")
    assert _sell(owner, a, 5, 300).status_code == 201
    assert owner.get(f"/api/v1/accessories/{a['id']}").json()["qty"] == 7
    r = _sell(owner, a, 8, 300)
    assert r.status_code == 422 and r.json()["error"]["code"] == "insufficient_stock"
    assert owner.patch("/api/v1/shops/current", json={"item_prefs": {"allow_negative_stock": True}}).status_code == 200
    assert _sell(owner, a, 8, 300).status_code == 201
    assert owner.get(f"/api/v1/accessories/{a['id']}").json()["qty"] == -1
    # the batch is used up; the extra piece was costed at the average
    b = owner.get(f"/api/v1/accessories/{a['id']}/batches").json()
    assert b[0]["qty_left"] == 0


def test_wholesale_customers_get_the_dealer_price_and_minimum_price_needs_approval(client, owner):
    sup = _party(owner)
    dealer = _party(owner, name="Bilal Mobiles", phone="03001111111", kinds=("shop",))
    owner.patch(f"/api/v1/parties/{dealer['id']}", json={"wholesale": True})
    walkin = _party(owner, name="Ahmed", phone="03219876543", kinds=("customer",))
    a = _item(owner, wholesale_price=220, min_price=200)
    _buy(owner, sup, a, 20, 100)
    pr = owner.get(f"/api/v1/accessories/{a['id']}/price", params={"party_id": dealer["id"]}).json()
    assert pr["price"] == "220.00" and pr["tier"] == "wholesale"
    pr = owner.get(f"/api/v1/accessories/{a['id']}/price", params={"party_id": walkin["id"]}).json()
    assert pr["price"] == "300.00" and pr["tier"] == "retail" and pr["min_price"] == "200.00"
    owner.post(
        "/api/v1/staff",
        json={"name": "Sales", "phone": "03451112233", "password": "secret123", "role": "salesman"},
    )
    s = login(client, "03451112233")
    assert _sell(s, a, 1, 220, dealer).status_code == 201
    r = _sell(s, a, 1, 150, walkin)  # under the minimum: the salesman needs the manager
    assert r.status_code == 403, r.text
    assert _sell(owner, a, 1, 150, walkin, below_cost_ok=False).status_code == 201  # 150 ≥ cost 100
    r = _sell(owner, a, 1, 90, walkin)  # under cost: even the owner must confirm the loss
    assert r.status_code == 409 and r.json()["error"]["code"] == "below_cost"
    assert _sell(owner, a, 1, 90, walkin, below_cost_ok=True).status_code == 201


def test_returns_and_adjustments_add_rows_and_never_delete(owner):
    sup = _party(owner)
    c = _party(owner, name="Ahmed", phone="03219876543", kinds=("customer",))
    a = _item(owner, warranty_days=30)
    _buy(owner, sup, a, 10, 100)
    inv = _sell(owner, a, 2, 300, c).json()
    assert inv["lines"][0]["warranty_days"] == 30
    r = owner.post("/api/v1/returns/sale", json={"invoice_id": inv["id"], "line_ids": [inv["lines"][0]["id"]]})
    assert r.status_code == 201, r.text
    assert owner.post(f"/api/v1/accessories/{a['id']}/adjust", json={"qty_delta": -1, "note": "damaged"}).status_code == 200
    assert owner.post(f"/api/v1/accessories/{a['id']}/adjust", json={"qty_delta": -1}).status_code == 422  # reason is required
    mv = owner.get(f"/api/v1/accessories/{a['id']}/movements").json()
    assert [(m["reason"], m["qty_delta"]) for m in mv] == [("adjust", -1), ("return", 2), ("sale", -2), ("purchase", 10)]
    assert owner.get(f"/api/v1/accessories/{a['id']}").json()["qty"] == 9


def test_backfill_is_idempotent(owner):
    a = _item(owner, opening_qty=5, opening_cost=50)  # already has an opening batch
    b = _item(owner, name="Glass 9H")
    owner.post(f"/api/v1/accessories/{b['id']}/adjust", json={"qty_delta": 3, "unit_cost": 40, "note": "count"})
    first = owner.post("/api/v1/accessories/backfill-batches").json()["items"]
    second = owner.post("/api/v1/accessories/backfill-batches").json()["items"]
    assert second == 0 and first == 0  # every stock movement already opens a batch
    ba = owner.get(f"/api/v1/accessories/{a['id']}/batches").json()
    assert len(ba) == 1 and ba[0]["batch_ref"] == "Opening stock" and ba[0]["qty_left"] == 5
    bb = owner.get(f"/api/v1/accessories/{b['id']}/batches").json()
    assert len(bb) == 1 and bb[0]["unit_cost"] == "40.00"


def test_supplier_sku_lookup_and_duplicate_warning(owner):
    sup = _party(owner)
    a = _item(owner, brand="Baseus", color="black", supplier_skus=[{"party_id": sup["id"], "sku": "BS-TC-1M"}])
    r = owner.get("/api/v1/accessories/lookup", params={"code": "bs-tc-1m"}).json()
    assert r["found"] and r["matched"] == "supplier_sku" and r["item"]["id"] == a["id"]
    r = owner.get("/api/v1/accessories/lookup", params={"code": a["sku"]}).json()
    assert r["matched"] == "sku"
    assert owner.get("/api/v1/accessories/lookup", params={"code": "nope"}).json()["found"] is False
    sim = owner.get("/api/v1/accessories/similar", params={"name": "Baseus type-c cable", "brand": "Baseus"}).json()
    assert [x["id"] for x in sim] == [a["id"]]
    found = owner.get("/api/v1/accessories", params={"q": "BS-TC"}).json()
    assert [x["id"] for x in found] == [a["id"]]
    found = owner.get("/api/v1/accessories", params={"supplier_id": sup["id"]}).json()
    assert [x["id"] for x in found] == [a["id"]]


def test_fifo_valuation_costs_the_oldest_batch_first(owner):
    sup = _party(owner)
    a = _item(owner)
    owner.patch("/api/v1/shops/current", json={"item_prefs": {"valuation": "fifo"}})
    _buy(owner, sup, a, 2, 100)
    _buy(owner, sup, a, 2, 200)
    inv = _sell(owner, a, 3, 300).json()
    assert inv["lines"][0]["cost"] == "400.00"  # 100 + 100 + 200
    b = owner.get(f"/api/v1/accessories/{a['id']}/batches").json()
    assert [x["qty_left"] for x in b] == [1, 0]


def test_markup_pricing_and_reports(owner):
    sup = _party(owner)
    a = _item(owner, pricing_mode="markup", markup_pct=50)
    _buy(owner, sup, a, 10, 100)
    got = owner.get(f"/api/v1/accessories/{a['id']}").json()
    assert got["price"] == "150.00" and got["profit"] == "50.00" and got["margin_pct"] == "50.00"
    r = owner.post("/api/v1/accessories/bulk-price", json={"pct": 10, "category": "cable"}).json()
    assert r["updated"] == 1 and owner.get(f"/api/v1/accessories/{a['id']}").json()["price"] == "165.00"
    _sell(owner, a, 4, 165)
    v = owner.get("/api/v1/accessories/reports/valuation").json()
    assert v["units"] == 6 and v["cost"] == "600.00" and v["retail"] == "990.00"
    m = owner.get("/api/v1/accessories/reports/movers").json()
    assert m["fast"][0]["sold"] == 4
    pr = owner.get("/api/v1/accessories/reports/profit", params={"group": "category"}).json()
    assert pr[0]["key"] == "cable" and pr[0]["profit"] == "260.00"
    ss = owner.get("/api/v1/accessories/reports/suppliers").json()
    assert ss[0]["party_name"] == "Rehman Traders" and ss[0]["units"] == 10
    low = owner.get("/api/v1/accessories/reports/low-stock").json()
    assert low["count"] == 1 and low["groups"][0]["party_name"] == "Rehman Traders"
    assert owner.get("/api/v1/accessories/reports/dead-stock", params={"days": 30}).json() == []
    assert owner.get("/api/v1/accessories/options").json()["units"]["dozen"] == 12
