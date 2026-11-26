"""Mock-up 25's Purchases screen (owner 2026-11-26): every bought line with what it cost, what was
paid and is still to pay the seller, and where the stock is now — checked against the bills, the
seller's khata and the stock. Purchase figures are cost: owner / manager only."""

from decimal import Decimal

from tests.conftest import login
from tests.test_returns_audit import A, B, C, _buy, _customer, _khata, _sell, _supplier


def _setup(owner, cat):
    sup = _supplier(owner)
    p = _buy(owner, cat, sup, [A, B, C], cost=65000, paid=100000)  # 195,000; 95,000 still to pay
    a, _b, _c = (ln["device_id"] for ln in p["lines"])
    cust = _customer(owner)
    s = _sell(owner, cust, [a], price=70000)
    it = owner.post(
        "/api/v1/accessories", json={"name": "Fast Charger", "category": "charger", "price": 800}
    ).json()
    r = owner.post(
        "/api/v1/purchases",
        json={
            "kind": "supplier",
            "party_id": sup["id"],
            "misc": [
                {
                    "description": "Fast Charger",
                    "qty": 6,
                    "unit_cost": 500,
                    "accessory_id": it["id"],
                }
            ],
            "paid": 3000,
        },
    )
    assert r.status_code == 201, r.text
    r2 = owner.post(
        "/api/v1/sales",
        json={
            "misc": [
                {
                    "description": "Fast Charger",
                    "accessory_id": it["id"],
                    "qty": 2,
                    "unit_price": 800,
                }
            ],
            "paid": 1600,
        },
    )
    assert r2.status_code == 201, r2.text
    return sup, cust, p, s, r.json(), it


def test_purchases_figures_lines_and_where_the_stock_is(owner, cat):
    sup, cust, p, s, _ip, it = _setup(owner, cat)
    d = owner.get("/api/v1/bills-hub/purchases").json()
    f = d["figures"]
    # 3 phones at 65,000 and 6 chargers at 500, on two bills
    assert f["units"] == 9 and f["bills"] == 2
    assert Decimal(f["amount"]) == 195000 + 3000
    assert Decimal(f["paid"]) == 100000 + 3000 and Decimal(f["due"]) == 95000
    assert Decimal(f["avg"]) == Decimal("22000.00")
    # two phones and four chargers still here, one phone and two chargers sold
    assert f["in_shop"] == 2 + 4 and f["sold"] == 1 + 2
    # the lines of each bill add up to the bill, and what is still to pay is the khata's
    for b in d["bills"]:
        mine = [ln for ln in d["lines"] if ln["purchase_id"] == b["id"]]
        assert sum(Decimal(ln["amount"]) for ln in mine) == Decimal(b["total"])
        assert sum(Decimal(ln["due"]) for ln in mine) == Decimal(b["due"])
    assert Decimal(f["due"]) == -_khata(owner, sup)
    # the sold phone says to whom and on which bill
    a = p["lines"][0]["device_id"]
    (ln,) = [x for x in d["lines"] if x["device_id"] == a]
    assert ln["state"] == "sold" and ln["sold_to"] == cust["name"] and ln["sold_no"] == s["no"]
    (chg,) = [x for x in d["lines"] if x["accessory_id"] == it["id"]]
    assert chg["state"] == "part" and chg["in_shop"] == 4 and Decimal(chg["unit_cost"]) == 500
    # a card per kind, the seller, a brand
    k = {x["key"]: x for x in d["kinds"]}
    assert k["phone"]["units"] == 3 and k["items"]["units"] == 6
    (pp,) = d["parties"]
    assert pp["party_id"] == sup["id"] and pp["role"] == "dealer" and pp["bills"] == 2


def test_purchases_filters(owner, cat):
    _sup, _cust, _p, _s, ip, _it = _setup(owner, cat)
    get = lambda qs: owner.get(f"/api/v1/bills-hub/purchases?{qs}").json()
    assert get("kind=items")["figures"]["units"] == 6
    assert get("kind=phone")["figures"]["units"] == 3
    # the phones' bill has 95,000 left to pay; the chargers' was paid in full
    assert get("deal=udhaar")["figures"]["units"] == 3
    assert get("deal=paid")["figures"]["units"] == 6
    assert get(f"q={ip['no']}")["figures"]["bills"] == 1
    br = get("")["brand_options"][0]["key"]
    assert get(f"brand={br}")["figures"]["units"] >= 1
    # the sheet: CSV with a line per bought line plus the total
    r = owner.get("/api/v1/bills-hub/purchases/sheet?format=csv")
    assert r.status_code == 200 and r.text.count("\n") >= 5
    assert owner.get("/api/v1/bills-hub/purchases/sheet?format=pdf").status_code == 200


def test_salesman_has_no_purchases_screen(owner, client, cat):
    _setup(owner, cat)
    r = owner.post(
        "/api/v1/staff",
        json={"name": "Ali", "phone": "03211234567", "password": "secret123", "role": "salesman"},
    )
    assert r.status_code == 201, r.text
    ali = login(client, "03211234567")
    assert ali.get("/api/v1/bills-hub/purchases").status_code == 403
    assert ali.get("/api/v1/bills-hub/purchases/sheet").status_code == 403
