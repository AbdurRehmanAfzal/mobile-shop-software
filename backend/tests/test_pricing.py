"""Owner 2026-11-16 (ADR-092): the landing page's prices — monthly, setup fee, yearly months, trial
days and add-ons — are the provider's to set; until then they are what the page showed before."""

OWNER = "03001234567"


def test_defaults_then_the_provider_sets_them(client, owner, other_owner, monkeypatch):
    info = client.get("/api/v1/public/info").json()
    plans = {p["key"]: p for p in info["plans"]}
    assert (plans["basic"]["price"], plans["pro"]["price"], plans["chain"]["price"]) == (
        2000,
        5000,
        7500,
    )
    assert plans["pro"]["yearly_price"] == 50000 and plans["pro"]["setup_fee"] == 8000
    assert info["trial_days"] == 14 and len(info["addons"]) == 4

    body = {
        "prices": {"basic": 2000, "pro": 3500, "chain": 6000},
        "setup_fee": {"pro": 5000},
        "yearly_paid_months": 9,
        "trial_days": 7,
        "addons": [{"en": "Extra branch", "ur": "اضافی برانچ", "price": 12000, "per": "year"}],
    }
    # a shop owner is not the provider
    assert other_owner.put("/api/v1/admin/pricing", json=body).status_code == 403

    from app.core.config import settings

    monkeypatch.setattr(settings, "superuser_phones", OWNER, raising=False)
    r = owner.put("/api/v1/admin/pricing", json=body)
    assert r.status_code == 200, r.text
    info = client.get("/api/v1/public/info").json()
    plans = {p["key"]: p for p in info["plans"]}
    assert plans["basic"]["price"] == 2000 and plans["pro"]["yearly_price"] == 3500 * 9
    # a plan left out of the change keeps its fee
    assert plans["pro"]["setup_fee"] == 5000 and plans["basic"]["setup_fee"] == 5000
    assert info["trial_days"] == 7
    assert info["addons"] == [
        {"en": "Extra branch", "ur": "اضافی برانچ", "roman": "", "price": 12000, "per": "year"}
    ]
    # nonsense is refused
    bad = owner.put("/api/v1/admin/pricing", json={**body, "yearly_paid_months": 20})
    assert bad.status_code == 422
