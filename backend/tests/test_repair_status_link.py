"""The customer's repair status link (docs/35 §5 item 5): opens without login, shows progress and what
is left to pay, never the customer's phone, the full IMEI, the lock or a cost; a changed link fails."""

from tests.test_repairs import _customer


def test_status_link_shows_progress_only(client, owner):
    c = _customer(owner)
    job = owner.post(
        "/api/v1/repairs",
        json={"party_id": c["id"], "device_desc": "Samsung A54 black", "imei": "490154203237518", "fault_codes": ["screen"], "estimate": 6000, "advance": 2000, "promised_at": "2030-01-05", "screen_lock": "2468"},
    ).json()
    tok = job["status_token"]
    assert tok and "." in tok

    r = client.get(f"/api/v1/public/repair/{tok}")  # no login
    assert r.status_code == 200, r.text
    v = r.json()
    assert v["no"] == job["no"] and v["device"] == "Samsung A54 black" and v["status"] == "received"
    assert v["imei_last4"] == "7518" and v["faults"][0]["code"] == "screen"
    assert v["bill"] == "6000.00" and v["paid"] == "2000.00" and v["left"] == "4000.00"
    assert v["steps"][0]["status"] == "received" and v["steps"][0]["at"]
    body = r.text
    for secret in ("03219876543", "490154203237518", "2468", "Ahmed"):
        assert secret not in body

    # progress shows up
    owner.post(f"/api/v1/repairs/{job['id']}/status", json={"status": "in_progress"})
    v = client.get(f"/api/v1/public/repair/{tok}").json()
    assert v["status"] == "in_progress" and next(s for s in v["steps"] if s["status"] == "in_progress")["at"]

    # a changed or made-up link opens nothing
    raw, sig = tok.split(".")
    assert client.get(f"/api/v1/public/repair/{raw}.{'0' * len(sig)}").status_code == 404
    assert client.get("/api/v1/public/repair/not-a-token").status_code == 404
