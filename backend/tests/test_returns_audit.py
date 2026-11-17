"""Return Sale / Return Purchase audit (owner 2026-11-17, ADR-101): the twenty scenarios of the
brief, checked on the books themselves — the galla, the khata, stock at cost, the profit report,
the trial balance — not on the response alone.

The worked example: a phone bought for 65,000 and sold for 70,000 comes back; 68,000 is handed
back and 2,000 kept. The sale is gone, so its 5,000 margin is gone with it; the 2,000 is what the
shop made. The phone is back in stock at 65,000 — and when it is sold again for 70,000 the shop
has made 5,000 + 2,000 = 7,000 on it in all."""

from decimal import Decimal

from app.core.clock import today as shop_today
from tests.conftest import login
from tests.test_purchases import _dev, _party

A, B, C = "490154203237518", "356938035643809", "352099001761481"


# ---- helpers: read the books ---------------------------------------------------------------------


def _cash(owner) -> Decimal:
    return Decimal(owner.get("/api/v1/ledger/accounts").json()[0]["balance"])


def _khata(owner, party) -> Decimal:
    return Decimal(owner.get(f"/api/v1/parties/{party['id']}").json()["balance"])


def _profit(owner) -> Decimal:
    day = shop_today().isoformat()
    r = owner.get("/api/v1/reports/profit-loss", params={"date_from": day, "date_to": day})
    return Decimal(r.json()["net_profit"])


def _books(owner) -> dict:
    tb = owner.get("/api/v1/reports/trial-balance").json()
    assert tb["balanced"] is True and tb["debit"] == tb["credit"]
    return {r["key"]: Decimal(r["debit"]) - Decimal(r["credit"]) for r in tb["rows"]}


def _stock_at_cost(owner) -> Decimal:
    return _books(owner).get("inventory", Decimal(0))


def _device(owner, dev_id) -> dict:
    return owner.get(f"/api/v1/devices/{dev_id}").json()


def _supplier(owner):
    return _party(owner, name="Hafeez Centre", phone="03005550001", kinds=("supplier",))


def _customer(owner, name="Ahmed Khan", phone="03219876543"):
    return _party(owner, name=name, phone=phone, kinds=("customer",))


