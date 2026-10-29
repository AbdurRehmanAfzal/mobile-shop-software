"""Owner (2026-10-29, offline mode): a sale, purchase, payment or expense sent twice with the same
Idempotency-Key is posted once; the second call gets the first answer."""

from tests.test_devices import _stock
from tests.test_purchases import _party

IMEI_A = "490154203237518"


def test_same_key_posts_the_sale_once(owner, other_owner, cat):
    d = _stock(owner, cat, imei=IMEI_A, condition="box_pack", cost_price=800, asking_price=1000)
    body = {"devices": [{"device_id": d["id"], "price": 1000}], "paid": 1000}
    h = {"Idempotency-Key": "phone-1-sale-42"}
    first = owner.post("/api/v1/sales", json=body, headers={**owner.headers(), **h})
    assert first.status_code == 201, first.text
    again = owner.post("/api/v1/sales", json=body, headers={**owner.headers(), **h})
    assert again.status_code == 201 and again.json()["id"] == first.json()["id"]
    assert len(owner.get("/api/v1/sales").json()) == 1
    # without the key the phone is already sold: refused as before
    assert owner.post("/api/v1/sales", json=body).status_code in (409, 422)
    # a key is per shop: another shop may use the same string
    assert (
        other_owner.post(
            "/api/v1/parties",
            json={"name": "Ali", "phone": "03001112233", "kinds": ["customer"]},
        ).status_code
        == 201
    )


def test_failed_request_frees_the_key(owner, cat):
    c = _party(owner, name="Ahmed", phone="03219876543", kinds=("customer",))
    h = {**owner.headers(), "Idempotency-Key": "pay-7"}
    bad = owner.post(
        "/api/v1/payments",
        json={"party_id": c["id"], "direction": "in", "amount": -5},
        headers=h,
    )
    assert bad.status_code == 422
    ok = owner.post(
        "/api/v1/payments",
        json={"party_id": c["id"], "direction": "in", "amount": 500},
        headers=h,
    )
    assert ok.status_code == 201, ok.text
    again = owner.post(
        "/api/v1/payments",
        json={"party_id": c["id"], "direction": "in", "amount": 500},
        headers=h,
    )
    assert again.json()["id"] == ok.json()["id"]
    assert len(owner.get("/api/v1/payments").json()) == 1
