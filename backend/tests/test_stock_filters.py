"""Owner 2026-11-16 (ADR-091): the stock screen's tick-box filters — several statuses, brands,
conditions, PTA states or types at once; the download / share follows the same ticks."""

from tests.test_devices import _stock

A, B, C = "490154203237518", "356938035643809", "353918050587126"


def test_tick_box_filters(owner, cat):
    _stock(owner, cat, imei=A, condition="used", pta_status="pta_approved")
    _stock(owner, cat, imei=B, condition="box_pack", pta_status="non_pta", asking_price=1500)
    c = _stock(owner, cat, imei=C, condition="used", pta_status="jv")
    owner.post(
        f"/api/v1/devices/{c['id']}/events",
        json={"type": "marked_faulty", "data": {"note": "screen"}},
    )

    def imeis(**params):
        rows = owner.get("/api/v1/devices", params={"limit": 500, **params}).json()
        return sorted(d["imei1"] for d in rows)

    assert imeis(conditions="used") == sorted([A, C])
    assert imeis(conditions="used,box_pack") == sorted([A, B, C])
    assert imeis(pta_statuses="non_pta,jv") == sorted([B, C])
    # "in stock" counts a faulty unit as stock (ADR-066)
    assert imeis(statuses="in_stock") == sorted([A, B, C])
    assert imeis(statuses="faulty") == [C]
    # groups together narrow the list
    assert imeis(conditions="used", pta_statuses="jv,non_pta") == [C]
    assert imeis(brand_ids=cat["brand"]["id"], categories="phone,tablet") == sorted([A, B, C])
    assert imeis(categories="watch") == []

    # the download follows the same ticks
    csv = owner.get(
        "/api/v1/exports/stock",
        params={"status": "all", "cols": "name,imei", "pta_statuses": "non_pta,jv"},
    ).text
    assert B in csv and C in csv and A not in csv


def test_sticker_preview_is_not_a_print(owner, cat):
    """ADR-091: the phone page's live sticker preview records nothing; a real print does"""
    d = _stock(owner, cat, imei=A)

    def prints():
        hist = owner.get(f"/api/v1/devices/{d['id']}/history").json()
        events = hist if isinstance(hist, list) else hist["events"]
        return sum(1 for e in events if e["type"] == "label_printed")

    r = owner.get("/api/v1/labels/devices", params={"ids": d["id"], "preview": "true"})
    assert r.status_code == 200 and A in r.text
    assert prints() == 0
    owner.get("/api/v1/labels/devices", params={"ids": d["id"]})
    assert prints() == 1
