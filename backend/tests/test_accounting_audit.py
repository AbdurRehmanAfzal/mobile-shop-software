"""Accounting audit (owner 2026-11-05, ADR-048): the stock on the ledger always equals the stock in
the shop, nothing goes below zero, and every cost reaches the profit reports.

The rule checked after each flow: the ledger's item stock (inventory lines that are not a phone's)
equals the value of the items' open batches."""

import uuid
from decimal import Decimal

from sqlalchemy import func, select

from app.modules.accessories.models import AccessoryBatch
from app.modules.expenses.service import seed_categories
from app.modules.ledger import corrections
from app.modules.ledger.models import LedgerEntry
from app.modules.ledger.service import Posting, post
from tests.test_purchases import _party


def _item_stock_on_ledger(db, shop_id) -> Decimal:
    v = db.scalar(
        select(func.coalesce(func.sum(LedgerEntry.debit - LedgerEntry.credit), 0)).where(
            LedgerEntry.shop_id == uuid.UUID(shop_id),
            LedgerEntry.account == "inventory",
            LedgerEntry.device_id.is_(None),
        )
    )
    return Decimal(v or 0).quantize(Decimal("0.01"))


def _batches(db, shop_id) -> Decimal:
    v = db.scalar(
        select(
            func.coalesce(func.sum(AccessoryBatch.qty_left * AccessoryBatch.unit_cost), 0)
        ).where(AccessoryBatch.shop_id == uuid.UUID(shop_id))
    )
    return Decimal(v or 0).quantize(Decimal("0.01"))


def _same(db, owner):
    db.expire_all()
    assert _item_stock_on_ledger(db, owner.shop_id) == _batches(db, owner.shop_id)
    assert _item_stock_on_ledger(db, owner.shop_id) >= 0


