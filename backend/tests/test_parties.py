"""FR-MST-03: unified parties, per-shop phone uniqueness, search, isolation, roles."""

from tests.conftest import login


def _customer(actor, phone="03211234567", **extra):
    payload = {
        "name": "Ahmed Khan",
        "name_ur": "احمد خان",
        "phone": phone,
        "kinds": ["customer"],
        **extra,
    }
    r = actor.post("/api/v1/parties", json=payload)
    assert r.status_code == 201, r.text
    return r.json()


def test_create_normalises_phone_and_cnic(owner):
    p = _customer(owner, phone="+92 321 1234567", cnic="33100 1234567 1", whatsapp="۰۳۲۱۱۲۳۴۵۶۷")
    assert p["phone"] == "03211234567"
    assert p["whatsapp"] == "03211234567"
    assert p["cnic"] == "33100-1234567-1"
    assert p["balance"] == "0.00" or float(p["balance"]) == 0
    assert p["kinds"] == ["customer"]


def test_invalid_cnic_and_phone_rejected(owner):
    r = owner.post(
        "/api/v1/parties",
        json={"name": "X Y", "phone": "03211234567", "kinds": ["customer"], "cnic": "123"},
    )
    assert r.status_code == 422
    r = owner.post(
        "/api/v1/parties", json={"name": "X Y", "phone": "0421234567", "kinds": ["customer"]}
    )
    assert r.status_code == 422
    r = owner.post("/api/v1/parties", json={"name": "X Y", "phone": "03211234567", "kinds": []})
    assert r.status_code == 422


def test_phone_unique_per_shop_but_not_across_shops(owner, other_owner):
    _customer(owner)
    r = owner.post(
        "/api/v1/parties",
        json={"name": "Dup Person", "phone": "03211234567", "kinds": ["supplier"]},
    )
    assert r.status_code == 409 and r.json()["error"]["code"] == "party_phone_exists"
    _customer(other_owner)  # same phone in another shop is fine


def test_party_can_have_many_kinds_and_dedupes(owner):
    p = _customer(owner, kinds=["shop", "customer", "shop"])
    assert p["kinds"] == ["shop", "customer"]
    shops = owner.get("/api/v1/parties", params={"kind": "shop"}).json()
    assert [x["id"] for x in shops] == [p["id"]]
    assert owner.get("/api/v1/parties", params={"kind": "supplier"}).json() == []


def test_search_by_name_urdu_phone_cnic(owner):
    a = _customer(owner, phone="03211234567", cnic="33100-1234567-1")
    _customer(
        owner, phone="03001111111", name="Bilal Mobiles", name_ur="بلال موبائلز", kinds=["shop"]
    )
    assert [x["id"] for x in owner.get("/api/v1/parties", params={"q": "ahm"}).json()] == [a["id"]]
    assert len(owner.get("/api/v1/parties", params={"q": "بلال"}).json()) == 1
    assert [x["id"] for x in owner.get("/api/v1/parties", params={"q": "0321 123"}).json()] == [
        a["id"]
    ]
    assert [x["id"] for x in owner.get("/api/v1/parties", params={"q": "33100"}).json()] == [
        a["id"]
    ]
    r = owner.get("/api/v1/parties/by-phone/+923211234567")
    assert r.status_code == 200 and r.json()["id"] == a["id"]
    assert owner.get("/api/v1/parties/by-phone/03009999999").status_code == 404


def test_isolation_and_update(owner, other_owner):
    p = _customer(owner)
    assert other_owner.get(f"/api/v1/parties/{p['id']}").status_code == 404
    assert (
        other_owner.patch(f"/api/v1/parties/{p['id']}", json={"name": "Hacked"}).status_code == 404
    )
    r = owner.patch(f"/api/v1/parties/{p['id']}", json={"city": "Faisalabad", "is_active": False})
    assert r.status_code == 200 and r.json()["city"] == "Faisalabad"
    assert owner.get("/api/v1/parties").json() == []
    assert len(owner.get("/api/v1/parties", params={"include_inactive": "true"}).json()) == 1
    audit = owner.get("/api/v1/audit", params={"entity": "party"}).json()
    assert {a["action"] for a in audit} == {"create", "update"}


def test_balance_is_not_writable_via_api(owner):
    p = _customer(owner)
    r = owner.patch(f"/api/v1/parties/{p['id']}", json={"balance": 5000})
    assert r.status_code == 200 and float(r.json()["balance"]) == 0


def test_technician_can_read_not_write(client, owner):
    owner.post(
        "/api/v1/staff",
        json={
            "name": "Tech",
            "phone": "03451112233",
            "password": "secret123",
            "role": "technician",
        },
    )
    tech = login(client, "03451112233")
    assert tech.get("/api/v1/parties").status_code == 200
    r = tech.post(
        "/api/v1/parties", json={"name": "X Y", "phone": "03211234567", "kinds": ["customer"]}
    )
    assert r.status_code == 403
