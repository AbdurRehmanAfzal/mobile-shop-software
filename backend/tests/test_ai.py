"""Owner (2026-10-30): the assistant and photo reading on Claude. The API is faked here; the tools
over the shop's data are exercised for real."""

import io
import json
from types import SimpleNamespace

import pytest

from app.core.config import settings
from app.modules.ai import service as ai
from tests.conftest import login
from tests.test_devices import _stock
from tests.test_purchases import _party

IMEI = "490154203237518"


class FakeUsage:
    input_tokens = 120
    output_tokens = 40


class FakeClient:
    """messages.parse → a CNIC; beta.messages.tool_runner → one text answer (it calls the first tool
    itself so the loop's bookkeeping is covered)."""

    def __init__(self):
        self.calls: list[dict] = []
        self.messages = SimpleNamespace(parse=self._parse)
        self.beta = SimpleNamespace(messages=SimpleNamespace(tool_runner=self._runner))

    def _parse(self, **kw):
        self.calls.append({"parse": kw})
        schema = kw["output_format"]
        if schema is ai.CnicRead:
            parsed = ai.CnicRead(
                cnic="35202 1234567 1",
                name="AHMED KHAN",
                father_name="RASHID",
                gender="M",
                dob="01.01.1990",
                issue="05.05.2020",
                expiry="05.05.2030",
            )
        else:
            parsed = ai.ImeiRead(
                imei1="49-0154-203237-518",
                imei2=None,
                brand="Nokia",
                model="105",
                storage=None,
                colour="Black",
            )
        return SimpleNamespace(parsed_output=parsed, usage=FakeUsage())

    def _runner(self, **kw):
        self.calls.append({"runner": kw})
        tool = kw["tools"][0]
        text = f"Tool says: {tool.call({'date_from': '2026-01-01', 'date_to': ''})[:40]}"
        msg = SimpleNamespace(
            content=[
                SimpleNamespace(type="tool_use", name=tool.name),
                SimpleNamespace(type="text", text=text),
            ],
            stop_reason="end_turn",
            usage=FakeUsage(),
        )
        return iter([msg])


@pytest.fixture()
def fake(monkeypatch):
    c = FakeClient()
    monkeypatch.setattr(settings, "anthropic_api_key", "sk-test")
    monkeypatch.setattr(settings, "ai_daily_limit", 3)
    monkeypatch.setattr(ai, "_client", lambda: c)
    return c


def test_status_off_and_chat_refused_without_key(owner):
    s = owner.get("/api/v1/ai/status").json()
    assert s["configured"] is False and s["used_today"] == 0
    r = owner.post("/api/v1/ai/chat", json={"question": "aaj kitna becha?"})
    assert r.status_code == 503 and r.json()["error"]["code"] == "ai_off"


def test_tools_read_the_shop(owner, db, cat):
    c = _party(owner, name="Ahmed Khan", phone="03219876543", kinds=("customer",))
    d = _stock(owner, cat, imei=IMEI, condition="box_pack", cost_price=800, asking_price=1000)
    owner.post(
        "/api/v1/sales",
        json={"party_id": c["id"], "devices": [{"device_id": d["id"], "price": 1000}], "paid": 400},
    )
    from app.modules.auth.models import Shop

    shop = db.get(Shop, __import__("uuid").UUID(owner.shop_id))
    tools = {t.name: t for t in ai.build_tools(db, shop.id, can_cost=True)}
    assert set(tools) == {
        "hisaab",
        "khata",
        "phone_by_imei",
        "stock",
        "best_sellers",
        "today_overview",
        "rate",
    }
    rep = json.loads(tools["hisaab"].call({"date_from": "", "date_to": ""}))
    assert rep["phones_sold"] == 1 and rep["sales_total"] == "1000.00"
    kh = json.loads(tools["khata"].call({"query": ""}))
    assert (
        kh[0]["name"] == "Ahmed Khan"
        and kh[0]["balance"] == "600.00"
        and kh[0]["meaning"] == "owes the shop"
    )
    ph = json.loads(tools["phone_by_imei"].call({"imei": IMEI}))
    assert (
        ph["status"] == "sold"
        and ph["cost_price"] == "800.00"
        and ph["current_party_name"] == "Ahmed Khan"
    )
    # no cost for a salesman's tools
    salesman_tools = {t.name: t for t in ai.build_tools(db, shop.id, can_cost=False)}
    assert "cost_price" not in json.loads(salesman_tools["phone_by_imei"].call({"imei": IMEI}))
    rt = json.loads(tools["rate"].call({"model_name": "Nokia 105"}))
    assert rt["found"] is True and rt["last"]["price"] == "1000.00"


def test_chat_and_photo_with_fake_api(owner, client, cat, fake):
    s = owner.get("/api/v1/ai/status").json()
    assert s["configured"] is True and s["limit"] == 3
    r = owner.post("/api/v1/ai/chat", json={"question": "aaj kitna becha?", "lang": "roman"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert (
        body["answer"].startswith("Tool says:")
        and body["tools"] == ["hisaab"]
        and body["used_today"] == 1
    )
    runner_kw = fake.calls[-1]["runner"]
    assert runner_kw["model"] == settings.ai_model and "Roman Urdu" in runner_kw["system"]
    assert runner_kw["messages"][-1] == {"role": "user", "content": "aaj kitna becha?"}

    r = owner.post(
        "/api/v1/ai/read-photo?kind=cnic",
        files={"file": ("id.jpg", io.BytesIO(b"\xff\xd8jpegbytes"), "image/jpeg")},
    )
    assert r.status_code == 200, r.text
    assert r.json()["cnic"] == "35202-1234567-1" and r.json()["name"] == "AHMED KHAN"
    assert fake.calls[-1]["parse"]["model"] == settings.ai_vision_model
    r = owner.post(
        "/api/v1/ai/read-photo?kind=imei",
        files={"file": ("box.jpg", io.BytesIO(b"\xff\xd8jpegbytes"), "image/jpeg")},
    )
    assert r.json()["imei1"] == IMEI and r.json()["brand"] == "Nokia"

    # the daily cap: three calls made, the fourth is refused; a staff member shares the shop's cap
    owner.post(
        "/api/v1/staff",
        json={"name": "Ali", "phone": "03211234567", "password": "secret123", "role": "salesman"},
    )
    ali = login(client, "03211234567")
    r = ali.post("/api/v1/ai/chat", json={"question": "stock?"})
    assert r.status_code == 429 and r.json()["error"]["code"] == "ai_limit"
    assert owner.get("/api/v1/ai/status").json()["used_today"] == 3
