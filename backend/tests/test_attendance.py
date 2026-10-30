"""Owner (2026-10-30): staff hazri (check in / out, owner marks leave) and what each staff member did."""

import datetime as dt

from app.core.clock import today
from tests.conftest import login
from tests.test_devices import _stock

IMEI = "490154203237518"


def test_hazri_and_staff_activity(owner, client, cat):
    r = owner.post(
        "/api/v1/staff",
        json={
            "name": "Ali Raza",
            "phone": "03211234567",
            "password": "secret123",
            "role": "salesman",
        },
    )
    assert r.status_code == 201, r.text
    ali_id = r.json()["id"]
    ali = login(client, "03211234567")

    # Ali's day: nothing yet → check in → not twice → sells a phone → checks out
    assert ali.get("/api/v1/attendance/today").json()["record"] is None
    r = ali.post("/api/v1/attendance/check-in")
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "present" and r.json()["in_at"]
    assert ali.post("/api/v1/attendance/check-in").status_code == 409
    d = _stock(owner, cat, imei=IMEI, condition="box_pack", cost_price=800, asking_price=1000)
    r = ali.post(
        "/api/v1/sales", json={"devices": [{"device_id": d["id"], "price": 1000}], "paid": 1000}
    )
    assert r.status_code == 201, r.text
    r = ali.post("/api/v1/attendance/check-out")
    assert r.status_code == 200 and r.json()["out_at"] and r.json()["hours"] is not None
    assert ali.post("/api/v1/attendance/check-out").status_code == 409
    assert ali.get("/api/v1/attendance/today").json()["record"]["status"] == "present"

    # only the owner sees the shop's attendance; marks yesterday as leave for Ali
    t = today()
    y = t - dt.timedelta(days=1)
    assert ali.get("/api/v1/attendance").status_code == 403
    rows = owner.get(f"/api/v1/attendance?date_from={t}&date_to={t}").json()
    assert [x["user_name"] for x in rows] == ["Ali Raza"]
    r = owner.put(f"/api/v1/attendance/{ali_id}/{y}", json={"status": "leave", "note": "Eid"})
    assert r.status_code == 200 and r.json()["status"] == "leave" and r.json()["marked_by"]
    # the owner can mark their own day too
    assert (
        owner.put(
            f"/api/v1/attendance/{owner.me['user']['id']}/{y}", json={"status": "absent"}
        ).status_code
        == 200
    )
    summ = owner.get(f"/api/v1/attendance/summary?date_from={y}&date_to={t}").json()
    by = {s["user_name"]: s for s in summ}
    assert (
        by["Ali Raza"]["present"] == 1
        and by["Ali Raza"]["leave"] == 1
        and by["Ali Raza"]["missing"] == 0
    )
    assert by["Ali Raza"]["today"] == "present"
    me = next(s for s in summ if s["role"] == "owner")
    assert me["absent"] == 1 and me["missing"] == 1

    # activity: Ali made one sale of 1,000 today; the log names the bill
    act = owner.get(f"/api/v1/staff-activity?date_from={t}&date_to={t}").json()
    a = next(x for x in act if x["user_id"] == ali_id)
    assert a["sales_count"] == 1 and a["sales_total"] == "1000.00" and a["today"] == "present"
    assert a["actions"] >= 1 and a["last_login_at"]
    log = owner.get(f"/api/v1/staff-activity/{ali_id}/log?date_from={t}&date_to={t}").json()
    inv = next(x for x in log if x["entity"] == "invoice")
    assert (
        inv["action"] == "create" and inv["ref"].startswith("INV-") and inv["amount"] == "1000.00"
    )
    assert ali.get("/api/v1/staff-activity").status_code == 403
