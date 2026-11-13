"""Owner 2026-11-13 (ADR-070): a phone's SIM (carrier) lock — unlocked, or locked with the network.
Information only: a SIM-locked phone is still sold; the field is kept, edited and exported."""

from tests.test_devices import _stock
from tests.test_reports_owner import A


def test_sim_lock_saved_edited_exported_and_sellable(owner, cat):
    d = _stock(
        owner,
        cat,
        imei=A,
        condition="box_pack",
        cost_price=500,
        asking_price=1000,
        sim_lock="locked",
        sim_lock_carrier="AT&T",
    )
    assert d["sim_lock"] == "locked" and d["sim_lock_carrier"] == "AT&T"
    assert (
        owner.post("/api/v1/devices/opening-stock", json={"sim_lock": "maybe"}).status_code == 422
    )
    r = owner.patch(f"/api/v1/devices/{d['id']}", json={"sim_lock_carrier": "T-Mobile"})
    assert r.status_code == 200, r.text
    assert r.json()["sim_lock_carrier"] == "T-Mobile"
    csv = owner.get("/api/v1/exports/stock.csv?cols=name,simlock").text
    assert "SIM lock" in csv and "Locked T-Mobile" in csv
    sale = owner.post(
        "/api/v1/sales", json={"devices": [{"device_id": d["id"], "price": 1000}], "paid": 1000}
    )
    assert sale.status_code == 201, sale.text
