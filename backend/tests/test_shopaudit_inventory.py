"""Shop Audit P6 (docs/17): stock in every dimension (now and on a day), the age of each unit
in the shop's own bands with alerts, and the ID-check audit with bypasses by employee."""

import datetime as dt

from app.core.clock import today as shop_today
from tests.conftest import login
from tests.test_purchases import _dev, _party

A, B, C, D = "490154203237518", "356938035643809", "352099001761481", "358812091717195"


def _seed(owner, cat):
    """40 days ago from Dealer: a dear used phone (60,000 / 70,000, ID check pending), a box-pack
    (800 / 805: thin margin), a non-PTA used phone with no asking price. Today: one more box-pack
    (800 / 1,000) bought and sold on the spot."""
    t = shop_today()
    d40 = t - dt.timedelta(days=40)
    dealer = _party(owner, name="Dealer", phone="03005556666", kinds=("supplier",))
    r = owner.post(
        "/api/v1/purchases",
        json={
            "kind": "supplier",
            "party_id": dealer["id"],
            "date": d40.isoformat(),
            "devices": [
                {"device": _dev(cat, A, condition="used"), "cost": 60000, "asking_price": 70000},
                {"device": _dev(cat, B), "cost": 800, "asking_price": 805},
                {
                    "device": _dev(
                        cat, C, condition="used", pta_status="non_pta", sim_time_months=4
                    ),
                    "cost": 500,
                },
            ],
            "paid": 61300,
        },
    )
    assert r.status_code == 201, r.text
    a, b, c = (ln["device_id"] for ln in r.json()["lines"])
    r = owner.post(
        "/api/v1/purchases",
        json={
            "kind": "supplier",
            "party_id": dealer["id"],
            "devices": [{"device": _dev(cat, D), "cost": 800, "asking_price": 1000}],
            "paid": 800,
        },
    )
    d = r.json()["lines"][0]["device_id"]
    assert (
        owner.post(
            "/api/v1/sales", json={"devices": [{"device_id": d, "price": 1000}], "paid": 1000}
        ).status_code
        == 201
    )
    return t, dealer, (a, b, c, d)


def test_inventory_dimensions_values_and_as_of(owner, cat):
    t, _dealer, (_a, _b, _c, _d) = _seed(owner, cat)
    inv = owner.get("/api/v1/shop-audit/inventory").json()
    assert (
        inv["count"] == 3 and inv["cost_value"] == "61300.00" and inv["asking_value"] == "70805.00"
    )
    # margin only over phones that carry both prices: (70,000−60,000) + (805−800)
    assert inv["expected_margin"] == "10005.00" and inv["unpriced"] == 1 and inv["no_cost"] == 0
    dims = {x["key"]: x for x in inv["by_condition"]}
    assert (
        dims["used"]["count"] == 2
        and dims["box_pack"]["count"] == 1
        and dims["open_box"]["count"] == 0
    )
    pta = {x["key"]: x for x in inv["by_pta"]}
    assert pta["pta_approved"]["count"] == 2 and pta["non_pta"]["count"] == 1
    ver = {x["key"]: x for x in inv["by_verification"]}
    assert (
        ver["pending"]["count"] == 2 and ver["not_required"]["count"] == 1
    )  # used phones wait for the ID check
    assert inv["by_brand"][0]["count"] == 3 and inv["by_category"][0] == {
        "key": "phone",
        "count": 3,
        "cost": "61300.00",
        "asking": "70805.00",
    }
    assert inv["status_counts"]["in_stock"] == 3 and inv["status_counts"]["sold"] == 1
    assert (
        inv["most_expensive_cost"][0]["imei1"] == A
        and inv["most_expensive_asking"][0]["asking"] == "70000.00"
    )
    assert inv["highest_margin"][0]["imei1"] == A and inv["lowest_margin"][0]["imei1"] == B
    assert inv["lowest_margin"][0]["margin_pct"] == 0.6
    assert inv["prefs"]["age_bands"] == [15, 30, 60, 90]
    # on a day before today's purchase and sale: the three old phones, nothing sold yet
    old = owner.get(
        "/api/v1/shop-audit/inventory", params={"as_of": (t - dt.timedelta(days=1)).isoformat()}
    ).json()
    assert old["count"] == 3 and old["status_counts"]["sold"] == 0
    # before the first purchase: empty
    none = owner.get(
        "/api/v1/shop-audit/inventory", params={"as_of": (t - dt.timedelta(days=60)).isoformat()}
    ).json()
    assert none["count"] == 0 and none["asking_value"] == "0.00"


