"""ADR-144 (shopkeepers 2026-11-26): every report takes the reader's choices — which columns to leave
out, cost and profit hidden — and every A4 report page keeps a row whole across pages."""

import csv
import io

from app.modules.exports import frame, options
from tests.test_devices import _stock as _add
from tests.test_reports_owner import A


def _rows(text: str) -> list[list[str]]:
    return list(csv.reader(io.StringIO(text.lstrip("﻿"))))


def _stock(owner, cat):
    _add(owner, cat, imei=A, pta_status="pta_approved", asking_price=26000)


def test_columns_are_listed_and_left_out(owner, cat):
    _stock(owner, cat)
    base = "/api/v1/exports/stock?status=all&cols=name,imei,cost,asking&lang=en"
    head = _rows(owner.get(f"{base}&format=csv").text)[0]
    assert "Cost" in head and "Asking price" in head

    f = owner.get(f"{base}&format=csv&rcols=1").json()["fields"]
    assert [x["label"] for x in f] == head
    assert [x["label"] for x in f if x["cost"]] == ["Cost"]

    # leave one column out by its number: the file, the Excel and the page all follow
    gone = next(x["i"] for x in f if x["label"] == "Asking price")
    cut = _rows(owner.get(f"{base}&format=csv&rhide={gone}").text)
    assert cut[0] == [h for h in head if h != "Asking price"]
    assert all(len(r) == len(cut[0]) for r in cut)
    people = "/api/v1/exports/parties?lang=en&format=pdf"
    pf = owner.get(f"{people}&rcols=1").json()["fields"]
    phone = next(x["i"] for x in pf if x["label"] == "Phone")
    assert "<th>Phone</th>" in owner.get(people).text
    assert "<th>Phone</th>" not in owner.get(f"{people}&rhide={phone}").text
    assert owner.get(f"{base}&format=xlsx&rhide={gone}").status_code == 200

    # cost and profit hidden in one go
    assert "Cost" not in _rows(owner.get(f"{base}&format=csv&rnocost=1").text)[0]
    sold = "/api/v1/bills-hub/sales/sheet?lang=en&format=pdf"
    assert "Profit" in owner.get(sold).text
    assert "Profit" not in owner.get(f"{sold}&rnocost=1").text

    # every column left out: the report still has its first one
    every = ",".join(str(x["i"]) for x in f)
    assert len(_rows(owner.get(f"{base}&format=csv&rhide={every}").text)[0]) == 1


def test_urdu_cost_words_and_no_leak_between_requests(owner, cat):
    _stock(owner, cat)
    base = "/api/v1/exports/stock?status=all&cols=name,cost&format=csv"
    assert _rows(owner.get(f"{base}&lang=ur&rnocost=1").text)[0] == ["ڈیوائس"]
    # the next request, without the choice, has its column back
    assert "Cost" in _rows(owner.get(f"{base}&lang=en").text)[0]
    assert options.is_cost("Profit") and options.is_cost("منافع") and not options.is_cost("Price")


def test_report_pages_share_the_look_and_keep_rows_whole(owner, cat):
    _stock(owner, cat)
    pages = [
        owner.get("/api/v1/exports/sales?format=pdf").text,
        owner.get("/api/v1/exports/parties?format=pdf").text,
        owner.get("/api/v1/exports/profit-loss?format=pdf").text,
        owner.get("/api/v1/bills-hub/bills/sheet?format=pdf").text,
    ]
    for p in pages:
        assert frame.PRINT_SAFE in p  # the head repeats, a row is never split
        assert 'class="top"' in p and 'class="sign"' in p  # title bar and signature line
        assert 'class="ph"' in p  # the shop's own header, as on its bills
    party = owner.post("/api/v1/parties", json={"name": "Aslam", "kinds": ["customer"]}).json()
    khata = owner.get(f"/api/v1/parties/{party['id']}/khata-report").text
    assert frame.PRINT_SAFE in khata


def test_totals_period_and_words_for_the_accountant(owner, cat):
    """ADR-145: a printed report says its dates, adds up its money columns and prints words"""
    from decimal import Decimal

    from app.modules.exports import a4

    head = ["Invoice", "Date", "Total", "Paid", "Qty", "Days in stock", "Status"]
    rows = [
        ["INV-1", "2026-11-01", Decimal(100), Decimal(40), 2, 9, "partially_paid"],
        ["INV-2", "2026-11-02", Decimal("50.50"), Decimal("50.50"), 1, 3, "paid"],
    ]
    tot = a4.totals(head, rows)
    assert tot == [None, None, Decimal("150.50"), Decimal("90.50"), Decimal(3), None, None]
    assert a4.totals(head, rows[:1]) is None  # one row needs no total
    # a running balance beside debit / credit is never added up
    led = a4.totals(
        ["Date", "Debit", "Credit", "Balance"],
        [["a", Decimal(5), Decimal(0), Decimal(5)], ["b", Decimal(0), Decimal(2), Decimal(3)]],
    )
    assert led == [None, Decimal(5), Decimal(2), None]
    table = a4._table(head, rows, "Total")
    assert 'class="tot"' in table and "150.50" in table and "Partially paid" in table
    assert "partially_paid" not in table

    _stock(owner, cat)
    page = owner.get(
        "/api/v1/exports/sales?format=pdf&lang=en&date_from=2026-11-01&date_to=2026-11-30"
    ).text
    assert "01-11-2026 → 30-11-2026" in page
    assert "counter(page)" in page  # page numbers when printed
    # the files stay plain data: no total row in the CSV
    csv_rows = _rows(owner.get("/api/v1/exports/parties?format=csv&lang=en").text)
    assert all(r and r[0] != "Total" for r in csv_rows)
