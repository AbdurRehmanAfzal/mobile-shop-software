"""Owner (2026-11-09, ADR-053): the provider extends a shop's package on credit (agreed by word);
the shop never sees a credit option, only the fee as unpaid / part paid / paid on its fees page,
its invoice and the reminder. Payments clear the unpaid fee first, oldest first."""

import datetime as dt

from tests.conftest import login, signup

SUPER = "03990000099"


def _admin(client, monkeypatch):
    monkeypatch.setattr("app.core.config.settings.superuser_phones", SUPER, raising=False)
    signup(client, shop_name="OOP Admin", owner_name="Product Owner", phone=SUPER)
    return login(client, SUPER)


def _shop(admin, shop_id):
    return next(s for s in admin.get("/api/v1/admin/shops").json() if s["id"] == str(shop_id))


def test_credit_extension_paid_later(client, owner, monkeypatch):
    admin = _admin(client, monkeypatch)
    sid = owner.shop_id
    admin.patch(f"/api/v1/admin/shops/{sid}/plan", json={"plan": "basic", "monthly_fee": 1500})
    before = _shop(admin, sid)["plan_expires_at"]

    # only the provider can do it
    r = owner.post(f"/api/v1/admin/shops/{sid}/credit", json={"months": 2, "amount": 3000})
    assert r.status_code == 403
    promised = (dt.date.today() + dt.timedelta(days=10)).isoformat()
    r = admin.post(
        f"/api/v1/admin/shops/{sid}/credit",
        json={"months": 2, "amount": 3000, "due_on": promised, "note": "said he pays on the 15th"},
    )
    assert r.status_code == 201, r.text
    row = r.json()
    assert row["fee_due"] == "3000.00"
    assert row["plan_expires_at"] != before  # the package is extended now

    # the provider sees the invoice with the note
    d = admin.get(f"/api/v1/admin/shops/{sid}/fee-dues").json()
    assert d["left"] == "3000.00" and d["rows"][0]["status"] == "unpaid"
    assert d["rows"][0]["note"] == "said he pays on the 15th"
    assert d["rows"][0]["invoice_no"].startswith("FEE-") and d["rows"][0]["months"] == 2

    # the shop sees it as unpaid, never the note, never the word credit
    mine = owner.get("/api/v1/fees").json()
    assert mine["dues"]["left"] == "3000.00"
    assert mine["dues"]["rows"][0]["status"] == "unpaid"
    assert "note" not in mine["dues"]["rows"][0]
    assert "credit" not in str(mine).lower()
    assert owner.get("/api/v1/plan/reminder").json()["fee_unpaid"] == "3000.00"
    inv = owner.get("/api/v1/plan/fee-invoice").text
    assert "Fee still to pay" in inv and "Not paid" in inv
    assert "15th" not in inv and "credit" not in inv.lower()
    assert "باقی" in owner.get("/api/v1/plan/fee-invoice", params={"lang": "ur"}).text
    # the provider's copy is the same page
    assert "Fee still to pay" in admin.get(f"/api/v1/admin/shops/{sid}/fee-invoice").text

    # part paid: a reported Rs. 1,000 clears unpaid fee only, the package is not extended again
    until = _shop(admin, sid)["plan_expires_at"]
    pid = owner.post("/api/v1/fees", json={"amount": 1000, "method": "Easypaisa", "months": 1})
    pid = pid.json()["id"]
    pend = admin.get("/api/v1/admin/fee-payments", params={"status": "pending"}).json()
    assert next(p for p in pend if p["id"] == pid)["fee_due"] == "3000.00"
    r = admin.post(f"/api/v1/admin/fee-payments/{pid}/approve", json={})
    assert r.status_code == 200, r.text
    assert r.json()["to_dues"] == "1000.00" and r.json()["months"] == 0
    assert _shop(admin, sid)["plan_expires_at"] == until
    mine = owner.get("/api/v1/fees").json()
    assert mine["dues"]["rows"][0]["status"] == "partial"
    assert (mine["dues"]["paid"], mine["dues"]["left"]) == ("1000.00", "2000.00")
    assert "Part paid" in owner.get("/api/v1/plan/fee-invoice").text

    # a payment bigger than what is left: Rs. 2,000 to the fee, the other Rs. 1,500 buys a month
    r = admin.post(
        f"/api/v1/admin/shops/{sid}/payments",
        json={"amount": 3500, "method": "cash", "months": 1},
    )
    assert r.status_code == 201, r.text
    assert r.json()["to_dues"] == "2000.00"
    assert _shop(admin, sid)["plan_expires_at"] != until
    mine = owner.get("/api/v1/fees").json()
    assert mine["dues"]["left"] == "0.00" and mine["dues"]["rows"][0]["status"] == "paid"
    assert _shop(admin, sid)["fee_due"] == "0.00"
    assert "All fees are paid" in owner.get("/api/v1/plan/fee-invoice").text
    # the receipt says what went to the old fee
    assert "Against fee still unpaid" in owner.get(f"/api/v1/plan/receipts/{pid}").text


def test_oldest_first_and_no_dues(client, owner, monkeypatch):
    admin = _admin(client, monkeypatch)
    sid = owner.shop_id
    # nothing given on credit: nothing due, a payment buys months as before
    assert owner.get("/api/v1/fees").json()["dues"] == {
        "rows": [],
        "total": "0.00",
        "paid": "0.00",
        "left": "0.00",
    }
    assert "No fee is due" in owner.get("/api/v1/plan/fee-invoice").text
    r = admin.post(f"/api/v1/admin/shops/{sid}/payments", json={"amount": 1500, "months": 1})
    assert r.json()["to_dues"] == "0.00" and r.json()["months"] == 1

    admin.post(f"/api/v1/admin/shops/{sid}/credit", json={"months": 1, "amount": 1500})
    admin.post(f"/api/v1/admin/shops/{sid}/credit", json={"months": 1, "amount": 1500})
    r = admin.post(f"/api/v1/admin/shops/{sid}/payments", json={"amount": 2000, "months": 0})
    assert r.status_code == 201 and r.json()["to_dues"] == "2000.00"
    rows = owner.get("/api/v1/fees").json()["dues"]["rows"]
    assert [x["status"] for x in rows] == ["paid", "partial"]
    assert rows[1]["left"] == "1000.00"
    # an amount over what is owed only clears what is owed
    r = admin.post(f"/api/v1/admin/shops/{sid}/credit", json={"months": 0, "amount": 1})
    assert r.status_code == 422


def test_staff_and_other_shops_see_nothing(client, owner, monkeypatch):
    admin = _admin(client, monkeypatch)
    admin.post(f"/api/v1/admin/shops/{owner.shop_id}/credit", json={"months": 1, "amount": 1500})
    owner.post(
        "/api/v1/staff",
        json={"name": "Staff", "phone": "03451112233", "password": "secret123", "role": "salesman"},
    )
    staff = login(client, "03451112233")
    assert staff.get("/api/v1/plan/fee-invoice").status_code == 403
    assert staff.get("/api/v1/plan/reminder").json()["fee_unpaid"] is None
    other = signup(client, shop_name="Other", owner_name="Other", phone="03007770000")
    assert other.get("/api/v1/fees").json()["dues"]["left"] == "0.00"
