"""Owner (2026-10-30): asking-price audit trail and salesman fraud prevention.

Vivo bought for 35,000 with asking 40,000; at the sale the asking is revised to 45,000 and the phone
sold for 45,000. The original 40,000 stays in history, the sale is one record everywhere, and the
shop's rules decide who may sell under the asking price or change it."""

from tests.conftest import login
from tests.test_purchases import _dev, _party

IMEI = "490154203237518"


def _vivo(owner, cat, asking=40000):
    a = _party(owner, name="Customer A", phone="03001111111", kinds=("customer",))
    r = owner.post(
        "/api/v1/purchases",
        json={
            "kind": "walk_in",
            "party_id": a["id"],
            "devices": [
                {"device": _dev(cat, IMEI, condition="used"), "cost": 35000, "asking_price": asking}
            ],
            "paid": 35000,
        },
    )
    assert r.status_code == 201, r.text
    dev_id = r.json()["lines"][0]["device_id"]
    owner.post(f"/api/v1/devices/{dev_id}/verification/override", json={"reason": "known"})
    return dev_id


def test_asking_revised_at_checkout_keeps_the_original(owner, cat):
    dev_id = _vivo(owner, cat)
    b = _party(owner, name="Customer B", phone="03002222222", kinds=("customer",))
    r = owner.post(
        "/api/v1/sales",
        json={
            "party_id": b["id"],
            "devices": [
                {
                    "device_id": dev_id,
                    "price": 45000,
                    "new_asking_price": 45000,
                    "asking_reason": "market rate",
                }
            ],
            "paid": 45000,
        },
    )
    assert r.status_code == 201, r.text
    inv = r.json()
    assert inv["lines"][0]["unit_price"] == "45000.00"
    # history: intake asking 40,000 → changed to 45,000 at checkout → sold at 45,000
    hist = owner.get(f"/api/v1/devices/{dev_id}/history").json()
    kinds = [h["type"] for h in hist]
    assert kinds[0] == "purchased" and hist[0]["data"]["asking"] == "40000.00"
    change = next(h for h in hist if h["type"] == "price_changed")
    assert change["data"] == {
        **change["data"],
        "from": "40000.00",
        "to": "45000.00",
        "reason": "market rate",
        "source": "checkout",
        "invoice_no": inv["no"],
    }
    assert change["user_name"] == "Owner" or change["user_id"]
    sold = next(h for h in hist if h["type"] == "sold")
    assert sold["data"]["asking_price"] == "45000.00" and sold["data"]["below_asking"] is False
    # the phone's money view: original 40,000, final 45,000, sold 45,000, margin 10,000
    m = owner.get(f"/api/v1/devices/{dev_id}/money").json()
    assert (
        m["summary"]["original_asking"] == "40000.00" and m["summary"]["asking_price"] == "45000.00"
    )
    assert m["summary"]["sold_for"] == "45000.00" and m["summary"]["margin"] == "10000.00"
    assert m["sale"]["asking_at_sale"] == "45000.00"
    # one record everywhere: receipt, sales list, day report, the price report
    assert "45,000" in owner.get(f"/api/v1/sales/{inv['id']}/receipt?lang=en").text
    assert owner.get(f"/api/v1/sales/{inv['id']}").json()["total"] == "45000.00"
    rep = owner.get("/api/v1/reports/price-changes").json()
    assert [r["kind"] for r in rep["rows"]] == ["asking_changed"]
    row = rep["rows"][0]
    assert (
        row["old_asking"] == "40000.00"
        and row["new_asking"] == "45000.00"
        and row["diff"] == "5000.00"
    )
    assert row["invoice_no"] == inv["no"] and row["source"] == "checkout" and row["imei1"] == IMEI


