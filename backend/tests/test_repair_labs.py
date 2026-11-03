"""Repair labs (docs/34): a repair job sent to outside labs / technicians in the market, one trip at a
time, with the complete record of every lab; the lab's charge goes to its khata and to the right
cost; the repair sticker with the fields the shop picks; the scan of a sticker; the repairs audit."""

from tests.conftest import login
from tests.test_devices import _stock
from tests.test_purchases import _party

R = "/api/v1/repairs"


def _lab(owner, name="Ali Repair Lab", phone="03004440001"):
    return _party(owner, name=name, phone=phone, kinds=("technician",))


def _job(owner, customer, **extra):
    r = owner.post(
        R,
        json={
            "party_id": customer["id"],
            "device_desc": "Samsung A54 black",
            "imei": "490154203237518",
            "fault_codes": ["screen"],
            "fault_text": "lines on screen",
            "received_accessories": ["sim", "cover"],
            "estimate": 9000,
            "advance": 2000,
            "promised_at": "2020-01-01",
            **extra,
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


def test_customer_phone_to_two_labs_with_full_record(owner):
    cus = _party(owner, name="Ahmed Khan", phone="03219876543", kinds=("customer",))
    ali, zain = _lab(owner), _lab(owner, "Zain Mobile Lab", "03004440002")
    j = _job(owner, cus)
    # only a lab (technician) can get a phone
    r = owner.post(f"{R}/{j['id']}/lab", json={"lab_party_id": cus["id"]})
    assert r.status_code == 422 and r.json()["error"]["code"] == "not_a_lab"
    # first trip: Ali, quoted 5,000
    r = owner.post(
        f"{R}/{j['id']}/lab",
        json={
            "lab_party_id": ali["id"],
            "problem": "change screen",
            "quoted_cost": 5000,
            "expected_back": "2020-01-02",
        },
    )
    assert r.status_code == 201, r.text
    t1 = r.json()
    assert t1["status"] == "at_lab" and t1["lab_name"] == "Ali Repair Lab" and t1["late"] is True
    job = owner.get(f"{R}/{j['id']}").json()
    assert job["status"] == "in_progress" and job["at_lab"]["id"] == t1["id"]
    assert job["outside_party_name"] == "Ali Repair Lab"
    # one trip at a time
    r = owner.post(f"{R}/{j['id']}/lab", json={"lab_party_id": zain["id"]})
    assert r.status_code == 409 and r.json()["error"]["code"] == "already_at_lab"
    # it came back not fixed, Ali charged 500 for checking, paid nothing yet
    r = owner.post(
        f"{R}/{j['id']}/lab/{t1['id']}/back", json={"outcome": "not_fixed", "final_cost": 500}
    )
    assert r.status_code == 200, r.text
    assert r.json()["outcome"] == "not_fixed" and r.json()["status"] == "back"
    job = owner.get(f"{R}/{j['id']}").json()
    assert (
        job["status"] == "in_progress" and job["at_lab"] is None and job["outside_cost"] == "500.00"
    )
    # the shop owes Ali 500 on his khata
    assert owner.get(f"/api/v1/parties/{ali['id']}").json()["balance"] == "-500.00"
    # second trip: Zain fixes it for 4,000, paid 1,000 on the spot
    t2 = owner.post(
        f"{R}/{j['id']}/lab", json={"lab_party_id": zain["id"], "quoted_cost": 4500}
    ).json()
    r = owner.post(
        f"{R}/{j['id']}/lab/{t2['id']}/back",
        json={"outcome": "fixed", "final_cost": 4000, "paid_now": 1000},
    )
    assert r.status_code == 200, r.text
    job = owner.get(f"{R}/{j['id']}").json()
    assert job["status"] == "repaired" and job["outside_cost"] == "4500.00"
    assert [t["lab_name"] for t in job["trips"]] == ["Ali Repair Lab", "Zain Mobile Lab"]
    assert owner.get(f"/api/v1/parties/{zain['id']}").json()["balance"] == "-3000.00"
    # the job's history says where it went
    notes = " ".join(x["note"] or "" for x in job["status_log"])
    assert "Ali Repair Lab" in notes and "Zain Mobile Lab" in notes
    # paid more than charged is refused
    t3 = owner.post(f"{R}/{j['id']}/lab", json={"lab_party_id": ali["id"]})
    assert t3.status_code == 201  # sent again after fixed (e.g. warranty)
    bad = owner.post(
        f"{R}/{j['id']}/lab/{t3.json()['id']}/back",
        json={"outcome": "fixed", "final_cost": 100, "paid_now": 200},
    )
    assert bad.status_code == 422
    # cancel a trip made by mistake
    c = owner.post(
        f"{R}/{j['id']}/lab/{t3.json()['id']}/cancel", json={"reason": "sent by mistake"}
    )
    assert c.status_code == 200 and c.json()["status"] == "cancelled"
    # the labs list and one lab's record
    labs = {x["name"]: x for x in owner.get(f"{R}/labs").json()}
    a, z = labs["Ali Repair Lab"], labs["Zain Mobile Lab"]
    assert a["sent"] == 1 and a["not_fixed"] == 1 and a["fixed"] == 0 and a["cost"] == "500.00"
    assert z["sent"] == 1 and z["fixed"] == 1 and z["fix_rate"] == 100 and z["cost"] == "4000.00"
    assert z["balance"] == "-3000.00" and z["at_lab"] == 0
    d = owner.get(f"{R}/labs/{ali['id']}").json()
    assert d["is_lab"] and len(d["trips"]) == 2
    assert {t["status"] for t in d["trips"]} == {"back", "cancelled"}
    assert d["trips"][-1]["job_no"] == j["no"] and d["trips"][-1]["customer_name"] == "Ahmed Khan"
    # deliver: the bill is the customer's; the labs' charges are a cost of this repair
    owner.patch(f"{R}/{j['id']}", json={"labour": 9000})
    r = owner.post(f"{R}/{j['id']}/deliver", json={"paid": 7000})
    assert r.status_code == 200, r.text
    rep = owner.get("/api/v1/shop-audit/repairs", params={"preset": "today"}).json()
    m = rep["money"]
    assert m["income"] == "9000.00" and m["lab_customer"] == "4500.00" and m["profit"] == "4500.00"
    assert rep["counts"]["came"] == 1 and rep["counts"]["given"] == 1
    assert rep["counts"]["sent_to_lab"] == 2 and rep["counts"]["back_from_lab"] == 2
    assert {x["name"] for x in rep["labs"]} == {"Ali Repair Lab", "Zain Mobile Lab"}
    assert rep["faults"][0]["code"] == "screen"
    # the complete report has the section
    js = owner.get(
        "/api/v1/shop-audit/report",
        params={"preset": "today", "sections": "repairs", "format": "json"},
    ).json()
    assert {"repairs", "repair_labs"} <= {s["key"] for s in js["sections"]}
    # books still balance
    assert owner.get("/api/v1/shop-audit/reconcile", params={"preset": "today"}).json()["ok"]


def test_shop_phone_lab_charge_goes_on_the_phone_once(owner, cat):
    d = _stock(
        owner, cat, imei="490154203237518", condition="used", cost_price=1000, asking_price=1500
    )
    lab = _lab(owner)
    j = owner.post(R, json={"device_id": d["id"], "fault_codes": ["charging"]}).json()
    t = owner.post(f"{R}/{j['id']}/lab", json={"lab_party_id": lab["id"]}).json()
    owner.post(f"{R}/{j['id']}/lab/{t['id']}/back", json={"outcome": "fixed", "final_cost": 400})
    dev = owner.get(f"/api/v1/devices/{d['id']}").json()
    assert dev["cost_price"] == "1400.00"
    # delivering does not book the lab's 400 a second time
    r = owner.post(f"{R}/{j['id']}/deliver", json={"outside_cost": 400})
    assert r.status_code == 200, r.text
    dev = owner.get(f"/api/v1/devices/{d['id']}").json()
    assert dev["cost_price"] == "1400.00" and dev["status"] == "in_stock"
    assert owner.get(f"/api/v1/parties/{lab['id']}").json()["balance"] == "-400.00"
    # the phone's history shows the lab trip
    ev = owner.get(f"/api/v1/devices/{d['id']}/history").json()
    kinds = [
        e.get("data", {}).get("kind")
        for e in (ev if isinstance(ev, list) else ev.get("events", []))
    ]
    assert "lab_sent" in kinds and "lab_back" in kinds
    rep = owner.get("/api/v1/shop-audit/repairs", params={"preset": "today"}).json()
    assert rep["money"]["lab_stock"] == "400.00" and rep["money"]["lab_customer"] == "0.00"


def test_sticker_fields_scan_roles_and_isolation(owner, other_owner, client):
    cus = _party(owner, name="Ahmed Khan", phone="03219876543", kinds=("customer",))
    j = _job(owner, cus)
    opts = owner.get("/api/v1/labels/options").json()
    assert "fault" in opts["repair_fields"] and "barcode" in opts["repair_default_fields"]
    # default fields
    r = owner.get("/api/v1/labels/repairs", params={"ids": j["id"], "lang": "en"})
    assert r.status_code == 200, r.text
    page = r.text
    assert j["no"] in page and "Ahmed Khan" in page and "Samsung A54" in page and "Screen" in page
    assert "<svg" in page  # the barcode
    assert "IMEI" not in page and "Rs. 9,000" not in page  # not picked
    # the shop picks the fields
    page = owner.get(
        "/api/v1/labels/repairs",
        params={
            "ids": j["id"],
            "fields": "no,imei,estimate,advance,accessories",
            "lang": "en",
            "size": "50x30",
        },
    ).text
    assert "IMEI 490154203237518" in page and "Rs. 9,000" in page and "Rs. 2,000" in page
    assert "SIM, Cover" in page and "Ahmed Khan" not in page and "<svg" not in page
    # Urdu sticker
    ur = owner.get("/api/v1/labels/repairs", params={"ids": j["id"], "lang": "ur"}).text
    assert "اسکرین" in ur
    # scanning the sticker opens the job
    hit = owner.get("/api/v1/barcodes/lookup", params={"code": j["no"].lower()}).json()
    assert hit["kind"] == "repair" and hit["repair"]["id"] == j["id"]
    # another shop sees nothing of it
    assert other_owner.get("/api/v1/labels/repairs", params={"ids": j["id"]}).status_code == 422
    assert (
        other_owner.get("/api/v1/barcodes/lookup", params={"code": j["no"]}).json()["kind"]
        == "none"
    )
    lab = _lab(owner)
    assert other_owner.get(f"{R}/labs/{lab['id']}").status_code == 404
    assert (
        other_owner.post(f"{R}/{j['id']}/lab", json={"lab_party_id": lab["id"]}).status_code == 404
    )
    # a salesman may send to a lab (repair work) but the audit is for owner / manager
    owner.post(
        "/api/v1/staff",
        json={
            "name": "Kashif",
            "phone": "03211234567",
            "password": "secret123",
            "role": "salesman",
        },
    )
    s = login(client, "03211234567")
    assert s.get("/api/v1/shop-audit/repairs").status_code == 403
