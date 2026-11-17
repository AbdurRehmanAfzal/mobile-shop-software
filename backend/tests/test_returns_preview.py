"""Owner 2026-11-18 (ADR-102): the impact preview before a return or an undo, and the
reconciliation of the books after returns.

The preview runs the real posting and rolls it back, so these tests check two things: it writes
nothing at all, and what it promised is exactly what the posting then does."""

import uuid
from decimal import Decimal

from sqlalchemy import func, select

from app.modules.devices.models import Device, DeviceEvent
from app.modules.ledger.models import LedgerEntry, LedgerGroup
from app.modules.parties.models import Party
from tests.conftest import login
from tests.test_returns_audit import (
    A,
    B,
    C,
    _books,
    _buy,
    _cash,
    _customer,
    _device,
    _khata,
    _profit,
    _sale_return,
    _sell,
    _stock_at_cost,
    _supplier,
)

D = "353918057929438"


def _state(owner, db, parties, devices) -> dict:
    """everything a posting could touch, to prove a preview touched none of it"""
    db.expire_all()
    return {
        "books": _books(owner),
        "cash": _cash(owner),
        "khata": [_khata(owner, p) for p in parties],
        "devices": [_device(owner, d)["status"] for d in devices],
        "returns": len(owner.get("/api/v1/returns").json()),
        "ledger_rows": db.scalar(select(func.count(LedgerEntry.id))),
        "events": db.scalar(select(func.count(DeviceEvent.id))),
    }


def test_sale_return_preview_writes_nothing_and_matches_the_posting(client, owner, db, cat):
    sup, cust = _supplier(owner), _customer(owner)
    dev = _buy(owner, cat, sup, [A])["lines"][0]["device_id"]
    inv = _sell(owner, cust, [dev])
    body = {
        "invoice_id": inv["id"],
        "line_ids": [inv["lines"][0]["id"]],
        "settlement": "refund",
        "refund_amount": 68000,
        "kept_amount": 2000,
        "item_condition": "ok",
    }
    before = _state(owner, db, [cust, sup], [dev])
    profit_before = _profit(owner)

    r = owner.post("/api/v1/returns/sale/preview", json=body)
    assert r.status_code == 200, r.text
    pv = r.json()
    # the original transaction
    o = pv["original"]
    assert o["bill_no"] == inv["no"] and o["party_name"] == "Ahmed Khan"
    assert o["items"] == [
        {"label": o["items"][0]["label"], "imei": A, "sold_for": "70000.00", "cost": "65000.00"}
    ]
    # the impact, as the brief's example
    assert (pv["amount"], pv["refund"], pv["kept"]) == ("70000.00", "68000.00", "2000.00")
    assert pv["stock_count"] == 1 and pv["stock_value"] == "65000.00"
    assert pv["cash_total"] == "-68000.00" and len(pv["cash"]) == 1
    assert pv["sales_change"] == "-70000.00" and pv["cogs_reversed"] == "65000.00"
    assert pv["retained_income"] == "2000.00" and pv["profit"] == "-3000.00"
    assert pv["devices"][0]["before"] == "sold" and pv["devices"][0]["after"] == "in_stock"
    assert pv["khata"][0]["before"] == "0.00" and pv["khata"][0]["after"] == "0.00"
    assert pv["balanced"] is True and pv["journal"] and pv["no_would_be"] == "RET-000001"
    # nothing was written: not a return, not a ledger line, not an event, not even the number
    assert _state(owner, db, [cust, sup], [dev]) == before
    assert _profit(owner) == profit_before

    # confirming with the token posts exactly what the preview said
    cash = _cash(owner)
    ok = owner.post("/api/v1/returns/sale", json={**body, "preview_token": pv["token"]})
    assert ok.status_code == 201, ok.text
    assert ok.json()["no"] == "RET-000001"
    assert _cash(owner) - cash == Decimal(pv["cash_total"])
    assert _profit(owner) - profit_before == Decimal(pv["profit"])
    assert _stock_at_cost(owner) == Decimal(pv["stock_value"])
    # the same token again: the bill has changed since that preview
    stale = owner.post("/api/v1/returns/sale", json={**body, "preview_token": pv["token"]})
    assert stale.status_code == 409 and stale.json()["error"]["code"] == "preview_stale"
    # a preview of something that cannot be posted says so, as the posting would
    again = owner.post("/api/v1/returns/sale/preview", json=body)
    assert again.status_code == 409

    # a salesman sees the plain impact, never cost, stock value, profit or the journal
    owner.post(
        "/api/v1/staff",
        json={"name": "Sales", "phone": "03451112244", "password": "secret123", "role": "salesman"},
    )
    dev2 = _buy(owner, cat, sup, [B])["lines"][0]["device_id"]
    inv2 = _sell(owner, cust, [dev2])
    s = login(client, "03451112244").post(
        "/api/v1/returns/sale/preview",
        json={
            "invoice_id": inv2["id"],
            "line_ids": [inv2["lines"][0]["id"]],
            "settlement": "refund",
        },
    )
    assert s.status_code == 200, s.text
    sp = s.json()
    assert sp["refund"] == "70000.00" and sp["stock_count"] == 1 and sp["cash_total"] == "-70000.00"
    for hidden in ("stock_value", "profit", "journal", "cogs_reversed"):
        assert hidden not in sp
    assert "cost" not in sp["original"]["items"][0] and "cost" not in sp["devices"][0]