def test_salesman_rules_manager_then_pin(owner, client, cat):
    dev_id = _vivo(owner, cat)
    owner.post(
        "/api/v1/staff",
        json={"name": "Ali", "phone": "03211234567", "password": "secret123", "role": "salesman"},
    )
    ali = login(client, "03211234567")
    # default rule "manager": a salesman may not sell under the asking price nor change it
    r = ali.post(
        "/api/v1/sales", json={"devices": [{"device_id": dev_id, "price": 38000}], "paid": 38000}
    )
    assert r.status_code == 403 and r.json()["error"]["code"] == "approval_required"
    r = ali.post(
        "/api/v1/sales",
        json={
            "devices": [{"device_id": dev_id, "price": 42000, "new_asking_price": 42000}],
            "paid": 42000,
        },
    )
    assert r.status_code == 403 and r.json()["error"]["code"] == "approval_required"
    r = ali.patch(f"/api/v1/devices/{dev_id}", json={"asking_price": 39000})
    assert r.status_code == 403
    # at the asking price: fine
    assert ali.get(f"/api/v1/devices/{dev_id}").json()["asking_price"] == "40000.00"

    # the owner switches both rules to "pin": the salesman needs the owner's PIN
    r = owner.patch(
        "/api/v1/shops/current",
        json={"sale_rules": {"below_asking": "pin", "asking_change": "pin"}},
    )
    assert r.status_code == 200 and r.json()["sale_rules"] == {
        "below_asking": "pin",
        "asking_change": "pin",
    }
    assert (
        owner.patch(
            "/api/v1/shops/current", json={"sale_rules": {"below_asking": "whatever"}}
        ).status_code
        == 422
    )
    r = ali.post(
        "/api/v1/sales", json={"devices": [{"device_id": dev_id, "price": 38000}], "paid": 38000}
    )
    assert r.status_code == 409 and r.json()["error"]["code"] == "pin_required"
    r = ali.post(
        "/api/v1/sales",
        json={
            "devices": [{"device_id": dev_id, "price": 38000}],
            "paid": 38000,
            "approval_pin": "0000",
        },
    )
    assert r.status_code == 403 and r.json()["error"]["code"] == "pin_wrong"
    # the owner has no PIN yet → set one, then the salesman sells with it; the approval is recorded
    from app.core.security import hash_pin

    _set_owner_pin(client, owner.me["user"]["id"], hash_pin("4321"))
    r = ali.post(
        "/api/v1/sales",
        json={
            "devices": [
                {
                    "device_id": dev_id,
                    "price": 38000,
                    "new_asking_price": 39000,
                    "asking_reason": "scratch on screen",
                }
            ],
            "paid": 38000,
            "approval_pin": "4321",
        },
    )
    assert r.status_code == 201, r.text
    hist = owner.get(f"/api/v1/devices/{dev_id}/history").json()
    change = next(h for h in hist if h["type"] == "price_changed")
    assert (
        change["data"]["approved_by"] == owner.me["user"]["id"]
        and change["data"]["reason"] == "scratch on screen"
    )
    sold = next(h for h in hist if h["type"] == "sold")
    assert (
        sold["data"]["below_asking"] is True
        and sold["data"]["approved_by"] == owner.me["user"]["id"]
    )
    rep = owner.get("/api/v1/reports/price-changes").json()
    kinds = sorted(r["kind"] for r in rep["rows"])
    assert kinds == ["asking_changed", "below_asking"]
    under = next(r for r in rep["rows"] if r["kind"] == "below_asking")
    assert (
        under["sold_price"] == "38000.00"
        and under["old_asking"] == "39000.00"
        and under["diff"] == "-1000.00"
    )
    assert (
        under["user_name"] == "Ali"
        and under["approved_by"] == "Owner"
        and under["profit"] == "3000.00"
    )
    assert rep["by_user"][0]["user_name"] == "Ali" and rep["by_user"][0]["below_asking"] == 1
    # a salesman cannot read the report; nobody can edit a finalised bill's amounts
    assert ali.get("/api/v1/reports/price-changes").status_code == 403
    inv_id = r.json()["id"]
    assert ali.patch(f"/api/v1/sales/{inv_id}", json={"total": 1}).status_code in (403, 404, 405)


def _set_owner_pin(client, user_id, pin_hash):
    """The tests' session: give the owner a quick PIN directly."""
    import uuid

    from app.core.tenancy import get_db
    from app.modules.auth.models import User

    gen = client.app.dependency_overrides[get_db]()
    db = next(gen)
    u = db.get(User, uuid.UUID(user_id))
    u.pin_hash = pin_hash
    db.commit()
    try:
        next(gen)
    except StopIteration:
        pass


def test_rules_allow_lets_anyone(owner, client, cat):
    dev_id = _vivo(owner, cat)
    owner.patch(
        "/api/v1/shops/current",
        json={"sale_rules": {"below_asking": "allow", "asking_change": "allow"}},
    )
    owner.post(
        "/api/v1/staff",
        json={"name": "Ali", "phone": "03211234567", "password": "secret123", "role": "salesman"},
    )
    ali = login(client, "03211234567")
    r = ali.post(
        "/api/v1/sales", json={"devices": [{"device_id": dev_id, "price": 36000}], "paid": 36000}
    )
    assert r.status_code == 201, r.text
    rep = owner.get("/api/v1/reports/price-changes").json()
    assert rep["rows"][0]["kind"] == "below_asking" and rep["rows"][0]["approved_by"] is None