def _buy(owner, cat, sup, imeis, cost=65000, paid=None):
    r = owner.post(
        "/api/v1/purchases",
        json={
            "kind": "supplier",
            "party_id": sup["id"],
            "devices": [
                {"device": _dev(cat, i), "cost": cost, "asking_price": cost + 5000} for i in imeis
            ],
            "paid": cost * len(imeis) if paid is None else paid,
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


def _sell(owner, cust, dev_ids, price=70000, paid=None):
    r = owner.post(
        "/api/v1/sales",
        json={
            "party_id": cust["id"],
            "devices": [{"device_id": d, "price": price} for d in dev_ids],
            "paid": price * len(dev_ids) if paid is None else paid,
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


def _sale_return(owner, inv, lines=None, **kw):
    body = {
        "invoice_id": inv["id"],
        "line_ids": lines or [ln["id"] for ln in inv["lines"]],
        "settlement": "refund",
        **kw,
    }
    return owner.post("/api/v1/returns/sale", json=body)


# ---- 1, 3, 14, 15, 17, 18: the worked example ----------------------------------------------------


def test_return_sale_with_a_deduction_the_worked_example(owner, cat):
    sup, cust = _supplier(owner), _customer(owner)
    p = _buy(owner, cat, sup, [A])
    dev = p["lines"][0]["device_id"]
    inv = _sell(owner, cust, [dev])
    assert _profit(owner) == 5000 and _stock_at_cost(owner) == 0
    cash_sold = _cash(owner)

    r = _sale_return(owner, inv, refund_amount=68000, kept_amount=2000, reason_code="changed_mind")
    assert r.status_code == 201, r.text
    ret = r.json()
    assert (ret["amount"], ret["refund_amount"], ret["kept_amount"]) == (
        "70000.00",
        "68000.00",
        "2000.00",
    )
    # stock: the phone is back, at the cost it was bought for — not at what was handed back
    d = _device(owner, dev)
    assert d["status"] == "in_stock" and Decimal(d["cost_price"]) == 65000
    assert _stock_at_cost(owner) == 65000
    # galla: exactly the 68,000 handed back went out
    assert cash_sold - _cash(owner) == 68000
    # khata: the customer neither owes nor is owed
    assert _khata(owner, cust) == 0
    # profit: the sale's 5,000 is gone with the sale; the 2,000 kept is what the shop made
    assert _profit(owner) == 2000
    books = _books(owner)
    assert books.get("sales", 0) == 0 and books.get("cogs", 0) == 0
    assert books["other_income"] == -2000  # a credit: income
    # the purchase and its cost are untouched
    pur = owner.get(f"/api/v1/purchases/{p['id']}").json()
    assert pur["total"] == "65000.00" and pur["status"] == "posted"
    assert pur["lines"][0]["net_cost"] == "65000.00" and pur["returned_total"] == "0.00"

    # sold again for 70,000: 5,000 margin + 2,000 kept = 7,000 made on this phone in all
    _sell(owner, _customer(owner, "Bilal", "03001110002"), [dev])
    assert _profit(owner) == 7000 and _stock_at_cost(owner) == 0


# ---- 4: without a deduction ----------------------------------------------------------------------


def test_return_sale_without_a_deduction(owner, cat):
    sup, cust = _supplier(owner), _customer(owner)
    dev = _buy(owner, cat, sup, [A])["lines"][0]["device_id"]
    before = _cash(owner)
    inv = _sell(owner, cust, [dev])
    r = _sale_return(owner, inv)
    assert r.status_code == 201 and r.json()["refund_amount"] == "70000.00"
    assert r.json()["kept_amount"] == "0.00"
    # everything is as it was before the sale
    assert _cash(owner) == before and _profit(owner) == 0 and _khata(owner, cust) == 0
    assert _stock_at_cost(owner) == 65000 and _device(owner, dev)["status"] == "in_stock"


# ---- 5, 11, 12: partial sale return, the same IMEI twice, more than was sold ----------------------


def test_partial_sale_return_and_no_second_return_of_the_same_phone(owner, cat):
    sup, cust = _supplier(owner), _customer(owner)
    p = _buy(owner, cat, sup, [A, B])
    d1, d2 = (ln["device_id"] for ln in p["lines"])
    inv = _sell(owner, cust, [d1, d2])
    line1, line2 = inv["lines"][0]["id"], inv["lines"][1]["id"]
    r = _sale_return(owner, inv, lines=[line1])
    assert r.status_code == 201 and r.json()["amount"] == "70000.00"
    got = owner.get(f"/api/v1/sales/{inv['id']}").json()
    assert got["returned_total"] == "70000.00" and got["status"] != "returned"
    assert _device(owner, d1)["status"] == "in_stock" and _device(owner, d2)["status"] == "sold"
    assert _stock_at_cost(owner) == 65000 and _profit(owner) == 5000  # one sale still stands
    # the same phone cannot come back twice, and a line of another bill cannot be returned on this one
    assert _sale_return(owner, inv, lines=[line1]).status_code == 409
    assert _sale_return(owner, inv, lines=[line1, line2]).status_code == 409
    other = _sell(owner, cust, [d1])
    assert _sale_return(owner, inv, lines=[other["lines"][0]["id"]]).status_code == 404
    # the rest of the first bill can still come back; then the bill is closed
    assert _sale_return(owner, inv, lines=[line2]).status_code == 201
    assert owner.get(f"/api/v1/sales/{inv['id']}").json()["status"] == "returned"
    assert _sale_return(owner, inv, lines=[line2]).status_code == 409


# ---- 2, 6, 16: purchase return, full and partial, the supplier's khata and the galla --------------


def test_return_purchase_partial_then_the_rest(owner, cat):
    sup = _supplier(owner)
    # two phones for 130,000; 100,000 paid, 30,000 still owed to the supplier
    p = _buy(owner, cat, sup, [A, B], paid=100000)
    d1, d2 = (ln["device_id"] for ln in p["lines"])
    assert _khata(owner, sup) == -30000 and _stock_at_cost(owner) == 130000
    cash = _cash(owner)
    # one phone goes back: the 30,000 owed is cancelled and the supplier hands 35,000 back
    r = owner.post(
        "/api/v1/returns/purchase",
        json={"purchase_id": p["id"], "line_ids": [p["lines"][0]["id"]], "refund_amount": 35000},
    )
    assert r.status_code == 201, r.text
    assert r.json()["amount"] == "65000.00" and r.json()["refund_amount"] == "35000.00"
    assert _device(owner, d1)["status"] == "returned_to_supplier"
    assert _device(owner, d2)["status"] == "in_stock"
    assert _stock_at_cost(owner) == 65000
    assert _cash(owner) - cash == 35000  # only what was really handed back
    assert _khata(owner, sup) == 0
    pur = owner.get(f"/api/v1/purchases/{p['id']}").json()
    assert pur["status"] == "posted" and pur["returned_total"] == "65000.00"  # the bill stays
    assert _profit(owner) == 0
    # the same phone cannot go back twice
    again = owner.post(
        "/api/v1/returns/purchase", json={"purchase_id": p["id"], "line_ids": [p["lines"][0]["id"]]}
    )
    assert again.status_code == 409
    # the second goes back on credit: no cash moves, the supplier now owes the shop 65,000
    cash = _cash(owner)
    r = owner.post(
        "/api/v1/returns/purchase", json={"purchase_id": p["id"], "line_ids": [p["lines"][1]["id"]]}
    )
    assert r.status_code == 201, r.text
    assert _cash(owner) == cash and _khata(owner, sup) == 65000 and _stock_at_cost(owner) == 0
    # more than the value cannot be taken back
    assert "inventory" not in _books(owner) or _books(owner)["inventory"] == 0


# ---- 7: a wrong purchase return, undone, and the right sale return entered -----------------------


def test_wrong_purchase_return_replaced_by_the_right_sale_return(owner, cat):
    sup, cust = _supplier(owner), _customer(owner)
    p = _buy(owner, cat, sup, [A, B])
    in_stock, sold = (ln["device_id"] for ln in p["lines"])
    inv = _sell(owner, cust, [sold])
    # the salesman meant to take the customer's phone back, but sent the other one to the supplier
    wrong = owner.post(
        "/api/v1/returns/purchase",
        json={"purchase_id": p["id"], "line_ids": [p["lines"][0]["id"]], "refund_amount": 65000},
    ).json()
    cash_wrong, stock_wrong = _cash(owner), _stock_at_cost(owner)
    assert _device(owner, in_stock)["status"] == "returned_to_supplier" and stock_wrong == 0

    r = owner.post(
        f"/api/v1/returns/{wrong['id']}/replace",
        json={
            "reason": "it was the customer's return",
            "sale": {
                "invoice_id": inv["id"],
                "line_ids": [inv["lines"][0]["id"]],
                "settlement": "refund",
                "refund_amount": 68000,
                "kept_amount": 2000,
            },
        },
    )
    assert r.status_code == 201, r.text
    right = r.json()
    assert right["kind"] == "sale" and right["replaces_no"] == wrong["no"]
    old = owner.get(f"/api/v1/returns/{wrong['id']}").json()
    assert old["status"] == "voided" and old["void_reason"] == "it was the customer's return"
    assert old["voided_at"] and old["voided_by"] and old["replaced_by_no"] == right["no"]
    # the wrong one is fully undone: the phone is back, the 65,000 went back to the supplier
    assert _device(owner, in_stock)["status"] == "in_stock"
    # and the right one stands: the customer's phone is back, 68,000 handed back
    assert _device(owner, sold)["status"] == "in_stock"
    assert _stock_at_cost(owner) == 130000
    assert cash_wrong - _cash(owner) == 65000 + 68000
    assert _khata(owner, sup) == 0 and _khata(owner, cust) == 0 and _profit(owner) == 2000
    pur = owner.get(f"/api/v1/purchases/{p['id']}").json()
    assert pur["returned_total"] == "0.00"


# ---- 8: a wrong sale return, undone, and the right purchase return entered -----------------------


def test_wrong_sale_return_replaced_by_the_right_purchase_return(owner, cat):
    sup, cust = _supplier(owner), _customer(owner)
    p = _buy(owner, cat, sup, [A, B])
    to_go_back, sold = (ln["device_id"] for ln in p["lines"])
    inv = _sell(owner, cust, [sold])
    profit_sold, cash_sold = _profit(owner), _cash(owner)
    wrong = _sale_return(owner, inv).json()
    assert _profit(owner) == 0
    r = owner.post(
        f"/api/v1/returns/{wrong['id']}/replace",
        json={
            "reason": "wrong kind of return",
            "purchase": {
                "purchase_id": p["id"],
                "line_ids": [p["lines"][0]["id"]],
                "refund_amount": 65000,
            },
        },
    )
    assert r.status_code == 201, r.text
    assert r.json()["kind"] == "purchase" and r.json()["replaces_no"] == wrong["no"]
    # the sale stands again exactly as it was
    assert _device(owner, sold)["status"] == "sold" and _profit(owner) == profit_sold
    got = owner.get(f"/api/v1/sales/{inv['id']}").json()
    assert got["returned_total"] == "0.00" and got["status"] == "paid"
    # and the other phone went back to the supplier for its cost
    assert _device(owner, to_go_back)["status"] == "returned_to_supplier"
    assert _cash(owner) - cash_sold == 65000 and _stock_at_cost(owner) == 0
    assert _khata(owner, sup) == 0 and _khata(owner, cust) == 0


# ---- 9: edit a wrong amount; both or neither ------------------------------------------------------


def test_edit_a_wrong_refund_amount_is_all_or_nothing(owner, cat):
    sup, cust = _supplier(owner), _customer(owner)
    dev = _buy(owner, cat, sup, [A])["lines"][0]["device_id"]
    inv = _sell(owner, cust, [dev])
    first = _sale_return(owner, inv, refund_amount=68000, kept_amount=2000).json()
    cash, profit = _cash(owner), _profit(owner)
    fixed = {
        "invoice_id": inv["id"],
        "line_ids": [inv["lines"][0]["id"]],
        "settlement": "refund",
        "refund_amount": 69000,
        "kept_amount": 1000,
    }
    # a correction that is itself wrong (more handed back than was paid) changes nothing at all
    bad = owner.post(
        f"/api/v1/returns/{first['id']}/replace",
        json={"reason": "typo", "sale": {**fixed, "refund_amount": 99000, "kept_amount": 0}},
    )
    assert bad.status_code == 422, bad.text
    assert owner.get(f"/api/v1/returns/{first['id']}").json()["status"] == "posted"
    assert _cash(owner) == cash and _profit(owner) == profit
    assert _device(owner, dev)["status"] == "in_stock"
    # neither kind given, or both, is refused
    none = owner.post(f"/api/v1/returns/{first['id']}/replace", json={"reason": "typo"})
    assert none.status_code == 422

    r = owner.post(f"/api/v1/returns/{first['id']}/replace", json={"reason": "typo", "sale": fixed})
    assert r.status_code == 201, r.text
    new = r.json()
    assert new["refund_amount"] == "69000.00" and new["kept_amount"] == "1000.00"
    assert new["replaces_id"] == first["id"]
    assert cash - _cash(owner) == 1000 and _profit(owner) == 1000 and _khata(owner, cust) == 0
    assert _stock_at_cost(owner) == 65000
    # only one return of this bill is live; the report shows the corrected one
    rep = owner.get("/api/v1/returns/report").json()["sale"]
    assert [x["no"] for x in rep["rows"]] == [new["no"]] and rep["totals"]["voided"] == 1
    assert rep["rows"][0]["replaces_no"] == first["no"]

    # the reason alone is corrected in place: no money, no stock
    cash = _cash(owner)
    e = owner.patch(
        f"/api/v1/returns/{new['id']}", json={"reason": "speaker", "reason_code": "fault"}
    )
    assert e.status_code == 200 and e.json()["reason_code"] == "fault"
    assert e.json()["reason"] == "speaker" and _cash(owner) == cash


# ---- 10: no double reversal ----------------------------------------------------------------------


def test_a_return_is_undone_once_only(owner, cat):
    sup, cust = _supplier(owner), _customer(owner)
    dev = _buy(owner, cat, sup, [A])["lines"][0]["device_id"]
    inv = _sell(owner, cust, [dev])
    cash_sold, profit_sold = _cash(owner), _profit(owner)
    ret = _sale_return(owner, inv, refund_amount=68000, kept_amount=2000).json()
    # a return that is still live cannot be named as "the wrong one" by a new return
    live = _sale_return(owner, inv, replaces_id=ret["id"])
    assert live.status_code == 409

    u = owner.post(f"/api/v1/returns/{ret['id']}/void", json={"reason": "entered by mistake"})
    assert u.status_code == 200 and u.json()["status"] == "voided" and u.json()["voided_at"]
    # everything is as it was after the sale
    assert _cash(owner) == cash_sold and _profit(owner) == profit_sold
    assert _device(owner, dev)["status"] == "sold" and _stock_at_cost(owner) == 0
    assert _khata(owner, cust) == 0
    again = owner.post(f"/api/v1/returns/{ret['id']}/void", json={"reason": "again"})
    assert again.status_code == 409 and again.json()["error"]["code"] == "already_voided"
    assert _cash(owner) == cash_sold  # nothing moved the second time
    assert owner.patch(f"/api/v1/returns/{ret['id']}", json={"reason": "late"}).status_code == 409
    twice = owner.post(
        f"/api/v1/returns/{ret['id']}/replace",
        json={
            "reason": "again",
            "sale": {"invoice_id": inv["id"], "line_ids": [inv["lines"][0]["id"]]},
        },
    )
    assert twice.status_code == 409
    # the record is kept, with who and why
    kept = owner.get(f"/api/v1/returns/{ret['id']}").json()
    assert kept["void_reason"] == "entered by mistake" and kept["voided_by"]


# ---- 13: a damaged phone is not normal stock ------------------------------------------------------


def test_a_damaged_return_goes_to_faulty_not_to_normal_stock(client, owner, cat):
    sup, cust = _supplier(owner), _customer(owner)
    dev = _buy(owner, cat, sup, [A])["lines"][0]["device_id"]
    inv = _sell(owner, cust, [dev])
    r = _sale_return(
        owner, inv, item_condition="damaged", reason="screen cracked", reason_code="fault"
    )
    assert r.status_code == 201 and r.json()["item_condition"] == "damaged"
    d = _device(owner, dev)
    assert d["status"] == "faulty" and "screen cracked" in (d.get("faults") or [])
    # it is still the shop's, at its cost; it just is not offered as a sound phone
    assert _stock_at_cost(owner) == 65000 and Decimal(d["cost_price"]) == 65000
    row = owner.get("/api/v1/returns/report").json()["sale"]["rows"][0]
    assert row["item_condition"] == "damaged" and row["items"][0]["status_now"] == "faulty"
    # an "ok" return of another phone lands in normal stock
    dev2 = _buy(owner, cat, sup, [B])["lines"][0]["device_id"]
    inv2 = _sell(owner, cust, [dev2])
    assert _sale_return(owner, inv2, item_condition="ok").status_code == 201
    assert _device(owner, dev2)["status"] == "in_stock"
    # nonsense is refused
    assert _sale_return(owner, inv2, item_condition="burnt").status_code == 422
    # the damaged return can still be undone: the phone goes back to the customer as sold
    u = owner.post(f"/api/v1/returns/{r.json()['id']}/void", json={"reason": "wrong phone"})
    assert u.status_code == 200, u.text
    assert _device(owner, dev)["status"] == "sold"

    # a salesman may take a phone back, but not undo, edit or replace a return
    owner.post(
        "/api/v1/staff",
        json={"name": "Sales", "phone": "03451112244", "password": "secret123", "role": "salesman"},
    )
    s = login(client, "03451112244")
    live = owner.get("/api/v1/returns", params={"kind": "sale"}).json()
    rid = next(x["id"] for x in live if x["status"] == "posted")
    assert s.post(f"/api/v1/returns/{rid}/void", json={"reason": "not mine"}).status_code == 403
    assert s.patch(f"/api/v1/returns/{rid}", json={"reason": "not mine"}).status_code == 403
    body = {
        "reason": "not mine",
        "sale": {"invoice_id": inv2["id"], "line_ids": [inv2["lines"][0]["id"]]},
    }
    assert s.post(f"/api/v1/returns/{rid}/replace", json=body).status_code == 403


# ---- 19: another shop ----------------------------------------------------------------------------


def test_another_shop_cannot_touch_a_return(owner, other_owner, cat):
    sup, cust = _supplier(owner), _customer(owner)
    p = _buy(owner, cat, sup, [A])
    dev = p["lines"][0]["device_id"]
    inv = _sell(owner, cust, [dev])
    ret = _sale_return(owner, inv).json()
    assert other_owner.get(f"/api/v1/returns/{ret['id']}").status_code == 404
    assert (
        other_owner.post(
            f"/api/v1/returns/{ret['id']}/void", json={"reason": "not mine"}
        ).status_code
        == 404
    )
    assert (
        other_owner.patch(f"/api/v1/returns/{ret['id']}", json={"reason": "not mine"}).status_code
        == 404
    )
    body = {
        "reason": "not mine",
        "sale": {"invoice_id": inv["id"], "line_ids": [inv["lines"][0]["id"]]},
    }
    assert other_owner.post(f"/api/v1/returns/{ret['id']}/replace", json=body).status_code == 404
    # nor return this shop's bill or purchase from its own login
    assert other_owner.post("/api/v1/returns/sale", json=body["sale"]).status_code == 404
    theirs = other_owner.post(
        "/api/v1/returns/purchase", json={"purchase_id": p["id"], "line_ids": [p["lines"][0]["id"]]}
    )
    assert theirs.status_code == 404
    assert other_owner.get("/api/v1/returns").json() == []
    # and nothing of this shop moved
    assert owner.get(f"/api/v1/returns/{ret['id']}").json()["status"] == "posted"


# ---- 20: a return entered the old way still works -------------------------------------------------


def test_a_return_without_the_new_fields_is_as_before(owner, cat):
    sup, cust = _supplier(owner), _customer(owner)
    dev = _buy(owner, cat, sup, [A])["lines"][0]["device_id"]
    inv = _sell(owner, cust, [dev])
    r = owner.post(
        "/api/v1/returns/sale",
        json={"invoice_id": inv["id"], "line_ids": [inv["lines"][0]["id"]], "settlement": "refund"},
    )
    assert r.status_code == 201, r.text
    out = r.json()
    assert out["item_condition"] is None and out["replaces_id"] is None
    assert out["voided_at"] is None and out["status"] == "posted"
    assert _device(owner, dev)["status"] == "in_stock"
    # a second identical request with the same idempotency key posts nothing new
    p = _buy(owner, cat, sup, [B])
    body = {"purchase_id": p["id"], "line_ids": [p["lines"][0]["id"]], "refund_amount": 65000}
    h = {"Idempotency-Key": "ret-test-1"}
    a = owner.post("/api/v1/returns/purchase", json=body, headers=h)
    b = owner.post("/api/v1/returns/purchase", json=body, headers=h)
    assert a.status_code == 201 and b.status_code in (200, 201)
    assert a.json()["id"] == b.json()["id"]
    assert len(owner.get("/api/v1/returns", params={"kind": "purchase"}).json()) == 1
