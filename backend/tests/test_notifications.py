"""FR-RPT-04/06: optional WhatsApp/email notifications to owner and customer on sale, purchase, payment."""

from tests.conftest import login
from tests.test_devices import _stock
from tests.test_purchases import _party

IMEI_A = "490154203237518"


def _customer(owner):
    return _party(owner, name="Ahmed Khan", phone="03219876543", kinds=("customer",))


def test_nothing_queued_by_default(owner, cat):
    c = _customer(owner)
    d = _stock(owner, cat, imei=IMEI_A, condition="box_pack", cost_price=800, asking_price=1000)
    owner.post(
        "/api/v1/sales",
        json={
            "party_id": c["id"],
            "devices": [{"device_id": d["id"], "price": 1000}],
            "paid": 1000,
        },
    )
    assert owner.get("/api/v1/notifications").json() == []
    assert owner.get("/api/v1/notifications/settings").json()["owner_on_sale_whatsapp"] is False


def test_sale_queues_customer_and_owner_messages_in_shop_language(owner, cat):
    r = owner.put(
        "/api/v1/notifications/settings",
        json={
            "owner_whatsapp": "+92 300 1112222",
            "owner_email": "owner@example.com",
            "owner_on_sale_whatsapp": True,
            "owner_on_sale_email": True,
            "customer_on_sale_whatsapp": True,
        },
    )
    assert r.status_code == 200 and r.json()["owner_whatsapp"] == "03001112222"
    c = _customer(owner)
    d = _stock(owner, cat, imei=IMEI_A, condition="box_pack", cost_price=800, asking_price=1000)
    inv = owner.post(
        "/api/v1/sales",
        json={
            "party_id": c["id"],
            "devices": [
                {"device_id": d["id"], "price": 1000, "accessories_pending": [{"kind": "charger"}]}
            ],
            "paid": 400,
        },
    ).json()
    msgs = owner.get("/api/v1/notifications").json()
    assert {(m["audience"], m["channel"]) for m in msgs} == {
        ("customer", "whatsapp"),
        ("owner", "whatsapp"),
        ("owner", "email"),
    }
    cust = next(m for m in msgs if m["audience"] == "customer")
    assert (
        cust["lang"] == "ur"
        and "Nokia" in cust["body"]
        and "600" in cust["body"]
        and "charger" in cust["body"]
    )
    assert cust["recipient"] == "03219876543" and cust["link"].startswith(
        "https://wa.me/923219876543?text="
    )
    assert cust["status"] == "queued" and cust["document_id"] == inv["id"]
    own_mail = next(m for m in msgs if m["channel"] == "email")
    assert (
        own_mail["recipient"] == "owner@example.com"
        and own_mail["subject"].startswith("فروخت")
        and "Owner" in own_mail["body"]
    )
    r = owner.post(f"/api/v1/notifications/{cust['id']}/mark-sent")
    assert r.status_code == 200 and r.json()["status"] == "sent"


def test_english_shop_gets_english_messages_and_purchase_alert(owner, cat):
    owner.patch("/api/v1/shops/current", json={"default_locale": "en"})
    owner.put(
        "/api/v1/notifications/settings",
        json={
            "owner_whatsapp": "03001112222",
            "owner_on_purchase_whatsapp": True,
            "seller_on_purchase_whatsapp": True,
        },
    )
    sup = _party(owner)
    owner.post(
        "/api/v1/purchases",
        json={
            "kind": "supplier",
            "party_id": sup["id"],
            "devices": [
                {
                    "device": {
                        "imei1": IMEI_A,
                        "brand_id": cat["brand"]["id"],
                        "model_id": cat["model"]["id"],
                        "condition": "box_pack",
                    },
                    "cost": 4000,
                }
            ],
            "paid": 1000,
        },
    )
    msgs = owner.get("/api/v1/notifications").json()
    assert len(msgs) == 2 and all(m["lang"] == "en" for m in msgs)
    own = next(m for m in msgs if m["audience"] == "owner")
    assert (
        own["body"].startswith("Owner added 1 item(s) from Rehman Traders")
        and "4,000" in own["body"]
    )
    seller = next(m for m in msgs if m["audience"] == "customer")
    assert "bought" in seller["body"] and seller["recipient"] == sup["phone"]


def test_payment_receipt_and_isolation_and_roles(client, owner, other_owner, cat):
    owner.put(
        "/api/v1/notifications/settings",
        json={"customer_on_payment_whatsapp": True, "language": "en"},
    )
    c = _customer(owner)
    d = _stock(owner, cat, imei=IMEI_A, condition="box_pack", cost_price=800, asking_price=1000)
    owner.post(
        "/api/v1/sales",
        json={"party_id": c["id"], "devices": [{"device_id": d["id"], "price": 1000}], "paid": 0},
    )
    owner.post("/api/v1/payments", json={"party_id": c["id"], "direction": "in", "amount": 400})
    msgs = owner.get("/api/v1/notifications").json()
    assert (
        len(msgs) == 1
        and msgs[0]["event_type"] == "payment"
        and "Remaining balance: Rs. 600" in msgs[0]["body"]
    )
    assert other_owner.get("/api/v1/notifications").json() == []
    owner.post(
        "/api/v1/staff",
        json={"name": "Sales", "phone": "03451112233", "password": "secret123", "role": "salesman"},
    )
    s = login(client, "03451112233")
    assert s.get("/api/v1/notifications/settings").status_code == 403
    assert s.get("/api/v1/notifications").status_code == 200


def test_receipt_and_declaration_follow_shop_language(owner, cat):
    c = _customer(owner)
    d = _stock(owner, cat, imei=IMEI_A, condition="box_pack", cost_price=800, asking_price=1000)
    inv = owner.post(
        "/api/v1/sales",
        json={
            "party_id": c["id"],
            "devices": [{"device_id": d["id"], "price": 1000}],
            "paid": 1000,
        },
    ).json()
    ur = owner.get(f"/api/v1/sales/{inv['id']}/receipt").text
    assert 'lang="ur"' in ur and "کل" in ur and "Total" not in ur
    en = owner.get(f"/api/v1/sales/{inv['id']}/receipt", params={"lang": "en"}).text
    assert 'lang="en"' in en and "Total" in en and "کل" not in en
    owner.patch("/api/v1/shops/current", json={"default_locale": "en"})
    assert 'lang="en"' in owner.get(f"/api/v1/sales/{inv['id']}/receipt").text
    decl = owner.get(f"/api/v1/devices/{d['id']}/verification/declaration").text
    assert "Purchase declaration" in decl and "اقرار" not in decl
    decl_ur = owner.get(
        f"/api/v1/devices/{d['id']}/verification/declaration", params={"lang": "ur"}
    ).text
    assert "اقرار" in decl_ur and "Purchase declaration" not in decl_ur
