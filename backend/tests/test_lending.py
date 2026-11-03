"""Len-den (docs/32): money lent to / borrowed from a person with no bill. It sits in the person's
one khata (so it nets with later bills), is never put on a bill when it is made, can be adjusted
against later bills, and every report keeps it apart from bill money."""

from tests.conftest import login
from tests.test_purchases import _dev, _party

P = "/api/v1/payments"


def _lend(actor, party_id, direction, amount, **extra):
    r = actor.post(
        P,
        json={
            "party_id": party_id,
            "direction": direction,
            "purpose": "lending",
            "amount": amount,
            **extra,
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


def _phones(owner, cat, n, start=0):
    sup = _party(owner, name="Dealer", phone="03005550000")
    imeis = ["490154203237518", "356938035643809", "352099001761481", "353918050000007"]
    r = owner.post(
        "/api/v1/purchases",
        json={
            "kind": "supplier",
            "party_id": sup["id"],
            "devices": [
                {"device": _dev(cat, i), "cost": 1000, "asking_price": 3000}
                for i in imeis[start : start + n]
            ],
            "paid": 1000 * n,
        },
    )
    assert r.status_code == 201, r.text
    return [ln["device_id"] for ln in r.json()["lines"]]


def test_lent_money_is_in_the_khata_and_apart_in_every_report(owner, cat):
    cus = _party(owner, name="Bilal", phone="03215550002", kinds=("customer",))
    [dev] = _phones(owner, cat, 1)
    # an open bill exists: a normal payment would be put on it, len-den is not
    sale = owner.post(
        "/api/v1/sales",
        json={"party_id": cus["id"], "devices": [{"device_id": dev, "price": 3000}], "paid": 0},
    ).json()
    pay = _lend(owner, cus["id"], "out", 5000, notes="for his shop rent")
    assert (
        pay["purpose"] == "lending" and pay["allocations"] == [] and pay["unallocated"] == "5000.00"
    )
    assert owner.get(f"/api/v1/sales/{sale['id']}").json()["status"] == "open"
    # one khata: 3,000 bill + 5,000 len-den
    lend = owner.get(f"{P}/lending/{cus['id']}").json()
    assert (
        lend["balance"] == "8000.00" and lend["lending"] == "5000.00" and lend["bills"] == "3000.00"
    )
    assert lend["lent"] == "5000.00" and lend["borrowed"] == "0.00" and len(lend["entries"]) == 1
    # money the shop gave cannot pay the customer's sale bill: nothing to adjust
    assert lend["settle"]["in"]["amount"] == "0.00" and lend["settle"]["out"]["amount"] == "0.00"
    r = owner.post(f"{P}/settle/{cus['id']}")
    assert r.status_code == 422 and r.json()["error"]["code"] == "nothing_to_settle"

    # cash & bank: "lent", not "paid to people"
    cash = owner.get("/api/v1/shop-audit/cash", params={"preset": "today"}).json()
    assert cash["out"]["lent"] == "5000.00" and "paid_to_people" not in cash["out"]
    assert "lent" in cash["out_keys"] and "borrowed" in cash["in_keys"]
    # day report: the reason is len-den, and it is not udhaar coming back
    day = owner.get("/api/v1/reports/day").json()
    assert day["went_out"]["lending"] == "5000.00" and day["went_out"]["paid_out"] == "0.00"
    # overview: not "paid to people"
    ov = owner.get("/api/v1/shop-audit/overview", params={"preset": "today"}).json()
    debt = ov["debt"]
    assert debt["paid_in_period"] == "0.00" and debt["lent_in_period"] == "5000.00"
    # udhaar: the receivable holds it, and says how much of it is len-den
    u = owner.get("/api/v1/shop-audit/udhaar", params={"preset": "today"}).json()
    assert u["receivable"]["current"] == "8000.00"
    assert u["lending"]["receivable"] == "5000.00" and u["movement"]["lent"] == "5000.00"
    row = next(x for x in u["receivable_rows"] if x["party_id"] == cus["id"])
    assert row["amount"] == "8000.00" and row["lending"] == "5000.00"
    # the len-den report
    rep = owner.get("/api/v1/shop-audit/lending", params={"preset": "today"}).json()
    assert rep["totals"]["lent"] == "5000.00" and rep["totals"]["lent_count"] == 1
    assert rep["owed_to_shop"] == {"amount": "5000.00", "people": 1}
    assert rep["shop_owes"] == {"amount": "0.00", "people": 0}
    assert rep["people"][0]["name"] == "Bilal" and rep["people"][0]["open"] == "5000.00"
    assert rep["people"][0]["khata"] == "8000.00"
    assert sum(float(s["lent"]) for s in rep["series"]) == 5000.0
    assert rep["entries"][0]["notes"] == "for his shop rent"
    # the person's journey: len-den is not "paid to them later", it has its own figure
    j = owner.get(f"/api/v1/shop-audit/parties/{cus['id']}/journey").json()
    assert j["money"]["paid_later"] == "0.00" and j["money"]["lent"] == "5000.00"
    # a normal payment is still put on the bill, as before
    back = owner.post(P, json={"party_id": cus["id"], "direction": "in", "amount": 3000}).json()
    assert back["purpose"] == "bill" and back["allocations"][0]["document_no"] == sale["no"]
    assert owner.get(f"{P}/lending/{cus['id']}").json()["lending"] == "5000.00"
    # paying back the loan is len-den too
    _lend(owner, cus["id"], "in", 5000)
    after = owner.get(f"{P}/lending/{cus['id']}").json()
    assert after["balance"] == "0.00" and after["lending"] == "0.00"
    rep = owner.get("/api/v1/shop-audit/lending", params={"preset": "today"}).json()
    assert rep["totals"]["borrowed"] == "5000.00" and rep["owed_to_shop"]["amount"] == "0.00"
    # payments list filters by purpose
    lst = owner.get(P, params={"purpose": "lending"}).json()
    assert {x["purpose"] for x in lst} == {"lending"} and len(lst) == 2


def test_borrowed_money_is_adjusted_against_a_later_bill(owner, cat):
    cus = _party(owner, name="Usman", phone="03215550003", kinds=("customer",))
    _lend(owner, cus["id"], "in", 8000)  # he gave the shop 8,000
    _lend(owner, cus["id"], "out", 2000)  # the shop gave him 2,000 back: 6,000 still with us
    lend = owner.get(f"{P}/lending/{cus['id']}").json()
    assert lend["lending"] == "-6000.00" and lend["balance"] == "-6000.00"
    # later he buys a phone and pays nothing at the counter
    [dev] = _phones(owner, cat, 1)
    sale = owner.post(
        "/api/v1/sales",
        json={"party_id": cus["id"], "devices": [{"device_id": dev, "price": 3500}], "paid": 0},
    ).json()
    lend = owner.get(f"{P}/lending/{cus['id']}").json()
    assert lend["balance"] == "-2500.00"  # the khata already nets
    # only the net 6,000 of len-den can go on bills; the bill needs 3,500
    assert lend["settle"]["in"] == {"amount": "3500.00", "open_bills": "3500.00", "free": "6000.00"}
    s = owner.post(f"{P}/settle/{cus['id']}").json()
    assert s["total"] == "3500.00" and s["lines"][0]["document_no"] == sale["no"]
    assert owner.get(f"/api/v1/sales/{sale['id']}").json()["status"] == "paid"
    lend = owner.get(f"{P}/lending/{cus['id']}").json()
    # the khata did not move; len-den still open is what is left of his money
    assert (
        lend["balance"] == "-2500.00" and lend["lending"] == "-2500.00" and lend["bills"] == "0.00"
    )
    rep = owner.get("/api/v1/shop-audit/lending", params={"preset": "today"}).json()
    assert rep["totals"]["adjusted_on_bills"] == "3500.00"
    assert rep["shop_owes"] == {"amount": "2500.00", "people": 1}
    # the cash did not move on the adjust: still 8,000 in, 2,000 out of len-den today
    cash = owner.get("/api/v1/shop-audit/cash", params={"preset": "today"}).json()
    assert cash["in"]["borrowed"] == "8000.00" and cash["out"]["lent"] == "2000.00"
    # nothing left to adjust
    assert owner.post(f"{P}/settle/{cus['id']}").status_code == 422
    # reconciliation still holds
    rc = owner.get("/api/v1/shop-audit/reconcile", params={"preset": "today"}).json()
    assert rc["ok"], rc["checks"]


def test_lending_rules_void_roles_isolation_and_report(owner, other_owner, client, cat):
    cus = _party(owner, name="Sana", phone="03215550004", kinds=("customer",))
    # len-den is never paid against a bill
    r = owner.post(
        P,
        json={
            "party_id": cus["id"],
            "direction": "in",
            "purpose": "lending",
            "amount": 100,
            "allocations": [{"document_type": "invoice", "document_id": cus["id"], "amount": 100}],
        },
    )
    assert r.status_code == 422 and r.json()["error"]["code"] == "lending_no_bills"
    assert (
        owner.post(
            P, json={"party_id": cus["id"], "direction": "out", "purpose": "x", "amount": 1}
        ).status_code
        == 422
    )
    # a salesman may record len-den (like any payment) but not open the report
    owner.post(
        "/api/v1/staff",
        json={"name": "Ali", "phone": "03211234567", "password": "secret123", "role": "salesman"},
    )
    ali = login(client, "03211234567")
    pay = _lend(ali, cus["id"], "out", 1500)
    assert ali.get("/api/v1/shop-audit/lending").status_code == 403
    # a cancelled entry leaves the khata and the open len-den, and is counted as cancelled
    v = owner.post(f"{P}/{pay['id']}/void", json={"reason": "typed twice"})
    assert v.status_code == 200, v.text
    lend = owner.get(f"{P}/lending/{cus['id']}").json()
    assert lend["balance"] == "0.00" and lend["lending"] == "0.00" and lend["lent"] == "0.00"
    assert lend["entries"][0]["status"] == "voided"
    rep = owner.get("/api/v1/shop-audit/lending", params={"preset": "today"}).json()
    assert rep["totals"]["voided"] == 1 and rep["totals"]["lent"] == "0.00"
    u = owner.get("/api/v1/shop-audit/udhaar", params={"preset": "today"}).json()
    assert u["movement"]["lent"] == "0.00"
    # another shop sees none of it
    assert other_owner.get(f"{P}/lending/{cus['id']}").status_code == 404
    assert other_owner.post(f"{P}/settle/{cus['id']}").status_code == 404
    o = other_owner.get("/api/v1/shop-audit/lending", params={"preset": "today"}).json()
    assert o["people"] == [] and o["totals"]["lent"] == "0.00"
    # the complete report has the section
    _lend(owner, cus["id"], "out", 700)
    j = owner.get(
        "/api/v1/shop-audit/report",
        params={"preset": "today", "sections": "lending", "format": "json", "mode": "detail"},
    ).json()
    keys = [s["key"] for s in j["sections"]]
    assert {"lending", "lending_people", "lending_entries"} <= set(keys)
    people = next(s for s in j["sections"] if s["key"] == "lending_people")
    assert people["rows"][0][0] == "Sana"
    for fmt in ("xlsx", "pdf"):
        r = owner.get(
            "/api/v1/shop-audit/report",
            params={"preset": "today", "sections": "lending", "format": fmt},
        )
        assert r.status_code == 200, r.text


def test_return_dates_reminders_and_alerts(owner, db):
    import datetime as dt
    import uuid

    from app.core.clock import today
    from app.modules.auth.models import Shop
    from app.modules.notifications import jobs
    from app.modules.notifications.models import Message

    t = today()
    tariq = _party(owner, name="Tariq", phone="03215550009", kinds=("customer",))
    star = _party(owner, name="Star Mobiles", phone="03005550103", kinds=("shop",))
    # a return date is only for len-den
    r = owner.post(
        P,
        json={"party_id": tariq["id"], "direction": "in", "amount": 10, "due_date": t.isoformat()},
    )
    assert r.status_code == 422 and r.json()["error"]["code"] == "due_date_lending_only"
    # lent to Tariq, to come back yesterday: late
    lent = _lend(owner, tariq["id"], "out", 25000, due_date=(t - dt.timedelta(days=1)).isoformat())
    assert lent["due_date"] == (t - dt.timedelta(days=1)).isoformat()
    due = owner.get(f"{P}/lending/{tariq['id']}").json()["due"]
    assert due["side"] == "owes_us" and due["status"] == "late" and due["days_late"] == 1
    assert due["amount"] == "25000.00"
    # borrowed from Star Mobiles, to give back in 2 days: the shop must pay soon
    borrowed = _lend(
        owner, star["id"], "in", 50000, due_date=(t + dt.timedelta(days=2)).isoformat()
    )
    s = owner.get(f"{P}/lending/{star['id']}").json()["due"]
    assert s["side"] == "we_owe" and s["status"] == "soon"
    # home screen and overview alerts
    dash = owner.get("/api/v1/reports/dashboard").json()
    assert dash["lending_late"] == 1 and dash["lending_late_amount"] == "25000.00"
    assert dash["lending_we_owe_due"] == 1 and dash["lending_we_owe_amount"] == "50000.00"
    att = owner.get("/api/v1/shop-audit/overview", params={"preset": "today"}).json()["attention"]
    assert att["lending_late"] == 1 and att["lending_we_owe_due"] == 1
    # the list and the audit screen, earliest first
    rows = owner.get(f"{P}/lending-due").json()
    assert [x["name"] for x in rows] == ["Tariq", "Star Mobiles"]
    rep = owner.get("/api/v1/shop-audit/lending", params={"preset": "today"}).json()
    assert [x["status"] for x in rep["due"]] == ["late", "soon"]
    j = owner.get(
        "/api/v1/shop-audit/report",
        params={"preset": "today", "sections": "lending", "format": "json"},
    ).json()
    due_sec = next(s for s in j["sections"] if s["key"] == "lending_due")
    assert [r[0] for r in due_sec["rows"]] == ["Tariq", "Star Mobiles"]
    # a reminder by hand: WhatsApp link with the amount and the date
    m = owner.post(f"{P}/lending/{tariq['id']}/remind")
    assert m.status_code == 200, m.text
    m = m.json()
    assert m["template_key"] == "lending_late" and m["recipient"] == "03215550009"
    assert "25,000" in m["body"] and m["link"].startswith("https://wa.me/")
    assert owner.get(f"{P}/lending/{tariq['id']}").json()["due"]["reminded_at"] is not None
    # the shop owes Star Mobiles: no reminder to them
    r = owner.post(f"{P}/lending/{star['id']}/remind")
    assert r.status_code == 422 and r.json()["error"]["code"] == "nothing_to_remind"
    # the night job: on when udhaar reminders are on; Tariq was reminded just now -> skipped
    owner.put(
        "/api/v1/notifications/settings",
        json={"customer_reminder_whatsapp": True, "reminder_time": "00:00", "language": "en"},
    )
    shop = db.get(Shop, uuid.UUID(owner.shop_id))
    db.refresh(shop)
    jobs.tick(db)
    assert db.query(Message).filter_by(template_key="lending_late").count() == 1
    # three days later he is reminded again (once a day at most: the job runs once per day)
    from app.modules.payments.lending_due import auto_reminders
    from app.modules.payments.models import Payment

    db.get(Payment, uuid.UUID(lent["id"])).reminded_at = None
    db.commit()
    assert auto_reminders(db, shop) == 1
    db.commit()
    assert auto_reminders(db, shop) == 0
    # changing the date: an audit row, and the alert follows the new date
    r = owner.patch(
        f"{P}/{borrowed['id']}/due-date", json={"due_date": (t + dt.timedelta(days=20)).isoformat()}
    )
    assert r.status_code == 200 and r.json()["due_date"] == (t + dt.timedelta(days=20)).isoformat()
    assert owner.get("/api/v1/reports/dashboard").json()["lending_we_owe_due"] == 0
    owner.post(P, json={"party_id": tariq["id"], "direction": "in", "amount": 10})
    bill = owner.get(P, params={"purpose": "bill"}).json()
    assert owner.patch(f"{P}/{bill[0]['id']}/due-date", json={"due_date": None}).status_code == 422
    # paid back in full: no date, no alert
    _lend(owner, tariq["id"], "in", 25000)
    assert owner.get(f"{P}/lending/{tariq['id']}").json()["due"] is None
    assert owner.get("/api/v1/reports/dashboard").json()["lending_late"] == 0