def test_damaged_preview_and_changed_payload(owner, db, cat):
    sup, cust = _supplier(owner), _customer(owner)
    dev = _buy(owner, cat, sup, [A])["lines"][0]["device_id"]
    inv = _sell(owner, cust, [dev])
    body = {
        "invoice_id": inv["id"],
        "line_ids": [inv["lines"][0]["id"]],
        "settlement": "refund",
        "item_condition": "damaged",
    }
    pv = owner.post("/api/v1/returns/sale/preview", json=body).json()
    # damaged: back in the shop at its cost, but Faulty
    assert pv["devices"][0]["after"] == "faulty" and pv["stock_count"] == 1
    assert pv["stock_value"] == "65000.00"
    # a token belongs to what was previewed: a different amount needs a new look
    other = owner.post(
        "/api/v1/returns/sale",
        json={**body, "refund_amount": 60000, "kept_amount": 10000, "preview_token": pv["token"]},
    )
    assert other.status_code == 409 and other.json()["error"]["code"] == "preview_stale"
    assert _device(owner, dev)["status"] == "sold"
    # without a token the route works as it always did
    assert owner.post("/api/v1/returns/sale", json=body).status_code == 201
    assert _device(owner, dev)["status"] == "faulty"


def test_purchase_return_preview(owner, db, cat):
    sup, cust = _supplier(owner), _customer(owner)
    p = _buy(owner, cat, sup, [A, B], paid=100000)  # 30,000 still owed to the supplier
    d1, d2 = (ln["device_id"] for ln in p["lines"])
    body = {"purchase_id": p["id"], "line_ids": [p["lines"][0]["id"]], "refund_amount": 35000}
    before = _state(owner, db, [sup, cust], [d1, d2])
    r = owner.post("/api/v1/returns/purchase/preview", json=body)
    assert r.status_code == 200, r.text
    pv = r.json()
    assert pv["ok"] is True and pv["original"]["bill_no"] == p["no"]
    assert pv["original"]["party_name"] == "Hafeez Centre"
    assert (
        pv["original"]["items"][0]["imei"] == A and pv["original"]["items"][0]["cost"] == "65000.00"
    )
    assert pv["stock_count"] == -1 and pv["stock_value"] == "-65000.00"
    # only the 35,000 really handed back reaches the galla; the 30,000 owed is cancelled
    assert pv["cash_total"] == "35000.00"
    assert pv["khata"][0]["before"] == "-30000.00" and pv["khata"][0]["after"] == "0.00"
    assert pv["devices"][0]["after"] == "returned_to_supplier" and pv["profit"] == "0.00"
    assert pv["balanced"] is True
    assert _state(owner, db, [sup, cust], [d1, d2]) == before

    ok = owner.post("/api/v1/returns/purchase", json={**body, "preview_token": pv["token"]})
    assert ok.status_code == 201, ok.text
    assert _cash(owner) - before["cash"] == 35000 and _khata(owner, sup) == 0

    # a credit only: no cash is promised when none is handed back
    credit = owner.post(
        "/api/v1/returns/purchase/preview",
        json={"purchase_id": p["id"], "line_ids": [p["lines"][1]["id"]]},
    ).json()
    assert credit["cash"] == [] and credit["cash_total"] == "0.00"
    assert credit["khata"][0]["after"] == "65000.00"

    # the wrong kind of return: this phone is sold, so it is the customer's to bring back
    inv = _sell(owner, cust, [d2])
    wrong = owner.post(
        "/api/v1/returns/purchase/preview",
        json={"purchase_id": p["id"], "line_ids": [p["lines"][1]["id"]]},
    ).json()
    assert wrong["ok"] is False and wrong["blockers"][0]["code"] == "sold"
    assert wrong["blockers"][0]["ref"] == inv["no"] and wrong["blockers"][0]["who"] == "Ahmed Khan"
    refused = owner.post(
        "/api/v1/returns/purchase", json={"purchase_id": p["id"], "line_ids": [p["lines"][1]["id"]]}
    )
    assert refused.status_code == 409


