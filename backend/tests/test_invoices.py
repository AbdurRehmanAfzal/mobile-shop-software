"""Owner (2026-10-27): every bill in one place — find it by number, name, phone or IMEI, filter by
date and by what is still due."""

from tests.test_reports_owner import A, B, C, _salesman
from tests.test_returns import _customer, _sell


def _rows(actor, **params):
    r = actor.get("/api/v1/invoices", params=params)
    assert r.status_code == 200, r.text
    return r.json()


def test_all_bills_in_one_list(client, owner, cat):
    c = _customer(owner)
    _, cash = _sell(owner, cat, c, A, 1000, 1000)
    _, udhaar = _sell(owner, cat, c, B, 2000, 500)
    _, back = _sell(owner, cat, c, C, 3000, 3000)
    ret = owner.post(
        "/api/v1/returns/sale",
        json={
            "invoice_id": back["id"],
            "line_ids": [back["lines"][0]["id"]],
            "settlement": "refund",
        },
    )
    assert ret.status_code == 201, ret.text
    job = owner.post(
        "/api/v1/repairs",
        json={"party_id": c["id"], "device_desc": "Samsung A54 black", "imei": A, "estimate": 6000},
    ).json()

    out = _rows(owner)
    kinds = sorted(r["kind"] for r in out["rows"])
    assert kinds == ["repair", "sale", "sale", "sale", "sale_return"]
    by_no = {r["no"]: r for r in out["rows"]}
    assert by_no[cash["no"]]["state"] == "paid"
    assert by_no[udhaar["no"]]["state"] == "due" and by_no[udhaar["no"]]["due"] == "1500.00"
    assert by_no[back["no"]]["state"] == "returned"
    r = next(r for r in out["rows"] if r["kind"] == "sale_return")
    assert r["ref_id"] == back["id"] and r["ref_no"] == back["no"]
    assert by_no[job["no"]]["state"] == "open" and by_no[job["no"]]["items"]
    assert out["to_get"] == "1500.00"

    # find by bill number, by the customer's phone, by a phone's IMEI (sale + its repair)
    assert [x["no"] for x in _rows(owner, q=udhaar["no"])["rows"]] == [udhaar["no"]]
    assert len(_rows(owner, q=c["phone"][-7:])["rows"]) == 5
    assert sorted(x["kind"] for x in _rows(owner, q=A[-6:])["rows"]) == ["repair", "sale"]
    # filters
    assert [x["no"] for x in _rows(owner, state="due")["rows"]] == [udhaar["no"]]
    assert {x["kind"] for x in _rows(owner, kind="repair")["rows"]} == {"repair"}
    assert _rows(owner, date_from="2000-01-01", date_to="2000-01-02")["rows"] == []
    bad = owner.get("/api/v1/invoices", params={"date_from": "2026-10-10", "date_to": "2026-10-01"})
    assert bad.status_code == 422


def test_salesman_does_not_see_purchases_and_shops_do_not_mix(client, owner, other_owner, cat):
    from tests.test_purchases import _party

    sup = _party(owner, name="Dealer One", phone="03005556666", kinds=("supplier",))
    p = owner.post(
        "/api/v1/purchases",
        json={
            "kind": "supplier",
            "party_id": sup["id"],
            "devices": [
                {
                    "device": {
                        "imei1": A,
                        "brand_id": cat["brand"]["id"],
                        "model_id": cat["model"]["id"],
                        "condition": "box_pack",
                        "pta_status": "pta_approved",
                    },
                    "cost": 1000,
                }
            ],
            "paid": 400,
        },
    ).json()
    rows = _rows(owner)["rows"]
    assert rows[0]["kind"] == "purchase" and rows[0]["state"] == "due" and rows[0]["items"]
    assert _rows(owner)["to_give"] == "600.00"
    s = _salesman(client, owner)
    assert _rows(s)["rows"] == []
    assert _rows(other_owner, q=p["no"])["rows"] == []
