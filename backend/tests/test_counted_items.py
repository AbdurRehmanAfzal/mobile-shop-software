"""Owner (2026-10-28): ordinary watches and accessories are bought and sold by count; selling
lowers the count and shows the profit, buying raises it."""

from tests.test_purchases import _party


def _item(owner, name, category, price):
    r = owner.post("/api/v1/accessories", json={"name": name, "category": category, "price": price})
    assert r.status_code == 201, r.text
    return r.json()


def test_buy_and_sell_watches_by_count(owner):
    watch = _item(owner, "Casio MTP-1302", "watch", 6500)
    sup = _party(owner, name="Watch Dealer", phone="03005557777", kinds=("supplier",))
    r = owner.post(
        "/api/v1/purchases",
        json={
            "kind": "supplier",
            "party_id": sup["id"],
            "devices": [],
            "misc": [
                {
                    "description": watch["name"],
                    "qty": 3,
                    "unit_cost": 4500,
                    "accessory_id": watch["id"],
                }
            ],
            "paid": 13500,
        },
    )
    assert r.status_code == 201, r.text
    w = owner.get(f"/api/v1/accessories/{watch['id']}").json()
    assert w["qty"] == 3 and w["avg_cost"] == "4500.00"

    sale = owner.post(
        "/api/v1/sales",
        json={
            "misc": [
                {
                    "description": watch["name"],
                    "qty": 1,
                    "unit_price": 6500,
                    "accessory_id": watch["id"],
                }
            ],
            "paid": 6500,
        },
    )
    assert sale.status_code == 201, sale.text
    assert sale.json()["profit"] == "2000.00"
    assert owner.get(f"/api/v1/accessories/{watch['id']}").json()["qty"] == 2

    # more than in stock is refused
    too_many = owner.post(
        "/api/v1/sales",
        json={
            "misc": [
                {
                    "description": watch["name"],
                    "qty": 5,
                    "unit_price": 6500,
                    "accessory_id": watch["id"],
                }
            ],
            "paid": 32500,
        },
    )
    assert too_many.status_code in (409, 422)
    assert owner.get(f"/api/v1/accessories/{watch['id']}").json()["qty"] == 2
