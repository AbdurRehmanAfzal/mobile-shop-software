"""Owner brief 2026-11-10 (ADR-058): one screen of open balances — lena hai / dena hai — by phone
(IMEI), customer, dealer and technician, read from the bills, jobs, payments and the khata, every
obligation counted once; paying from a row settles it."""

import uuid

from tests.conftest import login
from tests.test_devices import _stock
from tests.test_purchases import _dev, _party

I1234 = "356938035641234"
I5678 = "356938035645678"
B = "/api/v1/balances"


def _group(owner, view, key):
    data = owner.get(B, params={"view": view}).json()
    return data, next((g for g in data["groups"] if g["key"] == key), None)


def _setup(owner, cat):
    ali = _party(owner, name="Ali", phone="03211111111", kinds=("customer",))
    sara = _party(owner, name="Sara", phone="03212222222", kinds=("customer",))
    bilal = _party(owner, name="Bilal", phone="03213333333", kinds=("supplier",))
    usman = _party(owner, name="Usman", phone="03214444444", kinds=("technician",))
    # IMEI 1234: bought from Bilal for 20,000 on udhaar, sold to Ali for 15,000 on udhaar
    p = owner.post(
        "/api/v1/purchases",
        json={
            "kind": "supplier",
            "party_id": bilal["id"],
            "devices": [{"device": _dev(cat, I1234), "cost": 20000}],
        },
    )
    assert p.status_code == 201, p.text
    d1234 = p.json()["lines"][0]["device_id"]
    s = owner.post(
        "/api/v1/sales",
        json={
            "party_id": ali["id"],
            "devices": [{"device_id": d1234, "price": 15000}],
            "below_cost_ok": True,
            "paid": 0,
        },
    )
    assert s.status_code == 201, s.text
    # Ali's phone goes to Usman's lab: 2,000 charge, not paid
    j = owner.post(
        "/api/v1/repairs",
        json={
            "party_id": ali["id"],
            "device_desc": "Nokia",
            "imei": I1234,
            "fault_codes": ["screen"],
            "estimate": 0,
            "advance": 0,
        },
    )
    assert j.status_code == 201, j.text
    t = owner.post(
        f"/api/v1/repairs/{j.json()['id']}/lab", json={"lab_party_id": usman["id"]}
    ).json()
    r = owner.post(
        f"/api/v1/repairs/{j.json()['id']}/lab/{t['id']}/back",
        json={"outcome": "fixed", "final_cost": 2000},
    )
    assert r.status_code == 200, r.text
    # IMEI 5678: sold to Sara for 10,000 cash, returned; the 10,000 is owed back to her
    d5678 = _stock(
        owner, cat, imei=I5678, condition="box_pack", cost_price=8000, asking_price=10000
    )
    s2 = owner.post(
        "/api/v1/sales",
        json={
            "party_id": sara["id"],
            "devices": [{"device_id": d5678["id"], "price": 10000}],
            "paid": 10000,
        },
    ).json()
    rr = owner.post(
        "/api/v1/returns/sale",
        json={"invoice_id": s2["id"], "line_ids": [s2["lines"][0]["id"]], "settlement": "credit"},
    )
    assert rr.status_code == 201, rr.text
    return ali, sara, bilal, usman