def test_ageing_bands_follow_the_shop_thresholds_and_raise_alerts(owner, cat):
    _t, _dealer, (_a, _b, _c, _d) = _seed(owner, cat)
    ag = owner.get("/api/v1/shop-audit/inventory/ageing").json()
    assert ag["band_edges"] == [15, 30, 60, 90] and ag["band_keys"] == [
        "fresh",
        "normal",
        "slow",
        "attention",
        "dead",
    ]
    bands = {x["band"]: x for x in ag["bands"]}
    assert (
        bands["slow"]["count"] == 3
        and bands["slow"]["cost"] == "61300.00"
        and bands["fresh"]["count"] == 0
    )
    rows = {r["imei1"]: r for r in ag["rows"]}
    assert rows[A]["days"] == 40 and rows[A]["band"] == "slow" and rows[A]["supplier"] == "Dealer"
    assert rows[A]["margin"] == "10000.00" and rows[A]["margin_pct"] == 16.7
    assert rows[C]["asking"] is None and rows[C]["margin"] is None
    kinds = {(x["kind"], x["imei1"]) for x in ag["alerts"]}
    assert ("high_value_slow", A) in kinds and ("verification_pending", A) in kinds
    assert ("low_margin", B) in kinds and ("missing_asking", C) in kinds
    assert ("dead_stock", A) not in kinds and ag["alert_counts"]["high_value_slow"] == 1
    # the owner tightens the bands: 40 days is now "dead"; a 100,000 high-value line no longer trips
    r = owner.patch(
        "/api/v1/shops/current",
        json={"audit_prefs": {"age_bands": [5, 10, 20, 30], "high_value": 100000}},
    )
    assert r.status_code == 200 and r.json()["audit_prefs"]["age_bands"] == [5, 10, 20, 30]
    assert r.json()["audit_prefs"]["low_margin_pct"] == 5  # the rest keeps its default
    ag = owner.get("/api/v1/shop-audit/inventory/ageing").json()
    assert {x["band"]: x["count"] for x in ag["bands"]}["dead"] == 3
    kinds = {(x["kind"], x["imei1"]) for x in ag["alerts"]}
    assert ("dead_stock", A) in kinds and ("high_value_slow", A) not in kinds
    assert (
        owner.patch(
            "/api/v1/shops/current", json={"audit_prefs": {"age_bands": [30, 10, 20, 40]}}
        ).status_code
        == 422
    )
    assert (
        owner.patch("/api/v1/shops/current", json={"audit_prefs": {"high_value": -1}}).status_code
        == 422
    )


def test_verification_audit_counts_bypasses_by_employee(owner, client, cat):
    _t, _dealer, (a, _b, c, _d) = _seed(owner, cat)
    owner.post(
        "/api/v1/staff",
        json={"name": "Ali", "phone": "03211234567", "password": "secret123", "role": "salesman"},
    )
    ali = login(client, "03211234567")
    # Ali skips the check on the dear phone to sell it; the owner skips the non-PTA one
    r = ali.post(f"/api/v1/devices/{a}/verification/override", json={"reason": "known person"})
    assert r.status_code in (200, 201), r.text
    assert owner.post(
        f"/api/v1/devices/{c}/verification/override", json={"reason": "regular seller"}
    ).status_code in (200, 201)
    v = owner.get("/api/v1/shop-audit/verification", params={"preset": "this_month"}).json()
    assert v["in_stock"] == {"not_required": 1, "pending": 0, "clear": 2, "flagged": 0}
    assert v["bypasses"] == 2 and len(v["rows"]) == 2
    rows = {r["imei1"]: r for r in v["rows"]}
    assert (
        rows[A]["user_name"] == "Ali"
        and rows[A]["reason"] == "known person"
        and rows[A]["previous"] == "pending"
    )
    assert rows[A]["party_name"] == "Dealer" and rows[A]["status_now"] == "clear"
    users = {u["user_name"]: u for u in v["by_user"]}
    assert (
        users["Ali"]["bypasses"] == 1
        and users["Ali"]["intakes"] == 0
        and users["Ali"]["unusual"] is False
    )
    # three skips by the same person with no intakes of their own → unusual
    for imei in ("358812091717196", "358812091717197"):
        pur = owner.post(
            "/api/v1/purchases",
            json={
                "kind": "walk_in",
                "party_id": _dealer["id"],
                "devices": [{"device": _dev(cat, imei, condition="used"), "cost": 100}],
                "paid": 100,
            },
        ).json()
        assert ali.post(
            f"/api/v1/devices/{pur['lines'][0]['device_id']}/verification/override",
            json={"reason": "friend"},
        ).status_code in (200, 201)
    v = owner.get("/api/v1/shop-audit/verification", params={"preset": "this_month"}).json()
    users = {u["user_name"]: u for u in v["by_user"]}
    assert users["Ali"]["bypasses"] == 3 and users["Ali"]["unusual"] is True
    assert v["by_user"][0]["user_name"] == "Ali"  # unusual first
    # the ID-check audit is not for a salesman
    assert ali.get("/api/v1/shop-audit/verification").status_code == 403
    assert ali.get("/api/v1/shop-audit/inventory").status_code == 403
