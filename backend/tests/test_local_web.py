"""Owner (2026-10-30): the one-PC install serves the built web app from the backend itself; the API
keeps precedence and every app route falls back to index.html."""

from app.core.config import settings


def test_backend_serves_the_web_app(tmp_path, client):
    """Mounted on the test app (its database has the tables); the catch-all is removed afterwards
    so other tests still get 404s for unknown paths."""
    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text('<!doctype html><div id="root"></div>', encoding="utf-8")
    (tmp_path / "assets" / "app.js").write_text("console.log(1)", encoding="utf-8")
    (tmp_path / "icon.svg").write_text("<svg/>", encoding="utf-8")
    from app.main import _mount_web

    app = client.app
    before = len(app.router.routes)
    _mount_web(app, str(tmp_path))
    try:
        assert client.get("/health").status_code == 200
        assert client.get("/api/v1/public/info").status_code == 200
        assert '<div id="root">' in client.get("/").text
        assert client.get("/assets/app.js").text == "console.log(1)"
        assert client.get("/icon.svg").text == "<svg/>"
        # an app route and a missing file both land on the app shell
        assert '<div id="root">' in client.get("/sale/new").text
        assert '<div id="root">' in client.get("/no/such/file.png").text
        # nothing outside the folder
        r = client.get("/../alembic.ini")
        assert '<div id="root">' in r.text or r.status_code in (400, 404)
    finally:
        del app.router.routes[before:]


def test_local_mode_signup_is_chain_without_expiry(client, monkeypatch):
    monkeypatch.setattr(settings, "local_mode", True)
    r = client.post(
        "/api/v1/auth/signup",
        json={
            "shop_name": "PC Shop",
            "owner_name": "Owner",
            "phone": "03127650000",
            "password": "secret123",
        },
    )
    assert r.status_code == 201, r.text
    plan = r.json()["me"]["plan"]
    assert plan["plan"] == "chain" and plan["status"] == "unlimited" and plan["days_left"] is None
    assert "ai" in plan["modules"] and "attendance" in plan["modules"]
