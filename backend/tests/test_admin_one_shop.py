"""ADR-134 / ADR-115: the control room opens one shop by its id (GET /admin/shops/{id}) — the same
row as the list, also for a shop in the bin; only for the provider."""

import uuid

from tests.conftest import login, signup

SUPER = "03990000099"


def test_one_shop_by_id_is_the_list_row(client, owner, monkeypatch):
    monkeypatch.setattr("app.core.config.settings.superuser_phones", SUPER, raising=False)
    signup(client, shop_name="OOP Admin", owner_name="Product Owner", phone=SUPER)
    admin = login(client, SUPER)

    # a shop's own login is refused
    r = owner.get(f"/api/v1/admin/shops/{owner.shop_id}")
    assert r.status_code == 403

    r = admin.get(f"/api/v1/admin/shops/{owner.shop_id}")
    assert r.status_code == 200, r.text
    row = next(s for s in admin.get("/api/v1/admin/shops").json() if s["id"] == str(owner.shop_id))
    assert r.json() == row

    # in the bin it is still found, with when it was deleted
    name = row["name"]
    d = admin.post(
        f"/api/v1/admin/shops/{owner.shop_id}/delete", json={"confirm_name": name, "reason": "test"}
    )
    assert d.status_code == 200, d.text
    r = admin.get(f"/api/v1/admin/shops/{owner.shop_id}")
    assert r.status_code == 200 and r.json()["deleted_at"]

    # an unknown id is not found
    assert admin.get(f"/api/v1/admin/shops/{uuid.uuid4()}").status_code == 404
