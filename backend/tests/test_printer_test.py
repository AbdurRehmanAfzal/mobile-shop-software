"""Owner 2026-11-20 (ADR-119): the printer test page — the paper size the shop prints on, a frame,
a ruler and a barcode; for any login of the shop; nothing of the shop's data on it."""

from tests.conftest import login


def test_printer_test_pages(owner, client):
    r = owner.get("/api/v1/labels/printer-test?kind=sticker&size=60x40&lang=en")
    assert r.status_code == 200, r.text
    assert (
        "@page{size:60mm 40mm;margin:0}" in r.text
        and "<svg" in r.text
        and "MS-TEST-12345" in r.text
    )
    assert "The whole frame must be on the paper." in r.text
    # a short sticker keeps only the heading, the barcode and its number
    short = owner.get("/api/v1/labels/printer-test?kind=sticker&w=48&h=18&lang=en").text
    assert (
        "@page{size:48.0mm 18.0mm;margin:0}" in short
        and "The whole frame" not in short
        and "<svg" in short
    )
    slip = owner.get("/api/v1/labels/printer-test?kind=receipt&lang=en").text
    assert "@page{size:80mm auto;margin:0}" in slip and "your printer is ready" in slip
    a4 = owner.get("/api/v1/labels/printer-test?kind=a4&lang=ur").text
    assert "@page{size:A4;margin:10mm}" in a4 and 'dir="rtl"' in a4 and "پرنٹر ٹیسٹ" in a4
    # the shop's language when none is asked; bad sizes and kinds refused
    assert 'lang="ur"' in owner.get("/api/v1/labels/printer-test?kind=a4").text
    assert owner.get("/api/v1/labels/printer-test?kind=sticker&size=99x99").status_code == 422
    assert owner.get("/api/v1/labels/printer-test?kind=sticker&w=5&h=5").status_code == 422
    assert owner.get("/api/v1/labels/printer-test?kind=fax").status_code == 422
    assert client.get("/api/v1/labels/printer-test?kind=a4").status_code == 401
    # a salesman prints stickers and slips too
    owner.post(
        "/api/v1/staff",
        json={"name": "Ali", "phone": "03211234567", "password": "secret123", "role": "salesman"},
    )
    assert (
        login(client, "03211234567").get("/api/v1/labels/printer-test?kind=receipt").status_code
        == 200
    )
