"""Tenant isolation and role enforcement (FR-AUTH-03, FR-AUTH-04, FR-AUTH-06)."""

from tests.conftest import login


def test_cannot_use_another_orgs_shop(client, owner, other_owner):
    r = owner.get("/api/v1/shops/current", shop_id=other_owner.shop_id)
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "shop_forbidden"


def test_staff_list_is_per_organisation(client, owner, other_owner):
    a = owner.get("/api/v1/staff").json()
    b = other_owner.get("/api/v1/staff").json()
    assert {u["phone"] for u in a} == {"03001234567"}
    assert {u["phone"] for u in b} == {"03119876543"}


def test_owner_creates_salesman_who_cannot_manage_staff(client, owner):
    r = owner.post(
        "/api/v1/staff",
        json={
            "name": "Bilal",
            "phone": "03211112222",
            "password": "secret123",
            "role": "salesman",
            "pin": "1234",
        },
    )
    assert r.status_code == 201, r.text
    assert r.json()["role"] == "salesman"

    salesman = login(client, "03211112222")
    assert salesman.shop_id == owner.shop_id  # auto-assigned to the active shop
    r = salesman.get("/api/v1/staff")
    assert r.status_code == 403
    r = salesman.post(
        "/api/v1/staff",
        json={"name": "X", "phone": "03311112222", "password": "secret123", "role": "salesman"},
    )
    assert r.status_code == 403
    r = salesman.patch("/api/v1/shops/current", json={"name": "Hacked"})
    assert r.status_code == 403


def test_cannot_create_owner_via_staff(client, owner):
    r = owner.post(
        "/api/v1/staff",
        json={"name": "X", "phone": "03211112223", "password": "secret123", "role": "owner"},
    )
    assert r.status_code == 422


def test_disabled_staff_cannot_login(client, owner):
    r = owner.post(
        "/api/v1/staff",
        json={"name": "Bilal", "phone": "03211112222", "password": "secret123", "role": "salesman"},
    )
    staff_id = r.json()["id"]
    r = owner.patch(f"/api/v1/staff/{staff_id}", json={"is_active": False})
    assert r.status_code == 200 and r.json()["is_active"] is False
    r = client.post("/api/v1/auth/login", json={"phone": "03211112222", "password": "secret123"})
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "user_inactive"


def test_owner_cannot_edit_other_orgs_staff(client, owner, other_owner):
    r = owner.patch(f"/api/v1/staff/{other_owner.me['user']['id']}", json={"name": "Pwned"})
    assert r.status_code == 404


def test_second_shop_requires_header_and_is_scoped(client, owner):
    r = owner.post("/api/v1/shops", json={"name": "Branch 2", "city": "Lahore"})
    assert r.status_code == 201, r.text
    branch = r.json()
    # Now two shops: header is mandatory
    r = owner.client.get(
        "/api/v1/shops/current", headers={"Authorization": f"Bearer {owner.access}"}
    )
    assert r.status_code == 403 and r.json()["error"]["code"] == "shop_required"
    r = owner.get("/api/v1/shops/current", shop_id=branch["id"])
    assert r.status_code == 200 and r.json()["name"] == "Branch 2"


def test_audit_log_records_changes_and_is_shop_scoped(client, owner, other_owner):
    r = owner.patch("/api/v1/shops/current", json={"tax_enabled": True, "tax_rate": 18})
    assert r.status_code == 200
    rows = owner.get("/api/v1/audit", params={"entity": "shop"}).json()
    actions = [row["action"] for row in rows]
    assert "update" in actions and "create" in actions
    upd = next(row for row in rows if row["action"] == "update")
    assert upd["after"]["tax_rate"] == 18 and upd["before"]["tax_enabled"] is False
    # other org sees only its own create
    other_rows = other_owner.get("/api/v1/audit").json()
    assert all(row["action"] != "update" for row in other_rows)
