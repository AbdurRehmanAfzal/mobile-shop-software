"""FR-REP-01..05: repair jobs for customer devices and stock devices."""

from tests.conftest import login
from tests.test_devices import _stock
from tests.test_purchases import _party


def _customer(owner):
    return _party(owner, name="Ahmed Khan", phone="03219876543", kinds=("customer",))


def test_customer_repair_full_flow(owner):
    c = _customer(owner)
    r = owner.post(
        "/api/v1/repairs",
        json={
            "party_id": c["id"],
            "device_desc": "Samsung A54 black",
            "imei": "490154203237518",
            "fault_codes": ["screen", "battery"],
            "received_accessories": ["sim", "cover"],
            "estimate": 6000,
            "advance": 2000,
            "promised_at": "2020-01-01",
        },
    )
    assert r.status_code == 201, r.text
    j = r.json()
    assert (
        j["no"] == "REP-000001"
        and j["status"] == "received"
        and j["overdue"] is True
        and j["balance_due"] == "4000.00"
    )
    assert (
        owner.get(f"/api/v1/parties/{c['id']}").json()["balance"] == "-2000.00"
    )  # advance = credit
    assert owner.get("/api/v1/ledger/accounts").json()[0]["balance"] == "2000.00"
    # parts + labour
    r = owner.put(
        f"/api/v1/repairs/{j['id']}/parts",
        json=[{"description": "Screen A54", "qty": 1, "unit_cost": 3500, "unit_price": 4500}],
    )
    assert r.json()["parts_total"] == "4500.00"
    r = owner.patch(f"/api/v1/repairs/{j['id']}", json={"labour": 1000, "warranty_days": 15})
    assert r.json()["total"] == "5500.00"
    # status flow
    assert (
        owner.post(f"/api/v1/repairs/{j['id']}/status", json={"status": "delivered"}).status_code
        == 422
    )
    r = owner.post(
        f"/api/v1/repairs/{j['id']}/status",
        json={"status": "in_progress", "note": "screen ordered"},
    )
    assert r.json()["status"] == "in_progress"
    r = owner.post(f"/api/v1/repairs/{j['id']}/status", json={"status": "repaired"})
    assert r.json()["status"] == "repaired"
    assert [lg["to_status"] for lg in r.json()["status_log"]] == [
        "received",
        "in_progress",
        "repaired",
    ]
    assert (
        owner.post(f"/api/v1/repairs/{j['id']}/status", json={"status": "received"}).status_code
        == 409
    )
    # deliver with remaining payment
    r = owner.post(f"/api/v1/repairs/{j['id']}/deliver", json={"paid": 3500})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["status"] == "delivered" and d["paid"] == "5500.00" and d["balance_due"] == "0.00"
    assert owner.get(f"/api/v1/parties/{c['id']}").json()["balance"] == "0.00"
    assert owner.get("/api/v1/ledger/accounts").json()[0]["balance"] == "5500.00"
    g = owner.get(f"/api/v1/ledger/groups/{d['bill_group_id']}").json()
    assert next(x for x in g["entries"] if x["account"] == "repair_income")["credit"] == "5500.00"
    assert owner.get("/api/v1/repairs").json() == []  # open only
    assert len(owner.get("/api/v1/repairs", params={"open_only": "false"}).json()) == 1
    sheet = owner.get(f"/api/v1/repairs/{j['id']}/job-sheet").text
    assert "REP-000001" in sheet and "اسکرین" in sheet and "Ahmed Khan" in sheet


def test_repair_ready_notification_in_shop_language(owner):
    owner.put("/api/v1/notifications/settings", json={"customer_on_repair_ready_whatsapp": True})
    c = _customer(owner)
    j = owner.post(
        "/api/v1/repairs",
        json={"party_id": c["id"], "device_desc": "Nokia 105", "fault_codes": ["dead"]},
    ).json()
    owner.post(f"/api/v1/repairs/{j['id']}/status", json={"status": "repaired"})
    msgs = owner.get("/api/v1/notifications").json()
    assert (
        len(msgs) == 1
        and msgs[0]["event_type"] == "repair"
        and "Nokia 105" in msgs[0]["body"]
        and msgs[0]["lang"] == "ur"
    )


def test_stock_device_sent_outside_adds_cost(owner, cat):
    d = _stock(
        owner, cat, imei="490154203237518", condition="used", cost_price=1000, asking_price=1500
    )
    tech = _party(owner, name="Usman Tech", phone="03331112222", kinds=("technician",))
    r = owner.post(
        "/api/v1/repairs",
        json={"device_id": d["id"], "fault_codes": ["charging"], "outside_party_id": tech["id"]},
    )
    assert r.status_code == 201, r.text
    j = r.json()
    assert (
        j["device_desc"].startswith("Nokia")
        and j["imei"] == "490154203237518"
        and j["party_id"] is None
    )
    assert owner.get(f"/api/v1/devices/{d['id']}").json()["status"] == "in_repair"
    r = owner.post(f"/api/v1/repairs/{j['id']}/deliver", json={"outside_cost": 400})
    assert r.status_code == 200, r.text
    dev = owner.get(f"/api/v1/devices/{d['id']}").json()
    assert dev["status"] == "in_stock" and dev["cost_price"] == "1400.00"
    assert owner.get(f"/api/v1/parties/{tech['id']}").json()["balance"] == "-400.00"
    hist = owner.get(f"/api/v1/devices/{d['id']}/history").json()
    assert [h["type"] for h in hist][-2:] == ["sent_to_repair", "repair_returned"]


def test_returned_unrepaired_marks_stock_device_faulty(owner, cat):
    d = _stock(owner, cat, imei="356938035643809", condition="used", cost_price=1000)
    j = owner.post("/api/v1/repairs", json={"device_id": d["id"], "fault_codes": ["water"]}).json()
    r = owner.post(
        f"/api/v1/repairs/{j['id']}/status",
        json={"status": "returned_unrepaired", "note": "board dead"},
    )
    assert r.json()["status"] == "returned_unrepaired"
    assert owner.get(f"/api/v1/devices/{d['id']}").json()["status"] == "faulty"


def test_roles_and_validation(client, owner):
    c = _customer(owner)
    assert owner.post("/api/v1/repairs", json={"fault_codes": ["screen"]}).status_code == 422
    assert (
        owner.post(
            "/api/v1/repairs",
            json={"party_id": c["id"], "device_desc": "X", "fault_codes": ["nope"]},
        ).status_code
        == 422
    )
    owner.post(
        "/api/v1/staff",
        json={
            "name": "Tech",
            "phone": "03451112233",
            "password": "secret123",
            "role": "technician",
        },
    )
    t = login(client, "03451112233")
    j = owner.post(
        "/api/v1/repairs",
        json={"party_id": c["id"], "device_desc": "Vivo Y21", "fault_codes": ["mic"]},
    ).json()
    assert t.get("/api/v1/repairs").status_code == 200
    assert (
        t.post(f"/api/v1/repairs/{j['id']}/status", json={"status": "diagnosed"}).status_code == 200
    )
    assert t.post(f"/api/v1/repairs/{j['id']}/deliver", json={"paid": 0}).status_code == 403
    assert (
        t.post(
            "/api/v1/repairs",
            json={"party_id": c["id"], "device_desc": "X", "fault_codes": ["mic"]},
        ).status_code
        == 403
    )
    assert len(owner.get("/api/v1/repairs/fault-codes").json()) == 13
