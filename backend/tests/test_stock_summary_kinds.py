"""Owner 2026-11-22 (ADR-131): the stock summary opens with a card per kind of stock — mobiles,
tablets, watches, laptops, accessories — each with its pieces, its worth and how many brands and
models; a card opens that kind's brands and models. The figures are the summary's own: the kinds
add up to the total, one kind's brands add up to its card, and cost is never shown to a salesman."""

from decimal import Decimal

from tests.conftest import login
from tests.test_accessories import _acc
from tests.test_device_types import _buy, _tablet
from tests.test_devices import _stock
from tests.test_purchases import _party

A, B = "490154203237518", "352099001761481"
URL = "/api/v1/reports/stock-summary"


def test_cards_per_kind_add_up_and_one_kind_opens_its_brands(client, owner, cat):
    _stock(owner, cat, imei=A, cost_price=1000, asking_price=1500)
    _stock(owner, cat, imei=B, cost_price=2000, asking_price=2500)
    assert _buy(owner, _party(owner), _tablet(owner)).status_code == 201  # cost 50,000, asks 60,000
    _acc(owner, opening_qty=10, opening_cost=450)  # a charger at 800
    _acc(owner, name="Back cover", category="cover", price=300, opening_qty=2, opening_cost=100)
    _acc(owner, name="Glass", category="glass", price=200)  # none on the shelf

    s = owner.get(URL).json()
    # what was there before is as it was: every device together
    assert s["basis"] == "cost" and s["count"] == 3 and s["value"] == "53000.00"
    kinds = {k["key"]: k for k in s["kinds"]}
    assert set(kinds) >= {"phone", "tablet", "watch", "laptop"}
    assert (kinds["phone"]["count"], kinds["phone"]["value"]) == (2, "3000.00")
    assert (kinds["phone"]["brands"], kinds["phone"]["models"]) == (1, 1)
    assert (kinds["tablet"]["count"], kinds["tablet"]["value"]) == (1, "50000.00")
    assert (kinds["tablet"]["brands"], kinds["tablet"]["models"]) == (1, 1)
    assert (kinds["watch"]["count"], kinds["watch"]["value"], kinds["watch"]["brands"]) == (
        0,
        "0.00",
        0,
    )
    assert sum(k["count"] for k in s["kinds"]) == s["count"]
    assert sum(Decimal(k["value"]) for k in s["kinds"]) == Decimal(s["value"])

    # the accessories by their kind, at cost; a finished item is counted apart
    it = s["items"]
    assert (it["items"], it["pieces"], it["value"], it["low"], it["out"]) == (
        2,
        12,
        "4700.00",
        1,
        1,
    )
    assert [(g["key"], g["items"], g["pieces"], g["value"]) for g in it["kinds"]] == [
        ("charger", 1, 10, "4500.00"),
        ("cover", 1, 2, "200.00"),
    ]
    # the stock screen's own cards say the same pieces
    assert owner.get("/api/v1/devices/stock-status").json()["items"]["on_hand"] == it["pieces"]

    # one kind: only its brands, and they add up to its card
    t = owner.get(URL, params={"category": "tablet"}).json()
    assert t["count"] == 1 and t["value"] == "50000.00"
    assert [b["name"] for b in t["brands"]] == ["Samsung"]
    assert [m["name"] for m in t["brands"][0]["models"]] == ["Galaxy Tab A9+"]
    assert t["kinds"] == s["kinds"]  # the cards do not change with the kind opened
    p = owner.get(URL, params={"category": "phone"}).json()
    assert p["count"] == 2 and p["value"] == "3000.00"
    assert sum(b["count"] for b in p["brands"]) == 2
    assert owner.get(URL, params={"category": "watch"}).json()["brands"] == []

    # a salesman: everything at the selling price, never the cost
    owner.post(
        "/api/v1/staff",
        json={"name": "Sales", "phone": "03451112244", "password": "secret123", "role": "salesman"},
    )
    s2 = login(client, "03451112244").get(URL).json()
    assert s2["basis"] == "asking"
    k2 = {k["key"]: k for k in s2["kinds"]}
    assert k2["phone"]["value"] == "4000.00" and k2["tablet"]["value"] == "60000.00"
    assert s2["items"]["value"] == "8600.00"  # 10 × 800 + 2 × 300


def test_another_shop_sees_none_of_it(client, owner, cat):
    _stock(owner, cat, imei=A)
    _acc(owner, opening_qty=5, opening_cost=100)
    r = client.post(
        "/api/v1/auth/signup",
        json={
            "shop_name": "Other",
            "owner_name": "Other Owner",
            "phone": "03459998877",
            "password": "secret123",
        },
    )
    assert r.status_code in (200, 201), r.text
    other = login(client, "03459998877", "secret123")
    s = other.get(URL).json()
    assert s["count"] == 0 and all(k["count"] == 0 for k in s["kinds"])
    assert s["items"]["items"] == 0 and s["items"]["kinds"] == []
