"""Owner 2026-11-12 (ADR-066): a faulty phone says what is wrong (common faults or the shop's own
words), stays in the stock list and can be sold as it is; the bill says it was sold as faulty."""

from tests.test_devices import _stock
from tests.test_reports_owner import A, B


def _faulty(owner, dev, faults, note=None):
    r = owner.post(
        f"/api/v1/devices/{dev}/events",
        json={"type": "marked_faulty", "note": note, "data": {"faults": faults}},
    )
    assert r.status_code == 201, r.text
    return r.json()


def test_faults_listed_kept_and_sold(owner, cat):
    d = _stock(owner, cat, imei=A, condition="box_pack", cost_price=500, asking_price=1000)
    ok = _stock(owner, cat, imei=B, condition="box_pack", cost_price=500, asking_price=1000)
    opts = owner.get("/api/v1/devices/options").json()["faults"]
    assert "camera" in opts and "lcd" in opts and "dots" in opts

    out = _faulty(owner, d["id"], ["camera", "lcd", " Hinge loose ", "camera"])
    assert out["status"] == "faulty"
    assert out["faults"] == ["camera", "lcd", "Hinge loose"]
    # the shop's own word comes back as an option
    assert "Hinge loose" in owner.get("/api/v1/devices/options").json()["faults"]
    # the faults can be changed while it is faulty
    assert _faulty(owner, d["id"], ["board"])["faults"] == ["board"]

    # in the stock list with in-stock phones (with_faulty), not in plain in_stock
    ids = lambda qs: [x["id"] for x in owner.get(f"/api/v1/devices?{qs}").json()]
    assert d["id"] in ids("status=in_stock&with_faulty=true")
    assert ok["id"] in ids("status=in_stock&with_faulty=true")
    assert d["id"] not in ids("status=in_stock")

    # sold as it is; the bill says so
    r = owner.post(
        "/api/v1/sales", json={"devices": [{"device_id": d["id"], "price": 700}], "paid": 700}
    )
    assert r.status_code == 201, r.text
    html = owner.get(f"/api/v1/sales/{r.json()['id']}/receipt?lang=en").text
    assert "Sold as faulty: Board" in html


def test_cleared_fault_forgets_the_faults(owner, cat):
    d = _stock(owner, cat, imei=A, condition="box_pack", cost_price=500, asking_price=1000)
    _faulty(owner, d["id"], ["battery"])
    r = owner.post(f"/api/v1/devices/{d['id']}/events", json={"type": "faulty_cleared"})
    assert r.status_code == 201, r.text
    assert r.json()["status"] == "in_stock" and r.json()["faults"] is None


def test_faulty_when_added(owner, cat):
    """owner 2026-11-13: a phone that comes in faulty is marked so while adding it (purchase or old
    stock); one without faults comes in as before"""
    from tests.test_purchases import _dev, _party

    sup = _party(owner, name="Fault Dealer", phone="03007773333")
    r = owner.post(
        "/api/v1/purchases",
        json={
            "kind": "supplier",
            "party_id": sup["id"],
            "devices": [
                {"device": {**_dev(cat, A), "faults": ["lcd", "Hinge loose"]}, "cost": 800},
                {"device": _dev(cat, B), "cost": 900},
            ],
        },
    )
    assert r.status_code == 201, r.text
    first, second = (
        owner.get(f"/api/v1/devices/{ln['device_id']}").json() for ln in r.json()["lines"]
    )
    assert first["status"] == "faulty" and first["faults"] == ["lcd", "Hinge loose"]
    assert second["status"] == "in_stock" and second["faults"] is None
    hist = [e["type"] for e in owner.get(f"/api/v1/devices/{first['id']}/history").json()]
    assert hist[:2] == ["purchased", "marked_faulty"] or hist[-2:] == ["purchased", "marked_faulty"]