def _item(owner, name, qty, cost):
    r = owner.post(
        "/api/v1/accessories",
        json={
            "name": name,
            "category": "charger",
            "price": 500,
            "opening_qty": qty,
            "opening_cost": cost,
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


def test_typed_sale_item_never_touches_stock(db, owner):
    # owner's case: a charger typed on the bill (not from stock) with its buying price
    c = _party(owner, name="Ahmed", phone="03219876543", kinds=("customer",))
    inv = owner.post(
        "/api/v1/sales",
        json={
            "party_id": c["id"],
            "misc": [{"description": "Charger", "qty": 1, "unit_price": 300, "cost": 150}],
            "paid": 300,
        },
    ).json()
    assert inv["profit"] == "150.00"
    _same(db, owner)  # stock stays 0, not −150
    bs = owner.get("/api/v1/reports/balance-sheet").json()
    assert (
        bs["balanced"]
        and next((x["amount"] for x in bs["assets"] if x["key"] == "inventory"), "0.00") == "0.00"
    )
    assert owner.get("/api/v1/reports/profit-loss").json()["gross_profit"] == "150.00"
    # the customer brings it back: still nothing in stock
    r = owner.post(
        "/api/v1/returns/sale",
        json={"invoice_id": inv["id"], "line_ids": [inv["lines"][0]["id"]], "settlement": "refund"},
    )
    assert r.status_code == 201, r.text
    _same(db, owner)
    # and a void of another such sale
    inv2 = owner.post(
        "/api/v1/sales",
        json={
            "misc": [{"description": "Cover", "qty": 1, "unit_price": 200, "cost": 80}],
            "paid": 200,
        },
    ).json()
    owner.post(f"/api/v1/sales/{inv2['id']}/void", json={"reason": "typed twice"})
    _same(db, owner)


def test_supplier_return_of_a_stock_item_leaves_stock(db, owner):
    owner.patch("/api/v1/shops/current", json={"item_prefs": {"valuation": "fifo"}})
    sup = _party(owner)
    a = _item(owner, "Fast charger", 2, 100)
    pur = owner.post(
        "/api/v1/purchases",
        json={
            "kind": "supplier",
            "party_id": sup["id"],
            "misc": [
                {"description": "Fast charger", "qty": 3, "unit_cost": 200, "accessory_id": a["id"]}
            ],
        },
    ).json()
    _same(db, owner)
    r = owner.post(
        "/api/v1/returns/purchase",
        json={"purchase_id": pur["id"], "line_ids": [pur["lines"][0]["id"]]},
    )
    assert r.status_code == 201, r.text
    assert owner.get(f"/api/v1/accessories/{a['id']}").json()["qty"] == 2
    _same(db, owner)  # was off by the return before the fix
    bs = owner.get("/api/v1/reports/balance-sheet").json()
    assert bs["balanced"]


def test_repair_part_costs_what_left_the_stock(db, owner):
    owner.patch("/api/v1/shops/current", json={"item_prefs": {"valuation": "fifo"}})
    sup = _party(owner)
    c = _party(owner, name="Ahmed", phone="03219876543", kinds=("customer",))
    a = _item(owner, "LCD A54", 1, 3000)
    owner.post(
        "/api/v1/purchases",
        json={
            "kind": "supplier",
            "party_id": sup["id"],
            "misc": [
                {"description": "LCD A54", "qty": 1, "unit_cost": 4000, "accessory_id": a["id"]}
            ],
        },
    )
    j = owner.post(
        "/api/v1/repairs",
        json={"party_id": c["id"], "device_desc": "Samsung A54", "fault_codes": ["screen"]},
    ).json()
    owner.put(
        f"/api/v1/repairs/{j['id']}/parts",
        json=[{"description": "LCD A54", "accessory_id": a["id"], "qty": 1, "unit_price": 6000}],
    )
    owner.post(f"/api/v1/repairs/{j['id']}/status", json={"status": "repaired"})
    r = owner.post(f"/api/v1/repairs/{j['id']}/deliver", json={"paid": 6000})
    assert r.status_code == 200, r.text
    assert (
        r.json()["parts"][0]["unit_cost"] == "3000.00"
    )  # the oldest piece (FIFO), not the average 3,500
    _same(db, owner)


def test_dealer_bill_other_item_is_spending_in_profit(db, owner):
    seed_categories(db)
    sup = _party(owner)
    r = owner.post(
        "/api/v1/purchases",
        json={
            "kind": "supplier",
            "party_id": sup["id"],
            "misc": [{"description": "Display stand", "qty": 1, "unit_cost": 1500}],
        },
    )
    assert r.status_code == 201, r.text
    pnl = owner.get("/api/v1/reports/profit-loss").json()
    assert pnl["expenses"].get("other_purchases") == "1500.00" and pnl["net_profit"] == "-1500.00"
    cats = {c["key"]: c["name"] for c in owner.get("/api/v1/expenses/categories").json()}
    assert cats["other_purchases"] == "Items bought, not in stock"
    bs = owner.get("/api/v1/reports/balance-sheet").json()
    assert (
        bs["balanced"]
        and next(x["amount"] for x in bs["owner"] if x["key"] == "profit") == "-1500.00"
    )


def test_corrections_fix_old_postings_once(db, owner):
    """Old postings (before the fix): a typed item's cost taken out of stock, and money on the old
    `purchases` account. The correction runs once, dated like the original."""
    sid = uuid.UUID(owner.shop_id)
    inv = owner.post(
        "/api/v1/sales",
        json={
            "misc": [{"description": "Charger", "qty": 1, "unit_price": 300, "cost": 150}],
            "paid": 300,
        },
    ).json()
    # what the old code posted on the sale: cost out of stock instead of the owner's goods
    legacy = Posting(document_type="invoice", document_id=uuid.UUID(inv["id"]), memo="legacy")
    legacy.debit("equity", Decimal(150)).credit("inventory", Decimal(150))
    post(db, sid, None, legacy)
    old = Posting(document_type="purchase", memo="legacy other item")
    old.debit("purchases", Decimal(500), memo="Bags").credit("equity", Decimal(500))
    post(db, sid, None, old)
    db.commit()
    assert _item_stock_on_ledger(db, owner.shop_id) == Decimal("-150.00")

    first = corrections.run(db)
    assert first == {"typed_sale_items": 1, "purchases_account": 1}
    assert _item_stock_on_ledger(db, owner.shop_id) == Decimal("0.00")
    pnl = owner.get("/api/v1/reports/profit-loss", params={"date_from": "2000-01-01"}).json()
    assert pnl["expenses"].get("other_purchases") == "500.00"
    # again: nothing more
    assert corrections.run(db) == {"typed_sale_items": 0, "purchases_account": 0}
    assert owner.get("/api/v1/reports/balance-sheet").json()["balanced"]


def test_opening_balance_can_be_set_later(client, owner):
    """The galla made with the shop starts at 0; a payment out of it shows it below zero until the
    owner sets the money that was really in it on the first day."""
    from tests.conftest import login

    galla = owner.get("/api/v1/ledger/accounts").json()[0]
    sup = _party(owner)
    owner.post("/api/v1/payments", json={"party_id": sup["id"], "direction": "out", "amount": 2000})
    assert owner.get("/api/v1/ledger/accounts").json()[0]["balance"] == "-2000.00"
    r = owner.patch(f"/api/v1/ledger/accounts/{galla['id']}", json={"opening_balance": 10000})
    assert r.status_code == 200, r.text
    assert r.json()["balance"] == "8000.00"
    bs = owner.get("/api/v1/reports/balance-sheet").json()
    assert bs["balanced"]
    # only the owner
    owner.post(
        "/api/v1/staff",
        json={"name": "Mgr", "phone": "03451112266", "password": "secret123", "role": "manager"},
    )
    assert (
        login(client, "03451112266")
        .patch(f"/api/v1/ledger/accounts/{galla['id']}", json={"opening_balance": 1})
        .status_code
        == 403
    )
    assert (
        owner.patch(
            f"/api/v1/ledger/accounts/{galla['id']}", json={"opening_balance": -5}
        ).status_code
        == 422
    )
