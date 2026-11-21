"""Accessories Easy Mode, phase B (ADR-124): a discount on one line of a purchase comes off that
line first, the bill's discount is spread over what is left, and the total, the dealer's khata, the
item's cost and the books follow — a purchase without a line discount is worked out as before.
And the built-in list's kinds, for the cards beside the purchase's search."""

from tests.test_old_dealings import _tb
from tests.test_purchases import _party


def _item(owner, name):
    r = owner.post("/api/v1/accessories", json={"name": name, "category": "cable", "price": 300})
    assert r.status_code == 201, r.text
    return r.json()


def test_line_discount_then_bill_discount(owner):
    sup = _party(owner)
    a, b = _item(owner, "Cable A"), _item(owner, "Cable B")
    r = owner.post(
        "/api/v1/purchases",
        json={
            "kind": "supplier",
            "party_id": sup["id"],
            "misc": [
                {
                    "description": "Cable A",
                    "accessory_id": a["id"],
                    "qty": 10,
                    "unit_cost": 100,
                    "discount": 100,
                },
                {"description": "Cable B", "accessory_id": b["id"], "qty": 5, "unit_cost": 200},
            ],
            "discount": 190,
            "paid": 0,
        },
    )
    assert r.status_code == 201, r.text
    p = r.json()
    # 2,000 gross; 100 off line A; 190 off the bill, spread 90 / 100 over 900 / 1,000
    assert (
        float(p["subtotal"]) == 2000 and float(p["discount"]) == 290 and float(p["total"]) == 1710
    )
    lines = {ln["description"]: ln for ln in p["lines"]}
    assert (
        float(lines["Cable A"]["discount_share"]) == 190
        and float(lines["Cable A"]["net_cost"]) == 810
    )
    assert (
        float(lines["Cable B"]["discount_share"]) == 100
        and float(lines["Cable B"]["net_cost"]) == 900
    )
    # the stock holds each item at what it really cost; the books and the khata agree
    assert float(owner.get(f"/api/v1/accessories/{a['id']}").json()["avg_cost"]) == 81
    assert float(owner.get(f"/api/v1/accessories/{b['id']}").json()["avg_cost"]) == 180
    assert _tb(owner)["inventory"] == 1710
    assert abs(float(owner.get(f"/api/v1/parties/{sup['id']}").json()["balance"])) == 1710


def test_line_discount_limits_and_no_discount_is_unchanged(owner):
    sup = _party(owner)
    a = _item(owner, "Cable A")
    line = {"description": "Cable A", "accessory_id": a["id"], "qty": 10, "unit_cost": 100}
    too_big = owner.post(
        "/api/v1/purchases",
        json={
            "kind": "supplier",
            "party_id": sup["id"],
            "misc": [{**line, "discount": 1001}],
            "paid": 0,
        },
    )
    assert too_big.status_code == 422 and too_big.json()["error"]["code"] == "line_discount_too_big"
    # line and bill discount together more than the bill
    both = owner.post(
        "/api/v1/purchases",
        json={
            "kind": "supplier",
            "party_id": sup["id"],
            "misc": [{**line, "discount": 600}],
            "discount": 500,
            "paid": 0,
        },
    )
    assert both.status_code == 422 and both.json()["error"]["code"] == "discount_too_big"
    assert owner.get(f"/api/v1/accessories/{a['id']}").json()["qty"] == 0  # nothing was posted
    # no line discount: the same figures as always
    plain = owner.post(
        "/api/v1/purchases",
        json={
            "kind": "supplier",
            "party_id": sup["id"],
            "misc": [line],
            "discount": 100,
            "extra_costs": 50,
            "paid": 0,
        },
    ).json()
    assert float(plain["total"]) == 950 and float(plain["lines"][0]["net_cost"]) == 950
    assert float(owner.get(f"/api/v1/accessories/{a['id']}").json()["avg_cost"]) == 95


def test_library_kinds_and_lines_of_a_kind(owner):
    kinds = owner.get("/api/v1/accessories/library/kinds").json()
    names = [k["kind"] for k in kinds]
    assert names[0] == "charger" and {"cable", "cover", "glass", "Mouse", "Keyboard"} <= set(names)
    assert all(k["lines"] > 0 for k in kinds)
    # a card tapped: that kind's lines without typing; words narrow them
    mice = owner.get("/api/v1/accessories/library?kind=Mouse").json()
    assert mice and all(e["kind"] == "Mouse" for e in mice) and mice[0]["brand"] is None
    logi = owner.get("/api/v1/accessories/library?kind=Mouse&q=logitech").json()
    assert logi and all("Logitech" in e["name"] for e in logi)
    assert owner.get("/api/v1/accessories/library?kind=Mouse&q=anker 20w").json() == []
    # neither a word nor a kind: nothing
    assert owner.get("/api/v1/accessories/library").json() == []
    assert owner.get("/api/v1/accessories/library?q=a").json() == []
