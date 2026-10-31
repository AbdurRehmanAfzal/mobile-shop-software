"""Owner addendum 6 (docs/26 §G): tablets and smart watches as full devices — purchase with barcode,
history and ledger; the Addendum 1 scenario (buy from A, sell to B, partial payments) for a tablet
and a watch; duplicate serial warning; PTA only with a SIM; lock check required for used units;
reclassification and item → unit conversion keep history, barcode and balances; model library;
stock by type."""

from tests.test_purchases import _party


def _mk(owner, brand, model, category):
    """a brand + model through the API (seeded or the shop's own)"""
    b = next((x for x in owner.get("/api/v1/catalogue/brands").json() if x["name"] == brand), None)
    if b is None:
        b = owner.post("/api/v1/catalogue/brands", json={"name": brand}).json()
    ms = owner.get("/api/v1/catalogue/models", params={"brand_id": b["id"], "q": model}).json()
    m = next((x for x in ms if x["name"] == model), None)
    if m is None:
        m = owner.post("/api/v1/catalogue/models", json={"brand_id": b["id"], "name": model, "category": category}).json()
    return b, m

TAB_IMEI = "356938035643809"


def _buy(owner, sup, device, paid=0, **extra):
    r = owner.post(
        "/api/v1/purchases",
        json={"kind": "supplier", "party_id": sup["id"], "devices": [{"device": device, "cost": device.pop("_cost", 50000), "asking_price": device.pop("_asking", 60000)}], "paid": paid, **extra},
    )
    return r


def _tablet(owner, **extra):
    b, m = _mk(owner, "Samsung", "Galaxy Tab A9+", "tablet")
    return {"category": "tablet", "cellular": True, "imei1": TAB_IMEI, "brand_id": b["id"], "model_id": m["id"], "condition": "box_pack", "pta_status": "pta_approved", **extra}


def _watch(owner, **extra):
    b, m = _mk(owner, "Apple", "Watch Series 9", "watch")
    return {"category": "watch", "cellular": False, "serial": "H4KQ9X2LM1", "brand_id": b["id"], "model_id": m["id"], "condition": "used", "size_mm": 45, "battery_health": 92, "lock_checked": True, "lock_checks": {"activation": "cleared", "paired": "cleared"}, **extra}


def test_tablet_and_watch_bought_with_barcode_specs_history_and_ledger(owner, cat):
    sup = _party(owner)
    r = _buy(owner, sup, _tablet(owner, ram_gb=8, grade=None, model_number="SM-X216B", specs={"os": "Android 14", "display_in": "11", "sim_type": "nano", "junk": "x"}), paid=20000)
    assert r.status_code == 201, r.text
    tab = owner.get("/api/v1/devices", params={"category": "tablet"}).json()[0]
    assert tab["barcode"] and tab["ram_gb"] == 8 and tab["specs"] == {"os": "Android 14", "display_in": "11", "sim_type": "nano"}
    assert tab["pta_status"] == "pta_approved" and tab["cellular"] is True and tab["lock_checks"] is None
    r = _buy(owner, sup, _watch(owner, _cost=60000, _asking=70000, warranty_by="shop", specs={"os": "watchOS 10", "water": "WR50", "sensors": ["hr", "spo2", "ecg"]}))
    assert r.status_code == 201, r.text
    w = owner.get("/api/v1/devices", params={"category": "watch"}).json()[0]
    assert w["imei1"] == "H4KQ9X2LM1" and w["barcode"] != tab["barcode"] and w["pta_status"] == "unknown"
    assert w["lock_checks"] == {"activation": "cleared", "paired": "cleared"} and w["lock_ok"] is True and w["lock_checked_at"]
    assert w["specs"]["sensors"] == ["hr", "spo2", "ecg"] and w["warranty_by"] == "shop"
    hist = owner.get(f"/api/v1/devices/{w['id']}/history").json()
    assert [h["type"] for h in hist] == ["purchased"]
    # the supplier is owed both bills minus the 20,000 paid
    assert owner.get(f"/api/v1/parties/{sup['id']}").json()["balance"] == "-90000.00"
    # the shop's model library learned the tablet's sheet
    lib = owner.get(f"/api/v1/devices/model-specs/{tab['model_id']}").json()
    assert lib["model_number"] == "SM-X216B" and lib["ram_gb"] == 8 and lib["specs"]["os"] == "Android 14" and lib["learned"]


