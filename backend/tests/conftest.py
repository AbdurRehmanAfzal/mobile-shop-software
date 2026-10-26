"""Test harness: in-memory SQLite per test, FastAPI TestClient, helper fixtures.

Each test gets a fresh schema (Base.metadata.create_all). Migration parity is covered
separately by tests/test_migrations.py.
"""

import os

os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("SECRET_KEY", "test-secret-key-that-is-long-enough-for-hs256")

import pytest

from app.core.config import settings

# tests open throwaway shops through public signup (off by default, as in production)
settings.public_signup = True
from fastapi.testclient import TestClient
from sqlalchemy import StaticPool, create_engine, event
from sqlalchemy.orm import sessionmaker

from app.db.models import Base
from app.db.session import get_db
from app.main import create_app


@pytest.fixture()
def engine():
    eng = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(eng, "connect")
    def _fk(dbapi_conn, _):
        dbapi_conn.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(eng)
    yield eng
    eng.dispose()


@pytest.fixture()
def db(engine):
    Session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    session = Session()
    yield session
    session.close()


@pytest.fixture()
def client(engine):
    Session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    def _override():
        s = Session()
        try:
            yield s
        finally:
            s.close()

    app = create_app()
    app.dependency_overrides[get_db] = _override
    with TestClient(app) as c:
        yield c


class Actor:
    """A logged-in user bound to a client, with auth headers ready."""

    def __init__(self, client: TestClient, tokens: dict, me: dict):
        self.client = client
        self.access = tokens["access_token"]
        self.refresh = tokens["refresh_token"]
        self.me = me
        self.shop_id = me["active_shop_id"]

    def headers(self, shop_id: str | None = None) -> dict:
        h = {"Authorization": f"Bearer {self.access}"}
        sid = shop_id or self.shop_id
        if sid:
            h["X-Shop-Id"] = sid
        return h

    def get(self, url, **kw):
        return self.client.get(
            url, headers={**self.headers(kw.pop("shop_id", None)), **kw.pop("headers", {})}, **kw
        )

    def post(self, url, **kw):
        return self.client.post(
            url, headers={**self.headers(kw.pop("shop_id", None)), **kw.pop("headers", {})}, **kw
        )

    def delete(self, url, **kw):
        return self.client.delete(
            url, headers={**self.headers(kw.pop("shop_id", None)), **kw.pop("headers", {})}, **kw
        )

    def patch(self, url, **kw):
        return self.client.patch(
            url, headers={**self.headers(kw.pop("shop_id", None)), **kw.pop("headers", {})}, **kw
        )

    def put(self, url, **kw):
        return self.client.put(
            url,
            headers={**self.headers(kw.pop("shop_id", None)), **kw.pop("headers", {})},
            **kw,
        )


def signup(
    client: TestClient, phone: str = "03001234567", shop_name: str = "Test Mobile", **extra
) -> Actor:
    payload = {
        "shop_name": shop_name,
        "owner_name": "Owner",
        "phone": phone,
        "password": "secret123",
        **extra,
    }
    r = client.post("/api/v1/auth/signup", json=payload)
    assert r.status_code == 201, r.text
    body = r.json()
    return Actor(client, body["tokens"], body["me"])


def login(client: TestClient, phone: str, password: str = "secret123") -> Actor:
    r = client.post("/api/v1/auth/login", json={"phone": phone, "password": password})
    assert r.status_code == 200, r.text
    body = r.json()
    return Actor(client, body["tokens"], body["me"])


@pytest.fixture()
def owner(client) -> Actor:
    return signup(client)


@pytest.fixture()
def other_owner(client) -> Actor:
    return signup(client, phone="03119876543", shop_name="Other Shop")


@pytest.fixture()
def cat(db, owner):
    """Seeded catalogue + handy Nokia 105 refs for device tests."""
    from app.seeds.catalogue import seed_catalogue

    seed_catalogue(db)
    brands = owner.get("/api/v1/catalogue/brands").json()
    nokia = next(b for b in brands if b["name"] == "Nokia")
    model = owner.get(
        "/api/v1/catalogue/models", params={"brand_id": nokia["id"], "q": "105"}
    ).json()[0]
    storages = owner.get("/api/v1/catalogue/storages").json()
    colours = owner.get("/api/v1/catalogue/colours").json()
    return {"brand": nokia, "model": model, "storage": storages[0], "colour": colours[0]}