def test_undo_preview_and_exact_restore(owner, db, cat):
    sup, cust = _supplier(owner), _customer(owner)
    dev = _buy(owner, cat, sup, [A])["lines"][0]["device_id"]
    inv = _sell(owner, cust, [dev])
    sold = _state(owner, db, [cust, sup], [dev])
    sold_profit = _profit(owner)
    ret = _sale_return(owner, inv, refund_amount=68000, kept_amount=2000).json()
    returned = _state(owner, db, [cust, sup], [dev])

    r = owner.get(f"/api/v1/returns/{ret['id']}/void-preview")
    assert r.status_code == 200, r.text
    pv = r.json()
    assert pv["undo"] is True and pv["original"]["no"] == ret["no"]
    assert pv["original"]["status"] == "posted" and pv["original"]["refund"] == "68000.00"
    assert pv["devices"][0]["before"] == "in_stock" and pv["devices"][0]["after"] == "sold"
    assert pv["stock_count"] == -1 and pv["stock_value"] == "-65000.00"
    assert pv["cash_total"] == "68000.00" and pv["profit"] == "3000.00" and pv["balanced"] is True
    assert _state(owner, db, [cust, sup], [dev]) == returned  # the preview undid nothing

    u = owner.post(
        f"/api/v1/returns/{ret['id']}/void",
        params={"preview_token": pv["token"]},
        json={"reason": "entered by mistake"},
    )
    assert u.status_code == 200, u.text
    # the exact state from before the return, figure for figure
    after = _state(owner, db, [cust, sup], [dev])
    for k in ("books", "cash", "khata", "devices"):
        assert after[k] == sold[k], k
    assert _profit(owner) == sold_profit
    # undone once: neither a second undo nor its preview
    assert owner.get(f"/api/v1/returns/{ret['id']}/void-preview").status_code == 409
    again = owner.post(
        f"/api/v1/returns/{ret['id']}/void",
        params={"preview_token": pv["token"]},
        json={"reason": "again"},
    )
    assert again.status_code == 409


def test_replace_preview(owner, db, cat):
    sup, cust = _supplier(owner), _customer(owner)
    dev = _buy(owner, cat, sup, [A])["lines"][0]["device_id"]
    inv = _sell(owner, cust, [dev])
    first = _sale_return(owner, inv, refund_amount=68000, kept_amount=2000).json()
    fixed = {
        "reason": "typed the wrong amount",
        "sale": {
            "invoice_id": inv["id"],
            "line_ids": [inv["lines"][0]["id"]],
            "settlement": "refund",
            "refund_amount": 69000,
            "kept_amount": 1000,
        },
    }
    before = _state(owner, db, [cust, sup], [dev])
    r = owner.post(f"/api/v1/returns/{first['id']}/replace/preview", json=fixed)
    assert r.status_code == 200, r.text
    pv = r.json()
    # the two together: 68,000 comes back in, 69,000 goes out; the cut drops from 2,000 to 1,000
    assert pv["replaces"] is True and pv["original"]["no"] == first["no"]
    assert pv["cash_total"] == "-1000.00" and pv["profit"] == "-1000.00"
    assert pv["stock_count"] == 0 and pv["refund"] == "69000.00" and pv["balanced"] is True
    assert _state(owner, db, [cust, sup], [dev]) == before
    ok = owner.post(
        f"/api/v1/returns/{first['id']}/replace", json={**fixed, "preview_token": pv["token"]}
    )
    assert ok.status_code == 201, ok.text
    assert before["cash"] - _cash(owner) == 1000


