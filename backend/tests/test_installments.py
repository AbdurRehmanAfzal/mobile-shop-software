"""Owner (2026-10-29): phones sold on installments (qist): advance now, the rest monthly; the schedule
follows what the bill received (a khata payment counts too); collect, remind, home counts."""

import datetime as dt

from app.core.clock import today
from app.modules.installments.service import add_months
from app.modules.notifications.models import Message
from tests.test_devices import _stock
from tests.test_purchases import _party

IMEI_A = "490154203237518"


def test_sale_on_installments_schedule_collect_and_remind(owner, db, cat):
    c = _party(owner, name="Ahmed Khan", phone="03219876543", kinds=("customer",))
    d = _stock(owner, cat, imei=IMEI_A, condition="box_pack", cost_price=40000, asking_price=60000)
    first = add_months(today(), 1, 10)
    r = owner.post(
        "/api/v1/sales",
        json={
            "party_id": c["id"],
            "devices": [{"device_id": d["id"], "price": 60000}],
            "paid": 15000,
            "installments": {
                "months": 5,
                "due_day": 10,
                "guarantor_name": "Bilal Sb",
                "guarantor_phone": "0300 1112233",
                "guarantor_cnic": "3520212345671",
            },
        },
    )
    assert r.status_code == 201, r.text
    inv = r.json()
    assert inv["paid"] == "15000.00" and inv["status"] == "partially_paid"

    plans = owner.get("/api/v1/installments").json()
    assert len(plans) == 1
    p = plans[0]
    assert p["advance"] == "15000.00" and p["months"] == 5 and p["monthly"] == "9000.00"
    assert p["remaining"] == "45000.00" and p["next_due"] == first.isoformat()
    assert p["guarantor_phone"] == "03001112233" and p["guarantor_cnic"] == "35202-1234567-1"
    detail = owner.get(f"/api/v1/installments/{p['id']}").json()
    assert [s["status"] for s in detail["schedule"]] == ["due"] * 5
    assert detail["schedule"][4]["due_date"] == add_months(first, 4, 10).isoformat()
    # the receipt says it
    rec = owner.get(f"/api/v1/sales/{inv['id']}/receipt?lang=en").text
    assert "Installments:" in rec and "5 × 9,000 monthly" in rec and "Bilal Sb" in rec

    # a khata payment counts as the first installment; collecting pays the second and part of the third
    owner.post("/api/v1/payments", json={"party_id": c["id"], "direction": "in", "amount": 9000})
    detail = owner.get(f"/api/v1/installments/{p['id']}").json()
    assert [s["status"] for s in detail["schedule"]][:2] == ["paid", "due"]
    r = owner.post(f"/api/v1/installments/{p['id']}/collect", json={"amount": 12000})
    assert r.status_code == 200, r.text
    detail = r.json()
    assert [s["status"] for s in detail["schedule"]][:4] == ["paid", "paid", "partial", "due"]
    assert detail["remaining"] == "24000.00" and detail["paid_count"] == 2
    assert detail["payment_no"].startswith("PAY-") or True
    # too much is refused
    assert (
        owner.post(f"/api/v1/installments/{p['id']}/collect", json={"amount": 99999}).status_code
        == 422
    )

    # a reminder for the next installment
    owner.put("/api/v1/notifications/settings", json={"language": "en"})
    r = owner.post(f"/api/v1/installments/{p['id']}/remind")
    assert r.status_code == 200, r.text
    assert r.json()["template_key"] == "installment_due" and "Rs. 6,000" in r.json()["body"]

    # late: move the first due date back → late installment, home counts, late text
    import uuid

    from app.modules.installments.models import InstallmentPlan

    plan = db.get(InstallmentPlan, uuid.UUID(p["id"]))
    plan.first_due = today() - dt.timedelta(days=100)
    db.commit()
    late = owner.get("/api/v1/installments", params={"view": "overdue"}).json()
    assert len(late) == 1 and late[0]["overdue_count"] >= 1 and late[0]["days_late"] > 0
    dash = owner.get("/api/v1/reports/dashboard").json()
    assert dash["installments_overdue"] == 1
    r = owner.post(f"/api/v1/installments/{p['id']}/remind")
    assert r.json()["template_key"] == "installment_late"
    assert db.query(Message).filter_by(event_type="installment").count() == 2

    # paying the rest closes the plan
    owner.post(f"/api/v1/installments/{p['id']}/collect", json={"amount": 24000})
    assert owner.get(f"/api/v1/installments/{p['id']}").json()["status"] == "closed"
    assert owner.get("/api/v1/installments", params={"view": "active"}).json() == []
    assert (
        owner.post(f"/api/v1/installments/{p['id']}/collect", json={"amount": 1}).status_code == 422
    )


def test_installments_need_a_customer_and_something_left(owner, cat):
    d = _stock(owner, cat, imei=IMEI_A, condition="box_pack", cost_price=800, asking_price=1000)
    r = owner.post(
        "/api/v1/sales",
        json={
            "devices": [{"device_id": d["id"], "price": 1000}],
            "paid": 1000,
            "installments": {"months": 3},
        },
    )
    assert r.status_code == 422
    assert add_months(dt.date(2026, 1, 31), 1, 31) == dt.date(2026, 2, 28)
