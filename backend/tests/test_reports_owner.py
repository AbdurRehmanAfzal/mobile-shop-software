"""Owner's list (2026-10-26): who sold / who added stock, staff may skip a pending ID check,
what sold the most, and a plain sales estimate."""

import datetime as dt

from tests.conftest import login
from tests.test_devices import _stock
from tests.test_purchases import _party

A, B, C = "490154203237518", "356938035643809", "352099001761481"


def _salesman(client, owner, phone="03451112266"):
    owner.post(
        "/api/v1/staff",
        json={"name": "Kashif Sales", "phone": phone, "password": "secret123", "role": "salesman"},
    )
    return login(client, phone)


def test_names_on_sale_and_purchase(client, owner, cat):
    s = _salesman(client, owner)
    sup = _party(owner, name="Dealer One", phone="03005556666", kinds=("supplier",))
    p = s.post(
        "/api/v1/purchases",
        json={
            "kind": "supplier",
            "party_id": sup["id"],
            "devices": [
                {
                    "device": {
                        "imei1": A,
                        "brand_id": cat["brand"]["id"],
                        "model_id": cat["model"]["id"],
                        "condition": "box_pack",
                        "pta_status": "pta_approved",
                    },
                    "cost": 1000,
                }
            ],
            "paid": 1000,
        },
    )
    assert p.status_code == 201, p.text
    assert p.json()["created_by_name"] == "Kashif Sales"
    dev = owner.get(f"/api/v1/devices/imei/{A}").json()["device"]
    sale = owner.post(
        "/api/v1/sales", json={"devices": [{"device_id": dev["id"], "price": 1500}], "paid": 1500}
    ).json()
    assert sale["created_by_name"] == owner.me["user"]["name"] != "Kashif Sales"
    day = owner.get("/api/v1/reports/day").json()
    assert day["items"][0]["sold_by"] == sale["created_by_name"]


def test_staff_can_skip_a_pending_id_check(client, owner, cat):
    s = _salesman(client, owner, phone="03451112277")
    d = _stock(owner, cat, imei=A)  # used phone -> ID check pending
    assert owner.get(f"/api/v1/devices/{d['id']}").json()["verification_status"] == "pending"
    r = s.post(f"/api/v1/devices/{d['id']}/verification/override", json={"reason": "known person"})
    assert r.status_code == 200, r.text
    hist = owner.get(f"/api/v1/devices/{d['id']}/history").json()
    assert hist[-1]["data"]["override"] is True and hist[-1]["user_name"] == "Kashif Sales"


def test_top_sellers_and_forecast(owner, cat):
    other = next(
        m
        for m in owner.get(
            "/api/v1/catalogue/models", params={"brand_id": cat["brand"]["id"]}
        ).json()
        if m["id"] != cat["model"]["id"]
    )
    d1 = _stock(owner, cat, imei=A, condition="box_pack", cost_price=800, asking_price=1000)
    d2 = _stock(owner, cat, imei=B, condition="box_pack", cost_price=800, asking_price=1000)
    _stock(owner, cat, imei=C, model_id=other["id"], condition="box_pack", cost_price=500)
    for d in (d1, d2):
        r = owner.post(
            "/api/v1/sales",
            json={
                "devices": [{"device_id": d["id"], "price": 1000}],
                "misc": [{"description": "Cover", "qty": 1, "unit_price": 200}],
                "paid": 1200,
            },
        )
        assert r.status_code == 201, r.text

    top = owner.get("/api/v1/reports/top-sellers").json()
    assert top[0]["qty"] == 2 and top[0]["kind"] == "device" and top[0]["profit"] == "400.00"
    assert {(t["name"], t["qty"]) for t in top} >= {("Cover", 2)}

    f = owner.get("/api/v1/reports/forecast").json()
    assert len(f["next_7_days"]) == 7 and f["last_7_days"] == "2400.00"
    assert f["next_7_days"][0]["date"] == str(dt.date.today() + dt.timedelta(days=1))
    by_name = {m["name"]: m for m in f["models"]}
    sold_model = next(m for m in f["models"] if m["sold_30_days"] == 2)
    assert sold_model["in_stock"] == 0 and sold_model["days_left"] == 0
    assert sold_model["advice"] == "buy_more"
    slow = next(m for n, m in by_name.items() if other["name"] in n)
    assert slow["in_stock"] == 1 and slow["sold_30_days"] == 0 and slow["advice"] == "slow"


def test_seller_can_skip_a_pending_check_at_sale_but_not_a_flag(client, owner, cat):
    s = _salesman(client, owner, phone="03451112288")
    d = _stock(owner, cat, imei=A)  # used phone -> ID check pending
    body = {"devices": [{"device_id": d["id"], "price": 1500}], "paid": 1500}
    r = s.post("/api/v1/sales", json=body)
    assert r.status_code == 409 and r.json()["error"]["code"] == "not_sellable"
    r = s.post("/api/v1/sales", json={**body, "override_reason": "known customer"})
    assert r.status_code == 201, r.text
    hist = owner.get(f"/api/v1/devices/{d['id']}/history").json()
    skip = next(e for e in hist if e["type"] == "verified")
    assert skip["data"]["override"] is True and skip["user_name"] == "Kashif Sales"

    f = _stock(owner, cat, imei=B)
    owner.put(f"/api/v1/devices/{f['id']}/verification", json={"egadget_result": "flagged"})
    r = s.post(
        "/api/v1/sales",
        json={
            "devices": [{"device_id": f["id"], "price": 1500}],
            "paid": 1500,
            "override_reason": "x",
        },
    )
    assert r.status_code == 409 and r.json()["error"]["code"] == "device_flagged"


def test_selling_price_not_below_buying_price(client, owner, cat):
    """Owner (2026-10-27): the sell price may not be below the buying price."""
    # asking price below cost is refused when the phone is entered
    r = owner.post(
        "/api/v1/devices/opening-stock",
        json={
            "imei1": A,
            "brand_id": cat["brand"]["id"],
            "model_id": cat["model"]["id"],
            "condition": "box_pack",
            "pta_status": "pta_approved",
            "cost_price": 1000,
            "asking_price": 900,
        },
    )
    assert r.status_code == 422
    d = _stock(owner, cat, imei=A, condition="box_pack", cost_price=1000, asking_price=1200)
    # changing the price later is checked too
    assert owner.patch(f"/api/v1/devices/{d['id']}", json={"asking_price": 800}).status_code == 422
    body = {"devices": [{"device_id": d["id"], "price": 900}], "paid": 900}
    # a salesman cannot sell at a loss, even when asking for it
    s = _salesman(client, owner, phone="03451112299")
    r = s.post("/api/v1/sales", json={**body, "below_cost_ok": True})
    assert r.status_code == 409 and r.json()["error"]["code"] == "below_cost"
    # the owner must confirm the loss
    r = owner.post("/api/v1/sales", json=body)
    assert r.status_code == 409 and r.json()["error"]["code"] == "below_cost"
    r = owner.post("/api/v1/sales", json={**body, "below_cost_ok": True})
    assert r.status_code == 201, r.text


def test_from_date_after_to_date_is_refused(owner):
    r = owner.get(
        "/api/v1/reports/day", params={"date_from": "2026-10-10", "date_to": "2026-10-01"}
    )
    assert r.status_code == 422 and r.json()["error"]["code"] == "bad_date_range"
    r = owner.get(
        "/api/v1/reports/profit-loss", params={"date_from": "2026-10-10", "date_to": "2026-10-01"}
    )
    assert r.status_code == 422
