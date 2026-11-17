"""Owner 2026-11-18 (ADR-103): the account ledger of one person and the stock sheet with cost,
item wise — the two printouts a shopkeeper sent from his old software."""

import csv
import datetime as dt
import io

from app.core.clock import today as shop_today
from tests.conftest import login
from tests.test_purchases import _dev, _party

IMEIS = ["490154203237518", "356938035643809", "352099001761481", "353918057929438"]


def _csv(r) -> list[list[str]]:
    assert r.status_code == 200, r.text
    return list(csv.reader(io.StringIO(r.content.decode("utf-8-sig"))))


def _pay(owner, party, amount, **kw):
    r = owner.post(
        "/api/v1/payments",
        json={"party_id": party["id"], "direction": "out", "amount": amount, **kw},
    )
    assert r.status_code == 201, r.text
    return r.json()


def _buy(owner, cat, party, items, paid=0):
    r = owner.post(
        "/api/v1/purchases",
        json={
            "kind": "supplier",
            "party_id": party["id"],
            "devices": [
                {
                    "device": _dev(cat, imei, storage_id=cat["storage"]["id"], ram_gb=12),
                    "cost": cost,
                    "asking_price": cost + 5000,
                }
                for imei, cost in items
            ],
            "paid": paid,
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


def test_account_ledger_like_the_shopkeepers_printout(owner, other_owner, cat):
    raheel = _party(owner, name="Raheel Naseer", phone="03110111550", kinds=("supplier",))
    # the printout: paid 230,000 first, then goods for 699,000; paid 58,000, goods 58,000; paid 30,000
    p1 = _pay(owner, raheel, 230000, reference="UBL clear")
    b1 = _buy(owner, cat, raheel, [(IMEIS[0], 90000), (IMEIS[1], 70000), (IMEIS[2], 70000)])
    _pay(owner, raheel, 58000)
    b2 = _buy(owner, cat, raheel, [(IMEIS[3], 58000)])
    _pay(owner, raheel, 30000)

    rows = _csv(
        owner.get(f"/api/v1/exports/parties/{raheel['id']}/ledger", params={"format": "csv"})
    )
    assert rows[0] == ["Date", "Type", "No.", "Particulars", "Debit", "Credit", "Balance"]
    assert rows[1][1] == "Opening balance" and rows[1][-1] == "0.00"
    body = rows[2:-3]
    today = shop_today().isoformat()
    assert [(r[1], r[4], r[5], r[6]) for r in body] == [
        ("Payment", "230000.00", "", "230000.00"),
        ("Purchase", "", "230000.00", "0.00"),
        ("Payment", "58000.00", "", "58000.00"),
        ("Purchase", "", "58000.00", "0.00"),
        ("Payment", "30000.00", "", "30000.00"),
    ]
    assert all(r[0] == today for r in body)
    assert body[0][2] == p1["no"] and body[1][2] == b1["no"] and body[3][2] == b2["no"]
    # the bill's line says what was on it
    model = f"{cat['brand']['name']} {cat['model']['name']}"
    assert f"{model} 12/" in body[1][3] and "— 1 @ 90,000 = 90,000" in body[1][3]
    assert body[1][3].count("— 1 @ 70,000 = 70,000") == 2
    assert "UBL clear" in body[0][3]
    assert rows[-3][1] == "Total debit in the period" and rows[-3][4] == "318000.00"
    assert rows[-2][1] == "Total credit in the period" and rows[-2][5] == "288000.00"
    khata = owner.get(f"/api/v1/parties/{raheel['id']}").json()["balance"]
    assert rows[-1][1] == "Closing balance" and rows[-1][-1] == khata == "30000.00"

    # the printed page: the shop's header, the items, the balance in words, a minus sign for "we owe"
    page = owner.get(f"/api/v1/exports/parties/{raheel['id']}/ledger").text
    assert "Account Ledger" in page and "Raheel Naseer" in page and "03110111550" in page
    assert "— 1 @ 90,000 = 90,000" in page and "Raheel Naseer has to pay the shop" in page
    ur = owner.get(f"/api/v1/exports/parties/{raheel['id']}/ledger", params={"lang": "ur"}).text
    assert 'dir="rtl"' in ur and "اکاؤنٹ لیجر" in ur and "خریداری" in ur
    xlsx = owner.get(f"/api/v1/exports/parties/{raheel['id']}/ledger", params={"format": "xlsx"})
    assert xlsx.status_code == 200 and xlsx.content[:2] == b"PK"

    # a period: what came before it is the opening balance
    tomorrow = (shop_today() + dt.timedelta(days=1)).isoformat()
    later = _csv(
        owner.get(
            f"/api/v1/exports/parties/{raheel['id']}/ledger",
            params={"format": "csv", "date_from": tomorrow},
        )
    )
    assert later[1][-1] == "30000.00" and later[-1][-1] == "30000.00" and len(later) == 5

    # a deleted bill and its reversal are both left out; the closing balance stays the real one
    assert (
        owner.post(f"/api/v1/purchases/{b2['id']}/void", json={"reason": "wrong bill"}).status_code
        == 200
    )
    after = _csv(
        owner.get(f"/api/v1/exports/parties/{raheel['id']}/ledger", params={"format": "csv"})
    )
    assert [r[1] for r in after[2:-3]] == ["Payment", "Purchase", "Payment", "Payment"]
    assert after[-1][-1] == owner.get(f"/api/v1/parties/{raheel['id']}").json()["balance"]
    assert after[-1][-1] == "88000.00"

    # another shop cannot read it
    theirs = other_owner.get(f"/api/v1/exports/parties/{raheel['id']}/ledger")
    assert theirs.status_code == 404


def test_stock_with_cost_item_wise(client, owner, other_owner, cat):
    sup = _party(owner, name="Hafeez Centre", phone="03005550001", kinds=("supplier",))
    _buy(owner, cat, sup, [(IMEIS[0], 67000), (IMEIS[1], 65000), (IMEIS[2], 69000)], paid=201000)
    rows = _csv(owner.get("/api/v1/exports/stock-cost", params={"format": "csv"}))
    assert rows[0] == ["Item", "Quantity", "Unit price", "Cost"]
    brand, model = cat["brand"]["name"], cat["model"]["name"]
    assert rows[1][0] == brand.upper()
    # three of the same model + memory: one line, quantity 3, the average of one, the cost
    assert rows[2][0].startswith(f"{brand} {model} 12/")
    assert rows[2][1:] == ["3", "67000.00", "201000.00"]
    assert rows[3] == [f"{brand} — Total", "3", "", "201000.00"]
    assert rows[4] == ["Grand total", "3", "", "201000.00"]
    # it agrees with the stock-worth report
    worth = owner.get("/api/v1/reports/stock-summary").json()
    assert worth["count"] == 3 and worth["value"] == "201000.00"

    page = owner.get("/api/v1/exports/stock-cost").text
    assert "Stock with Cost Price (Item Wise)" in page and "Grand total" in page
    assert "201,000" in page and ">3<" in page

    # a salesman gets the same sheet at asking price, never the cost
    owner.post(
        "/api/v1/staff",
        json={"name": "Sales", "phone": "03451112244", "password": "secret123", "role": "salesman"},
    )
    s = login(client, "03451112244")
    srows = _csv(s.get("/api/v1/exports/stock-cost", params={"format": "csv"}))
    assert srows[0] == ["Item", "Quantity", "Unit price", "Value"]
    assert srows[2][1:] == ["3", "72000.00", "216000.00"]
    assert "Stock with Selling Price" in s.get("/api/v1/exports/stock-cost").text
    # another shop has nothing in hand
    empty = _csv(other_owner.get("/api/v1/exports/stock-cost", params={"format": "csv"}))
    assert empty[-1] == ["Grand total", "0", "", "0.00"]
