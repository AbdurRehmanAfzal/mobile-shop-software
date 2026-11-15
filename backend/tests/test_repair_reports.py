"""Owner 2026-11-15 (ADR-087): a repair taken in by mistake is deleted (cancelled, kept in the
record); the shop's technicians to pick from; the repairs and the outside-labs reports on A4 /
Excel; repairs in the business overview."""

import io

from openpyxl import load_workbook

from tests.conftest import login
from tests.test_devices import _stock
from tests.test_purchases import _party
from tests.test_repair_labs import R, _job, _lab


def _cash(owner):
    return owner.get("/api/v1/ledger/accounts").json()[0]["balance"]


def test_delete_a_repair(client, owner, cat):
    cus = _party(owner, name="Bilal Khan", phone="03211112222", kinds=("customer",))
    before = _cash(owner)
    j = _job(owner, cus)  # 2,000 advance taken
    assert float(_cash(owner)) - float(before) == 2000
    lab = _lab(owner)
    owner.post(f"{R}/{j['id']}/lab", json={"lab_party_id": lab["id"], "quoted_cost": 3000})
    # a salesman may not delete
    owner.post(
        "/api/v1/staff",
        json={
            "name": "Sales Boy",
            "phone": "03451115511",
            "password": "secret123",
            "role": "salesman",
        },
    )
    s = login(client, "03451115511")
    assert s.post(f"{R}/{j['id']}/cancel", json={"reason": "by mistake"}).status_code == 403
    r = owner.post(f"{R}/{j['id']}/cancel", json={"reason": "entered by mistake"})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["status"] == "cancelled" and d["at_lab"] is None
    assert float(_cash(owner)) == float(before)  # the advance is reversed
    assert d["status_log"][-1]["note"] == "entered by mistake"
    # not in the open list, still found in all
    assert all(x["id"] != j["id"] for x in owner.get(f"{R}?open_only=true").json())
    assert any(x["id"] == j["id"] for x in owner.get(f"{R}?open_only=false").json())
    assert owner.post(f"{R}/{j['id']}/cancel", json={"reason": "again"}).status_code == 409


def test_delete_own_phone_back_to_stock_and_not_after_a_lab_charge(owner, cat):
    dev = _stock(owner, cat)
    j = owner.post(R, json={"device_id": dev["id"], "fault_codes": ["screen"]}).json()
    assert owner.get(f"/api/v1/devices/{dev['id']}").json()["status"] == "in_repair"
    owner.post(f"{R}/{j['id']}/cancel", json={"reason": "sent by mistake"})
    assert owner.get(f"/api/v1/devices/{dev['id']}").json()["status"] == "in_stock"

    cus = _party(owner, name="Asad", phone="03211113333", kinds=("customer",))
    j2 = _job(owner, cus)
    lab = _lab(owner)
    t = owner.post(f"{R}/{j2['id']}/lab", json={"lab_party_id": lab["id"]}).json()
    owner.post(
        f"{R}/{j2['id']}/lab/{t['id']}/back", json={"outcome": "not_fixed", "final_cost": 500}
    )
    r = owner.post(f"{R}/{j2['id']}/cancel", json={"reason": "not needed"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "lab_charge_booked"


def test_technicians(client, owner):
    owner.post(
        "/api/v1/staff",
        json={
            "name": "Tech Rafi",
            "phone": "03451116622",
            "password": "secret123",
            "role": "technician",
        },
    )
    rows = owner.get(f"{R}/technicians").json()
    assert rows[0]["name"] == "Tech Rafi" and rows[0]["role"] == "technician"
    assert any(x["role"] == "owner" for x in rows)


def test_reports_and_overview(owner, cat):
    cus = _party(owner, name="Report Customer", phone="03211114444", kinds=("customer",))
    lab = _lab(owner, "Report Lab", "03004449999")
    j = _job(owner, cus)
    t = owner.post(
        f"{R}/{j['id']}/lab",
        json={"lab_party_id": lab["id"], "problem": "change screen", "quoted_cost": 4000},
    ).json()
    owner.post(f"{R}/{j['id']}/lab/{t['id']}/back", json={"outcome": "fixed", "final_cost": 4000})
    owner.post(f"{R}/{j['id']}/status", json={"status": "repaired"})
    owner.post(f"{R}/{j['id']}/deliver", json={"labour": 9000, "paid": 5000})
    dev = _stock(owner, cat)
    owner.post(R, json={"device_id": dev["id"], "fault_codes": ["battery"]})

    page = owner.get(f"{R}/report?format=pdf&lang=en").text
    assert "Repairs report" in page and "size: A4 portrait" in page
    for want in (
        "Report Customer",
        "Report Lab",
        "Shop&#x27;s phone",
        "Customers who still owe",
        "Given back",
    ):
        assert want in page, want
    wb = load_workbook(io.BytesIO(owner.get(f"{R}/report?format=xlsx").content))
    assert wb.sheetnames[0] == "Summary" and "Every repair" in wb.sheetnames
    labs = owner.get(f"{R}/labs/report?format=pdf&lang=en").text
    assert (
        "Outside labs report" in labs
        and "Report Lab" in labs
        and "change screen" in labs
        and "4,000" in labs
    )
    one = owner.get(f"{R}/labs/report?format=pdf&lang=en&lab_id={lab['id']}").text
    assert "Report Lab" in one

    o = owner.get("/api/v1/reports/overview").json()["repairs"]
    assert o["came"] == 2 and o["own"] == 1 and o["customer"] == 1 and o["delivered"] == 1
    assert o["profit"] is not None
    ov = owner.get("/api/v1/reports/overview/export?format=pdf&lang=en").text
    assert "Repairs" in ov and "Repair bills" in ov
