"""FR-VER-01..04 and file uploads: verification record, VERIFIED events, sale block, override, declaration."""

import io

import pytest

from app.modules.devices.service import get_device
from app.modules.verification.service import NotSellable, assert_sellable
from tests.conftest import login
from tests.test_devices import IMEI, _stock

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


def _upload(actor, purpose="cnic", content_type="image/png", data=PNG):
    r = actor.client.post(
        "/api/v1/files",
        params={"purpose": purpose},
        headers=actor.headers(),
        files={"file": ("x.png", io.BytesIO(data), content_type)},
    )
    return r


def _seller(actor):
    r = actor.post(
        "/api/v1/parties", json={"name": "Ali Raza", "phone": "03007777777", "kinds": ["customer"]}
    )
    return r.json()


def test_upload_validates_and_is_shop_scoped(owner, other_owner, tmp_path, monkeypatch):
    from app.core import config as cfg

    monkeypatch.setattr(cfg.settings, "upload_dir", str(tmp_path))
    r = _upload(owner)
    assert r.status_code == 201, r.text
    path = r.json()["path"]
    assert path.startswith(owner.shop_id + "/") and path.endswith(".png")
    assert owner.get(f"/api/v1/files/{path}").status_code == 200
    assert other_owner.get(f"/api/v1/files/{path}").status_code == 404
    assert _upload(owner, content_type="text/plain", data=b"hello").status_code == 422
    assert _upload(owner, data=b"").status_code == 422


def test_verification_pending_then_clear(owner, cat, db, tmp_path, monkeypatch):
    from app.core import config as cfg

    monkeypatch.setattr(cfg.settings, "upload_dir", str(tmp_path))
    d = _stock(owner, cat)
    assert d["verification_status"] == "pending"
    assert owner.get(f"/api/v1/devices/{d['id']}/verification").status_code == 404
    seller = _seller(owner)
    front = _upload(owner).json()["path"]
    back = _upload(owner).json()["path"]
    r = owner.put(
        f"/api/v1/devices/{d['id']}/verification",
        json={
            "seller_party_id": seller["id"],
            "cnic_no": "33100 1234567 1",
            "cnic_front_path": front,
            "cnic_back_path": back,
            "egadget_result": "clear",
        },
    )
    assert r.status_code == 200, r.text
    v = r.json()
    assert v["result"] == "pending" and set(v["missing"]) == {"seller_photo_path", "declaration"}
    assert owner.get(f"/api/v1/devices/{d['id']}").json()["verification_status"] == "pending"
    assert (
        owner.get(f"/api/v1/parties/{seller['id']}").json()["cnic"] == "33100-1234567-1"
    )  # copied to party
    with pytest.raises(NotSellable):
        assert_sellable(
            get_device(db, __import__("uuid").UUID(owner.shop_id), __import__("uuid").UUID(d["id"]))
        )

    selfie = _upload(owner, purpose="seller").json()["path"]
    r = owner.put(
        f"/api/v1/devices/{d['id']}/verification",
        json={
            **v,
            "seller_photo_path": selfie,
            "declaration_signed": True,
            "pta_checked": True,
            "pta_result": "non_pta",
        },
    )
    assert r.status_code == 200, r.text
    assert r.json()["result"] == "clear" and r.json()["missing"] == []
    dev = owner.get(f"/api/v1/devices/{d['id']}").json()
    assert dev["verification_status"] == "clear" and dev["pta_status"] == "non_pta"
    hist = owner.get(f"/api/v1/devices/{d['id']}/history").json()
    assert [h["type"] for h in hist] == ["purchased", "verified", "verified"]
    assert hist[-1]["data"]["result"] == "clear" and hist[-1]["party_name"] == "Ali Raza"
    # file from another shop is rejected
    r = owner.put(
        f"/api/v1/devices/{d['id']}/verification",
        json={**v, "cnic_front_path": "00000000-0000-0000-0000-000000000000/x.png"},
    )
    assert r.status_code == 422 and r.json()["error"]["code"] == "file_not_found"


def test_flagged_blocks_sale_and_owner_can_override(client, owner, cat, db):
    import uuid as _uuid

    d = _stock(owner, cat)
    r = owner.put(
        f"/api/v1/devices/{d['id']}/verification",
        json={"egadget_result": "flagged", "egadget_ref": "EG-123"},
    )
    assert r.json()["result"] == "flagged"
    dev = get_device(db, _uuid.UUID(owner.shop_id), _uuid.UUID(d["id"]))
    with pytest.raises(NotSellable) as exc:
        assert_sellable(dev)
    assert exc.value.code == "device_flagged"

    owner.post(
        "/api/v1/staff",
        json={"name": "Sales", "phone": "03451112233", "password": "secret123", "role": "salesman"},
    )
    s = login(client, "03451112233")
    assert (
        s.post(
            f"/api/v1/devices/{d['id']}/verification/override", json={"reason": "owner said ok"}
        ).status_code
        == 403
    )

    r = owner.post(
        f"/api/v1/devices/{d['id']}/verification/override",
        json={
            "reason": "Seller is a known regular; eGadget flag was an old report, cleared by phone with police"
        },
    )
    assert r.status_code == 200 and r.json()["override_by"] == owner.me["user"]["id"]
    db.expire_all()
    dev = get_device(db, _uuid.UUID(owner.shop_id), _uuid.UUID(d["id"]))
    assert dev.verification_status == "clear"
    assert_sellable(dev)
    hist = owner.get(f"/api/v1/devices/{d['id']}/history").json()
    assert hist[-1]["data"]["override"] is True and hist[-1]["data"]["previous"] == "flagged"
    audit = owner.get("/api/v1/audit", params={"entity": "verification"}).json()
    assert "override" in {a["action"] for a in audit}


def test_box_pack_is_sellable_without_verification(owner, cat, db):
    import uuid as _uuid

    d = _stock(owner, cat, imei="490154203237518", condition="box_pack")
    assert_sellable(get_device(db, _uuid.UUID(owner.shop_id), _uuid.UUID(d["id"])))


def test_declaration_is_bilingual_html_and_isolated(owner, other_owner, cat):
    d = _stock(owner, cat)
    seller = _seller(owner)
    owner.put(
        f"/api/v1/devices/{d['id']}/verification",
        json={"seller_party_id": seller["id"], "cnic_no": "33100-1234567-1"},
    )
    r = owner.get(f"/api/v1/devices/{d['id']}/verification/declaration")
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/html")
    body = r.text
    assert (
        "Ali Raza" in body
        and IMEI in body
        and "33100-1234567-1" in body
        and "اقرار" in body
        and "declare" not in body
    )
    assert other_owner.get(f"/api/v1/devices/{d['id']}/verification/declaration").status_code == 404