def test_buy_from_a_sell_to_b_with_partial_payments_for_tablet_and_watch(owner, cat):
    a = _party(owner, name="Dealer A", phone="03005550001")
    b = _party(owner, name="Customer B", phone="03005550002", kinds=("customer",))
    assert _buy(owner, a, _tablet(owner, _cost=40000, _asking=50000), paid=10000).status_code == 201
    assert _buy(owner, a, _watch(owner, condition="box_pack", _cost=30000, _asking=36000), paid=30000).status_code == 201
    assert owner.get(f"/api/v1/parties/{a['id']}").json()["balance"] == "-30000.00"
    devs = {d["category"]: d for d in owner.get("/api/v1/devices").json()}
    inv = owner.post(
        "/api/v1/sales",
        json={"party_id": b["id"], "devices": [{"device_id": devs["tablet"]["id"], "price": 50000}, {"device_id": devs["watch"]["id"], "price": 36000}], "paid": 50000},
    )
    assert inv.status_code == 201, inv.text
    inv = inv.json()
    assert inv["status"] == "partially_paid" and owner.get(f"/api/v1/parties/{b['id']}").json()["balance"] == "36000.00"
    lines = {ln["category"]: ln for ln in inv["lines"]}
    assert lines["tablet"]["pta_status"] == "pta_approved" and lines["watch"]["pta_status"] is None and lines["watch"]["serial"] == "H4KQ9X2LM1"
    p = owner.post("/api/v1/payments", json={"party_id": b["id"], "direction": "in", "amount": 16000}).json()
    assert p["party_balance_after"] == "20000.00"
    p = owner.post("/api/v1/payments", json={"party_id": b["id"], "direction": "in", "amount": 20000}).json()
    assert p["party_balance_after"] == "0.00"
    got = owner.get(f"/api/v1/sales/{inv['id']}").json()
    assert got["status"] == "paid"
    for d in devs.values():
        h = owner.get(f"/api/v1/devices/{d['id']}/history").json()
        assert [x["type"] for x in h] == ["purchased", "sold"]
    assert owner.get(f"/api/v1/devices/{devs['watch']['id']}").json()["status"] == "sold"


