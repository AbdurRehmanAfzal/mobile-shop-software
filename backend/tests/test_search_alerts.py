"""Owner (2026-10-29): search by the person's phone where it helps (stock / sold phones, repairs), and a
stock alert for counted items at or under their reorder level (home + night report)."""

from app.modules.auth.models import Shop
from app.modules.notifications import jobs
from tests.test_devices import _stock
from tests.test_purchases import _party

IMEI_A = "490154203237518"


def test_devices_and_repairs_found_by_customer_phone(owner, cat):
    c = _party(owner, name="Ahmed Khan", phone="03219876543", kinds=("customer",))
    d = _stock(owner, cat, imei=IMEI_A, condition="box_pack", cost_price=800, asking_price=1000)
    r = owner.post(
        "/api/v1/sales",
        json={
            "party_id": c["id"],
            "devices": [{"device_id": d["id"], "price": 1000}],
            "paid": 1000,
        },
    )
    assert r.status_code == 201, r.text
    sold = owner.get("/api/v1/devices", params={"q": "0321 9876", "status": "sold"}).json()
    assert [x["id"] for x in sold] == [d["id"]]
    assert (
        owner.get("/api/v1/devices", params={"q": "ahmed", "status": "sold"}).json()[0]["id"]
        == d["id"]
    )
    assert owner.get("/api/v1/devices", params={"q": "03001112233", "status": "sold"}).json() == []

    j = owner.post(
        "/api/v1/repairs",
        json={
            "party_id": c["id"],
            "device_desc": "Samsung A54",
            "imei": "356938035643809",
            "fault_codes": ["screen"],
            "estimate": 6000,
        },
    )
    assert j.status_code == 201, j.text
    for q in ("03219876543", "9876543", "Ahmed", "REP-000001", "35693803"):
        assert len(owner.get("/api/v1/repairs", params={"q": q}).json()) == 1, q
    assert owner.get("/api/v1/repairs", params={"q": "Nobody"}).json() == []


def test_low_stock_alert_on_dashboard_and_night_report(owner, db):
    assert owner.get("/api/v1/reports/dashboard").json()["low_stock_items"] == 0
    r = owner.post(
        "/api/v1/accessories",
        json={
            "name": "Type-C cable",
            "category": "cable",
            "price": 300,
            "reorder_level": 3,
            "opening_qty": 2,
            "opening_cost": 150,
        },
    )
    assert r.status_code == 201, r.text
    assert r.json()["low_stock"] is True
    assert owner.get("/api/v1/reports/dashboard").json()["low_stock_items"] == 1
    owner.put(
        "/api/v1/notifications/settings", json={"owner_whatsapp": "03001234567", "language": "en"}
    )
    import uuid

    shop = db.get(Shop, uuid.UUID(owner.shop_id))
    db.refresh(shop)
    m = jobs.queue_daily_report(db, shop, jobs_today())
    assert m is not None and "Items low on stock: 1" in m.body


def jobs_today():
    from app.core.clock import today

    return today()
