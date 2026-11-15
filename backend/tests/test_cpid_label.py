"""Owner 2026-11-15 (ADR-083): CP ID phones are no longer allowed in Pakistan, but shops still hold
and trade them. In its reports a shop may show its own name or mark instead of "CP ID"."""

from tests.test_devices import _stock
from tests.test_reports_owner import A, B


def _two(owner, cat):
    _stock(owner, cat, imei=A, pta_status="cpid", asking_price=9000)
    _stock(owner, cat, imei=B, pta_status="pta_approved", asking_price=8000)


def test_default_stays_cp_id(owner, cat):
    _two(owner, cat)
    assert "CP ID" in owner.get("/api/v1/exports/stock-tally?format=pdf&lang=en").text
    csv = owner.get("/api/v1/exports/stock?format=csv&status=all&cols=name,imei,pta").text
    assert "CP ID" in csv and "pta_approved" in csv  # other values unchanged


def test_shop_mark_replaces_cp_id_everywhere(owner, cat):
    _two(owner, cat)
    r = owner.patch(
        "/api/v1/shops/current",
        json={
            "device_prefs": {
                "require_lock_check": False,
                "grades": ["a", "b"],
                "cpid_label": "★ Special",
            }
        },
    )
    assert r.status_code == 200, r.text
    assert r.json()["device_prefs"]["cpid_label"] == "★ Special"

    tally = owner.get("/api/v1/exports/stock-tally?format=pdf&lang=en").text
    assert "★ Special" in tally and "CP ID" not in tally
    sheet = owner.get("/api/v1/exports/stock?format=pdf&lang=en&status=all&cols=name,imei,pta").text
    assert "★ Special" in sheet and "CP ID" not in sheet
    csv = owner.get("/api/v1/exports/stock?format=csv&status=all&cols=name,imei,pta").text
    assert "★ Special" in csv and "cpid" not in csv
    plain = owner.get("/api/v1/exports/stock?format=csv&status=all").text
    assert "★ Special" in plain
    staff = owner.get("/api/v1/exports/stock?format=pdf&lang=en&copy=staff&status=all").text
    assert "★ Special" in staff and "CP ID" not in staff
    xlsx = owner.get("/api/v1/exports/stock-tally?format=xlsx")
    assert xlsx.status_code == 200

    # back to the default: an empty name
    owner.patch("/api/v1/shops/current", json={"device_prefs": {"cpid_label": ""}})
    assert "CP ID" in owner.get("/api/v1/exports/stock-tally?format=pdf&lang=en").text