def test_the_books_reconcile_after_returns(owner, other_owner, db, cat):
    """F: balanced journals, consistent IMEI states, no double count, original cost, balances that
    agree with the ledger, and undone returns out of the totals but still on record."""
    sup, cust = _supplier(owner), _customer(owner)
    p = _buy(owner, cat, sup, [A, B, C, D], paid=200000)
    d1, d2, d3, d4 = (ln["device_id"] for ln in p["lines"])
    inv = _sell(owner, cust, [d1, d2, d3], paid=150000)  # 60,000 on udhaar
    l1, l2, l3 = (ln["id"] for ln in inv["lines"])
    r1 = _sale_return(owner, inv, lines=[l1], refund_amount=8000, kept_amount=2000).json()
    r2 = _sale_return(owner, inv, lines=[l2], item_condition="damaged").json()
    wrong = _sale_return(owner, inv, lines=[l3]).json()
    assert (
        owner.post(
            f"/api/v1/returns/{wrong['id']}/void", json={"reason": "wrong phone"}
        ).status_code
        == 200
    )
    back = owner.post(
        "/api/v1/returns/purchase",
        json={"purchase_id": p["id"], "line_ids": [p["lines"][3]["id"]], "cut_amount": 1000},
    )
    assert back.status_code == 201, back.text
    db.expire_all()
    shop_id = uuid.UUID(str(owner.shop_id))

    # 1. every journal is balanced
    for gid, debit, credit in db.execute(
        select(LedgerEntry.group_id, func.sum(LedgerEntry.debit), func.sum(LedgerEntry.credit))
        .where(LedgerEntry.shop_id == shop_id)
        .group_by(LedgerEntry.group_id)
    ).all():
        assert debit == credit, gid
    assert _books(owner)  # and the trial balance agrees

    # 2. every phone's status is what its last movement says
    devices = db.scalars(select(Device).where(Device.shop_id == shop_id)).all()
    assert len(devices) == 4  # 3. a returned phone is the same row, never a second one
    for d in devices:
        last = max(d.events, key=lambda e: e.seq)
        assert d.status == last.status_after, d.imei1
        # its movements are numbered one after another, with no gap and no repeat
        seqs = sorted(e.seq for e in d.events)
        assert seqs == list(range(seqs[0], seqs[0] + len(seqs)))
    status = {str(d.id): d.status for d in devices}
    assert status == {d1: "in_stock", d2: "faulty", d3: "sold", d4: "returned_to_supplier"}

    # 4. stock at cost = the phones in the shop at what they were bought for
    in_shop = [d for d in devices if d.status in ("in_stock", "faulty")]
    assert _stock_at_cost(owner) == sum(d.cost_price for d in in_shop) == 130000
    stock = owner.get("/api/v1/reports/stock-summary").json()
    assert stock["count"] == 2 and Decimal(stock["value"]) == 130000

    # 6. each khata is the sum of its ledger lines
    for party in (sup, cust):
        ledger = db.scalar(
            select(func.coalesce(func.sum(LedgerEntry.debit - LedgerEntry.credit), 0)).where(
                LedgerEntry.shop_id == shop_id, LedgerEntry.party_id == uuid.UUID(party["id"])
            )
        )
        cached = db.get(Party, uuid.UUID(party["id"])).balance
        assert Decimal(str(ledger)) == cached == _khata(owner, party)

    # 7. the galla is the sum of its ledger lines
    acct = owner.get("/api/v1/ledger/accounts").json()[0]
    moved = db.scalar(
        select(func.coalesce(func.sum(LedgerEntry.debit - LedgerEntry.credit), 0)).where(
            LedgerEntry.shop_id == shop_id, LedgerEntry.cash_account_id == uuid.UUID(acct["id"])
        )
    )
    assert Decimal(str(moved)) == Decimal(acct["balance"])

    # 8. profit: one sale stands (5,000), the cut kept (2,000), the supplier's cut lost (1,000)
    assert _profit(owner) == 5000 + 2000 - 1000

    # 9. the undone return is out of the totals but still on record, with its reversal linked
    rep = owner.get("/api/v1/returns/report").json()
    assert rep["sale"]["totals"]["count"] == 2 and rep["sale"]["totals"]["voided"] == 1
    assert {x["no"] for x in rep["sale"]["rows"]} == {r1["no"], r2["no"]}
    kept = owner.get(f"/api/v1/returns/{wrong['id']}").json()
    assert kept["status"] == "voided" and kept["void_reason"] == "wrong phone"
    g = db.get(LedgerGroup, uuid.UUID(kept["ledger_group_id"]))
    assert g.reversed_by_group_id is not None
    assert db.get(LedgerGroup, g.reversed_by_group_id).reverses_group_id == g.id

    # another shop has none of it
    assert other_owner.get("/api/v1/returns/report").json()["sale"]["totals"]["count"] == 0
    preview = other_owner.post(
        "/api/v1/returns/sale/preview", json={"invoice_id": inv["id"], "line_ids": [l3]}
    )
    assert preview.status_code == 404
    assert other_owner.get(f"/api/v1/returns/{r1['id']}/void-preview").status_code == 404