def test_the_four_balances_and_paying_them(owner, cat):
    ali, sara, bilal, usman = _setup(owner, cat)

    data, g = _group(owner, "imei", I1234)
    assert data["totals"] == {"get": "15000.00", "give": "32000.00"}
    assert g["get"] == "15000.00" and g["give"] == "22000.00"
    assert {i["source"] for i in g["items"]} == {"invoice", "purchase", "lab"}
    assert {p["name"] for p in g["parties"]} == {"Ali", "Bilal", "Usman"}
    _, g2 = _group(owner, "imei", I5678)
    assert g2["give"] == "10000.00" and g2["items"][0]["source"] == "invoice"
    # the same entries by person, each in its own tab
    assert _group(owner, "customer", ali["id"])[1]["get"] == "15000.00"
    assert _group(owner, "customer", sara["id"])[1]["give"] == "10000.00"
    assert _group(owner, "dealer", bilal["id"])[1]["give"] == "20000.00"
    assert _group(owner, "technician", usman["id"])[1]["give"] == "2000.00"

    # receive / pay from the rows (the forms send the bill when there is one)
    inv = next(i for i in g["items"] if i["source"] == "invoice")
    pur = next(i for i in g["items"] if i["source"] == "purchase")
    pay = lambda body: owner.post("/api/v1/payments", json=body)
    assert (
        pay(
            {
                "party_id": ali["id"],
                "direction": "in",
                "amount": 5000,
                "allocations": [
                    {"document_type": "invoice", "document_id": inv["source_id"], "amount": 5000}
                ],
            }
        ).status_code
        == 201
    )
    assert (
        pay(
            {
                "party_id": bilal["id"],
                "direction": "out",
                "amount": 8000,
                "allocations": [
                    {"document_type": "purchase", "document_id": pur["source_id"], "amount": 8000}
                ],
            }
        ).status_code
        == 201
    )
    assert pay({"party_id": usman["id"], "direction": "out", "amount": 2000}).status_code == 201
    assert pay({"party_id": sara["id"], "direction": "out", "amount": 4000}).status_code == 201

    data, g = _group(owner, "imei", I1234)
    assert g["get"] == "10000.00" and g["give"] == "12000.00"
    assert _group(owner, "imei", I5678)[1]["give"] == "6000.00"
    assert data["totals"] == {"get": "10000.00", "give": "18000.00"}
    assert _group(owner, "technician", usman["id"])[1] is None  # settled
    # each person's lena / dena add up to their khata
    for p, want in ((ali, "10000.00"), (bilal, "-12000.00"), (sara, "-6000.00"), (usman, "0.00")):
        assert owner.get(f"/api/v1/parties/{p['id']}").json()["balance"] == want
    # the previous payment shows on the bill it settled
    inv = next(i for i in g["items"] if i["source"] == "invoice")
    assert [x["amount"] for x in inv["payments"]] == ["5000.00"]


def test_multi_phone_bill_is_shown_once_unallocated(owner, cat):
    ali = _party(owner, name="Ali", phone="03211111111", kinds=("customer",))
    a = _stock(owner, cat, imei=I1234, condition="box_pack", cost_price=5000, asking_price=10000)
    b = _stock(owner, cat, imei=I5678, condition="box_pack", cost_price=5000, asking_price=10000)
    s = owner.post(
        "/api/v1/sales",
        json={
            "party_id": ali["id"],
            "devices": [
                {"device_id": a["id"], "price": 10000},
                {"device_id": b["id"], "price": 10000},
            ],
            "paid": 8000,
        },
    ).json()
    data, g = _group(owner, "imei", "unallocated")
    assert g["get"] == "12000.00" and g["items"][0]["no"] == s["no"]
    assert sorted(g["items"][0]["imeis"]) == sorted([I1234, I5678])
    assert _group(owner, "imei", I1234)[1] is None and _group(owner, "imei", I5678)[1] is None
    assert _group(owner, "customer", ali["id"])[1]["get"] == "12000.00"
    assert data["totals"]["get"] == "12000.00"  # once
    # search by bill number, phone model or IMEI; filter by direction
    assert (
        owner.get(B, params={"view": "customer", "q": s["no"]}).json()["groups"][0]["key"]
        == ali["id"]
    )
    assert (
        owner.get(B, params={"view": "imei", "q": I1234[-6:]}).json()["groups"][0]["key"]
        == "unallocated"
    )
    assert owner.get(B, params={"view": "customer", "direction": "give"}).json()["groups"] == []


def test_old_balance_shows_once_as_other(owner, cat):
    """what no bill explains (an old balance) still adds up to the khata, once"""
    ali = _party(owner, name="Ali", phone="03211111111", kinds=("customer",))
    r = owner.post(
        f"/api/v1/ledger/parties/{ali['id']}/opening-balance",
        json={"amount": 3000, "party_owes": True},
    )
    assert r.status_code == 201, r.text
    data, g = _group(owner, "customer", ali["id"])
    assert g["get"] == "3000.00" and g["items"][0]["source"] == "other"
    assert data["totals"]["get"] == "3000.00"
    assert _group(owner, "imei", "unallocated")[1] is None  # not a phone's


def test_payment_sent_twice_posts_once_and_staff_cannot_see(client, owner, cat):
    ali, _sara, _bilal, _usman = _setup(owner, cat)
    key = {"Idempotency-Key": str(uuid.uuid4())}
    body = {"party_id": ali["id"], "direction": "in", "amount": 5000}
    assert owner.post("/api/v1/payments", json=body, headers=key).status_code == 201
    assert owner.post("/api/v1/payments", json=body, headers=key).status_code == 201
    assert owner.get(f"/api/v1/parties/{ali['id']}").json()["balance"] == "10000.00"
    owner.post(
        "/api/v1/staff",
        json={"name": "Sales", "phone": "03451112233", "password": "secret123", "role": "salesman"},
    )
    assert login(client, "03451112233").get(B).status_code == 403