def test_duplicate_serial_warning_pta_only_with_sim_and_lock_check_rules(owner, cat):
    sup = _party(owner)
    assert _buy(owner, sup, _watch(owner)).status_code == 201
    # the serial is looked up like an IMEI: seen before, in stock → the purchase screen warns / blocks
    look = owner.get("/api/v1/devices/imei/h4kq-9x2lm1").json()
    assert look["found"] and look["device"]["category"] == "watch" and look["seen_before"]
    r = _buy(owner, sup, _watch(owner))
    assert r.status_code == 409 and r.json()["error"]["code"] in ("imei_exists", "imei_in_stock")
    # a Wi-Fi tablet needs no PTA; a used tablet / watch needs the lock tick
    t = _tablet(owner, cellular=False, imei1=None, serial="TABWIFI001", pta_status="non_pta", condition="used")
    r = _buy(owner, sup, t)
    assert r.status_code == 422 and r.json()["error"]["code"] == "lock_check_required", r.text
    t = _tablet(owner, cellular=False, imei1=None, serial="TABWIFI001", pta_status="non_pta", condition="used", lock_checked=True)
    r = _buy(owner, sup, t)
    assert r.status_code == 201, r.text
    wifi = owner.get("/api/v1/devices", params={"q": "TABWIFI001"}).json()[0]
    assert wifi["pta_status"] == "unknown" and wifi["cellular"] is False and wifi["lock_checks"] == {"activation": "cleared", "frp": "cleared"}
    # a lock still on: refused at purchase, and a sale is refused until it is cleared
    t2 = _tablet(owner, imei1="490154203237518", condition="used", lock_checks={"frp": "not_cleared"})
    r = _buy(owner, sup, t2)
    assert r.status_code == 422 and r.json()["error"]["code"] == "lock_not_cleared"
    owner.post(f"/api/v1/devices/{wifi['id']}/lock-check", json={"checks": {"frp": "not_cleared"}, "note": "Google account still on"})
    r = owner.post("/api/v1/sales", json={"devices": [{"device_id": wifi["id"], "price": 60000}], "paid": 60000})
    assert r.status_code == 409 and r.json()["error"]["code"] == "lock_not_cleared"
    got = owner.post(f"/api/v1/devices/{wifi['id']}/lock-check", json={"checks": {"frp": "cleared"}}).json()
    assert got["lock_ok"] is True
    assert "lock_checked" in [h["type"] for h in owner.get(f"/api/v1/devices/{wifi['id']}/history").json()]
    r = owner.post("/api/v1/sales", json={"devices": [{"device_id": wifi["id"], "price": 60000}], "paid": 60000, "override_reason": "known dealer, ID check later"})
    assert r.status_code == 201, r.text
    # a used phone is not asked for the lock tick unless the shop switches it on
    b, m = _mk(owner, "Nokia", "105 (2023)", "phone")
    phone = {"imei1": "357805023984942", "brand_id": b["id"], "model_id": m["id"], "condition": "used", "pta_status": "pta_approved"}
    assert _buy(owner, sup, dict(phone)).status_code == 201
    owner.patch("/api/v1/shops/current", json={"device_prefs": {"require_lock_check": True}})
    phone["imei1"] = "352099001761481"
    r = _buy(owner, sup, dict(phone))
    assert r.status_code == 422 and r.json()["error"]["code"] == "lock_check_required"


def test_reclassify_and_convert_keep_history_barcode_and_balances(owner, cat):
    sup = _party(owner)
    # a cellular watch mistakenly entered as a phone
    b, m = _mk(owner, "Samsung", "Galaxy Watch6", "watch")
    r = _buy(owner, sup, {"imei1": "352099001761481", "brand_id": b["id"], "model_id": m["id"], "condition": "box_pack", "pta_status": "pta_approved", "_cost": 20000, "_asking": 25000}, paid=5000)
    assert r.status_code == 201, r.text
    d = owner.get("/api/v1/devices").json()[0]
    assert d["category"] == "phone"
    pv = owner.post("/api/v1/devices/reclassify/preview", json={"device_ids": [d["id"]], "to_category": "watch"}).json()
    assert pv[0]["problems"] == [] and pv[0]["cellular_after"] is True and pv[0]["barcode"] == d["barcode"]
    # the model is a watch model, so "phone" is flagged in the preview
    bad = owner.post("/api/v1/devices/reclassify/preview", json={"device_ids": [d["id"]], "to_category": "phone"}).json()
    assert bad[0]["problems"] == ["model_is_watch"]
    r = owner.post("/api/v1/devices/reclassify/apply", json={"device_ids": [d["id"]], "to_category": "watch", "reason": "entered as a phone"})
    assert r.status_code == 200, r.text
    after = owner.get(f"/api/v1/devices/{d['id']}").json()
    assert after["category"] == "watch" and after["cellular"] is True and after["barcode"] == d["barcode"] and after["imei1"] == d["imei1"] and after["storage_id"] is None
    types = [h["type"] for h in owner.get(f"/api/v1/devices/{d['id']}/history").json()]
    assert types == ["purchased", "reclassified"]
    assert owner.get(f"/api/v1/parties/{sup['id']}").json()["balance"] == "-15000.00"
    assert owner.post("/api/v1/devices/reclassify/apply", json={"device_ids": [d["id"]], "to_category": "watch"}).status_code == 200  # idempotent
    # a counted watch becomes one serialized unit: item −1 with a reason, unit at the item's cost
    item = owner.post("/api/v1/accessories", json={"name": "T500 smart watch", "category": "watch", "price": 3500, "opening_qty": 3, "opening_cost": 2000}).json()
    b2, m2 = _mk(owner, "Other", "T500", "watch")
    r = owner.post(
        f"/api/v1/devices/from-item/{item['id']}",
        json={"identity": {"category": "watch", "serial": "T500A0001", "brand_id": b2["id"], "model_id": m2["id"], "condition": "box_pack", "cost_price": 0, "asking_price": 3500}},
    )
    assert r.status_code == 201, r.text
    unit = r.json()
    assert unit["cost_price"] == "2000.00" and unit["barcode"] and unit["category"] == "watch"
    assert owner.get(f"/api/v1/accessories/{item['id']}").json()["qty"] == 2
    mv = owner.get(f"/api/v1/accessories/{item['id']}/movements").json()[0]
    assert mv["reason"] == "adjust" and "Converted to device T500A0001" in mv["note"]
    types = [h["type"] for h in owner.get(f"/api/v1/devices/{unit['id']}/history").json()]
    assert types == ["purchased", "note"]


