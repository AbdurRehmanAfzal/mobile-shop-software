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
