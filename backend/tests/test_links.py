"""Owner (2026-10-28): print and download inside the Android app. The app asks for a 2-minute link
bound to one address and opens it in Chrome, which cannot send the Authorization header."""

from tests.test_reports_owner import A
from tests.test_returns import _customer, _sell


def _link(owner, path):
    r = owner.post("/api/v1/auth/link", json={"path": path})
    assert r.status_code == 200, r.text
    return r.json()["url"]


def test_receipt_opens_with_a_link_and_prints_itself(client, owner, cat):
    _, inv = _sell(owner, cat, _customer(owner), A, 1000, 1000)
    url = _link(owner, f"/api/v1/sales/{inv['id']}/receipt?format=thermal&autoprint=1")
    r = client.get(url)  # no Authorization header, like Chrome
    assert r.status_code == 200, r.text
    assert inv["no"] in r.text and "print()" in r.text
    # without autoprint the page is unchanged
    plain = client.get(_link(owner, f"/api/v1/sales/{inv['id']}/receipt?format=thermal"))
    assert plain.status_code == 200 and "print()" not in plain.text


def test_download_with_a_link(client, owner, cat):
    _sell(owner, cat, _customer(owner), A, 1000, 1000)
    r = client.get(_link(owner, "/api/v1/exports/sales?format=csv"))
    assert r.status_code == 200 and "attachment" in r.headers["content-disposition"]


def test_link_only_opens_its_own_address(client, owner, cat):
    _, inv = _sell(owner, cat, _customer(owner), A, 1000, 1000)
    url = _link(owner, f"/api/v1/sales/{inv['id']}/receipt?format=thermal")
    assert client.get(url.replace("format=thermal", "format=a4")).status_code == 401
    assert client.get(url.replace("/receipt", "")).status_code == 401
    assert client.post(url).status_code in (401, 405)
    # an ordinary login token is not a link
    assert client.get(f"/api/v1/exports/sales?format=csv&dl={owner.access}").status_code == 401
    # only print pages and downloads, never other addresses or other sites
    for bad in ("/api/v1/me", "/api/v1/auth/link", "https://evil.example/api/v1/exports/x"):
        assert owner.post("/api/v1/auth/link", json={"path": bad}).status_code == 422