def test_filters_library_csv_and_stock_by_type(owner, cat):
    sup = _party(owner)
    assert _buy(owner, sup, _tablet(owner, ram_gb=8, grade=None), paid=0).status_code == 201
    assert _buy(owner, sup, _watch(owner, grade="a", _cost=30000, _asking=36000)).status_code == 201
    assert _buy(owner, sup, _tablet(owner, imei1="490154203237518", condition="used", lock_checked=True, grade="b", ram_gb=4, _cost=20000, _asking=26000)).status_code == 201
    ids = lambda **p: {d["imei1"] for d in owner.get("/api/v1/devices", params=p).json()}
    assert ids(ram_gb=8) == {TAB_IMEI} and ids(grade="b") == {"490154203237518"} and ids(category="watch") == {"H4KQ9X2LM1"}
    assert ids(price_min=30000, price_max=40000) == {"H4KQ9X2LM1"} and ids(lock_unchecked="true") == set()
    rep = owner.get("/api/v1/reports/stock-by-type").json()
    by = {t["category"]: t for t in rep["types"]}
    assert by["tablet"]["count"] == 2 and by["tablet"]["cost"] == "70000.00" and by["tablet"]["retail"] == "86000.00" and by["tablet"]["used"] == 1
    assert by["watch"]["count"] == 1 and by["phone"]["count"] == 0 and rep["total"]["count"] == 3
    assert owner.get("/api/v1/devices/lock-unchecked").json() == []
    # the library: CSV import makes a model and its sheet; the sheet fills the next unit
    csv = "brand,model,category,model_number,os,chipset,display_in,ram_gb\nXiaomi,Redmi Pad SE,tablet,23073RPBFG,Android 13,Snapdragon 680,11,6\n"
    r = owner.post("/api/v1/devices/model-specs/import", json={"csv": csv}).json()
    assert r["rows"] == 1 and r["models_updated"] == 1  # Redmi Pad SE is in the seed
    mods = owner.get("/api/v1/catalogue/models", params={"q": "Redmi Pad SE", "category": "tablet"}).json()
    sheet = owner.get(f"/api/v1/devices/model-specs/{mods[0]['id']}").json()
    assert sheet["model_number"] == "23073RPBFG" and sheet["ram_gb"] == 6 and sheet["specs"]["chipset"] == "Snapdragon 680"
    sheet = owner.put(f"/api/v1/devices/model-specs/{mods[0]['id']}", json={"model_number": "23073RPBFG", "ram_gb": 8, "specs": {"os": "Android 14"}}).json()
    assert sheet["ram_gb"] == 8 and sheet["specs"] == {"os": "Android 14"}
    assert owner.get("/api/v1/devices/options").json()["grades"] == ["a", "b", "refurbished", "copy"]
