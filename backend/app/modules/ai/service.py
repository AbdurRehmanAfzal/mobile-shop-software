"""The shop assistant and photo reading on Claude (owner 2026-10-30, FR-AI-01/02/04).

Everything the model learns comes from read-only tools scoped to the current shop; the model never
sees another shop and never writes. Costs: one API key for the whole platform (ANTHROPIC_API_KEY),
a per-shop daily call cap (AI_DAILY_LIMIT), low effort, short answers. Photo reading uses the cheap
vision model; the chat uses the main model. Both are env-configurable."""

import base64
import datetime as dt
import json
import re
import uuid
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import today as shop_today
from app.core.config import settings
from app.core.errors import AppError
from app.modules.ai.models import AiUsage
from app.modules.auth.models import Shop

LANG_NAMES = {
    "en": "English",
    "ur": "Urdu (Nastaliq script)",
    "roman": "Roman Urdu (Urdu in Latin letters)",
}


class AiOff(AppError):
    status_code = 503
    code = "ai_off"
    message_en = "The assistant is not switched on for this server yet"
    message_ur = "اس سرور پر اسسٹنٹ ابھی آن نہیں ہے"


class AiLimit(AppError):
    status_code = 429
    code = "ai_limit"
    message_en = "Today's assistant limit for this shop is used up"
    message_ur = "آج کے لیے اس دکان کی اسسٹنٹ حد ختم ہو گئی"


def configured() -> bool:
    return bool(settings.anthropic_api_key)


def _client():
    import anthropic

    return anthropic.Anthropic(api_key=settings.anthropic_api_key, timeout=90.0, max_retries=1)


# ---- quota -----------------------------------------------------------------------------------


def usage_today(db: Session, shop_id: uuid.UUID) -> AiUsage:
    day = shop_today()
    row = db.scalar(select(AiUsage).where(AiUsage.shop_id == shop_id, AiUsage.day == day))
    if row is None:
        row = AiUsage(shop_id=shop_id, day=day)
        db.add(row)
        db.flush()
    return row


def _check(db: Session, shop_id: uuid.UUID) -> AiUsage:
    if not configured():
        raise AiOff()
    row = usage_today(db, shop_id)
    if row.calls >= settings.ai_daily_limit:
        raise AiLimit()
    return row


def _record(db: Session, row: AiUsage, usage) -> None:
    row.calls += 1
    row.input_tokens += int(getattr(usage, "input_tokens", 0) or 0)
    row.output_tokens += int(getattr(usage, "output_tokens", 0) or 0)
    db.commit()


def status(db: Session, shop_id: uuid.UUID) -> dict:
    row = usage_today(db, shop_id)
    db.commit()
    return {
        "configured": configured(),
        "model": settings.ai_model if configured() else None,
        "used_today": row.calls,
        "limit": settings.ai_daily_limit,
    }


# ---- photo reading ---------------------------------------------------------------------------


class CnicRead(BaseModel):
    """The front of a Pakistani CNIC (NADRA identity card)."""

    cnic: str | None = Field(default=None, description="13 digits as printed, e.g. 35202-1234567-1")
    name: str | None = None
    father_name: str | None = Field(default=None, description="Father's or husband's name")
    gender: Literal["M", "F"] | None = None
    dob: str | None = Field(default=None, description="Date of birth DD.MM.YYYY")
    issue: str | None = Field(default=None, description="Date of issue DD.MM.YYYY")
    expiry: str | None = Field(default=None, description="Date of expiry DD.MM.YYYY, or 'lifetime'")


class ImeiRead(BaseModel):
    """A phone box label, a settings screen or the back of a phone."""

    imei1: str | None = Field(default=None, description="15 digits")
    imei2: str | None = Field(default=None, description="15 digits, if a second IMEI is printed")
    serial: str | None = None
    brand: str | None = None
    model: str | None = None
    storage: str | None = Field(default=None, description="e.g. 128GB")
    colour: str | None = None


PROMPTS = {
    "cnic": "Read this Pakistani CNIC front. Copy the fields exactly as printed (Latin letters and digits). Leave a field null when it is not readable.",
    "imei": "Read this phone box label / screen. Copy the IMEI numbers (15 digits each), serial, brand, model, storage and colour exactly as printed. Leave a field null when it is not readable.",
}


def _digits(v: str | None, n: int) -> str | None:
    d = re.sub(r"\D", "", v or "")
    return d if len(d) == n else None


def read_photo(db: Session, shop_id: uuid.UUID, kind: str, data: bytes, media_type: str) -> dict:
    if kind not in PROMPTS:
        raise AppError(code="bad_kind", message_en="Unknown photo kind", message_ur="غلط قسم")
    row = _check(db, shop_id)
    schema = CnicRead if kind == "cnic" else ImeiRead
    resp = _client().messages.parse(
        model=settings.ai_vision_model,
        max_tokens=1024,
        output_config={"effort": "low"},
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": base64.standard_b64encode(data).decode("ascii"),
                        },
                    },
                    {"type": "text", "text": PROMPTS[kind]},
                ],
            }
        ],
        output_format=schema,
    )
    _record(db, row, resp.usage)
    out = resp.parsed_output.model_dump() if resp.parsed_output else {}
    if kind == "cnic" and out.get("cnic"):
        d = _digits(out["cnic"], 13)
        out["cnic"] = f"{d[:5]}-{d[5:12]}-{d[12]}" if d else None
    if kind == "imei":
        out["imei1"] = _digits(out.get("imei1"), 15)
        out["imei2"] = _digits(out.get("imei2"), 15)
    return {"kind": kind, **out}


# ---- the assistant ---------------------------------------------------------------------------


def _json(v) -> str:
    def default(o):
        if isinstance(o, Decimal):
            return str(o)
        if isinstance(o, dt.date | dt.datetime):
            return o.isoformat()
        if isinstance(o, uuid.UUID):
            return str(o)
        return str(o)

    return json.dumps(v, default=default, ensure_ascii=False)


def _date(s: str | None, fallback: dt.date) -> dt.date:
    try:
        return dt.date.fromisoformat((s or "").strip()) if s else fallback
    except ValueError:
        return fallback


def build_tools(db: Session, shop_id: uuid.UUID, can_cost: bool) -> list:
    """Read-only tools over this shop's data. Cost and profit only for owner/manager."""
    from anthropic import beta_tool

    from app.modules.devices import service as devices
    from app.modules.devices.pricing import price_hint
    from app.modules.parties.service import list_parties
    from app.modules.reports import service as reports

    @beta_tool
    def hisaab(date_from: str, date_to: str = "") -> str:
        """The shop's hisaab for a day or a period: phones sold, sales total, cash in hand, udhaar
        given and received, expenses, profit (when allowed), items sold.

        Args:
            date_from: First day, YYYY-MM-DD. Today's date is in the system prompt.
            date_to: Last day, YYYY-MM-DD. Empty = same as date_from.
        """
        a = _date(date_from, shop_today())
        b = _date(date_to, a)
        rep = reports.day_report(db, shop_id, a, can_cost, b)
        items = rep.get("items") or []
        rep = {k: v for k, v in rep.items() if k != "items"}
        rep["items_count"] = len(items)
        rep["items"] = items[:25]
        return _json(rep)

    @beta_tool
    def khata(query: str = "") -> str:
        """Who owes the shop and whom the shop owes (udhaar balances), biggest first.

        Args:
            query: Part of a name or phone number to narrow down; empty for everyone.
        """
        rows = list_parties(db, shop_id, q=query or None, with_balance=not query, limit=200)
        out = [
            {
                "name": p.name,
                "phone": p.phone,
                "kinds": p.kinds,
                "balance": str(p.balance),
                "meaning": "owes the shop"
                if p.balance > 0
                else "shop owes them"
                if p.balance < 0
                else "settled",
            }
            for p in rows
        ]
        out.sort(key=lambda r: -abs(Decimal(r["balance"])))
        return _json(out[:40])

    @beta_tool
    def phone_by_imei(imei: str) -> str:
        """Find a phone by IMEI: what it is, its status (in stock, sold, on loan...), prices (when
        allowed), who has it now, and its recent history.

        Args:
            imei: The 15-digit IMEI (spaces and dashes are fine).
        """
        res = devices.imei_lookup(db, shop_id, imei)
        if not res["found"]:
            return _json({"found": False, "luhn_ok": res["luhn_ok"]})
        d = res["device"]
        keep = [
            "brand_name",
            "model_name",
            "storage_name",
            "colour_name",
            "condition",
            "pta_status",
            "status",
            "verification_status",
            "asking_price",
            "current_party_name",
            "first_seen_at",
        ]
        if can_cost:
            keep.append("cost_price")
        out = {k: d.get(k) for k in keep}
        out["times_bought"] = res["times_bought"]
        out["history"] = devices.history(db, shop_id, d["id"])[:10]
        return _json(out)

    @beta_tool
    def stock() -> str:
        """Phones in stock right now, grouped by brand and model, with counts and value."""
        return _json(reports.stock_summary(db, shop_id, can_cost))

    @beta_tool
    def best_sellers(days: int = 30) -> str:
        """What sold the most in the last N days: phones by model, items by name.

        Args:
            days: How many days back from today (1-365).
        """
        days = max(1, min(int(days), 365))
        t = shop_today()
        return _json(reports.top_sellers(db, shop_id, t - dt.timedelta(days=days - 1), t, can_cost))

    @beta_tool
    def today_overview() -> str:
        """The home-screen numbers: today's sales, receivable/payable totals, stock count and
        worth, pending checks, open repairs, installments due."""
        return _json(reports.dashboard(db, shop_id, can_cost))

    @beta_tool
    def rate(model_name: str) -> str:
        """What this shop sold a phone model for lately (last price, range, median), to help quote a
        price.

        Args:
            model_name: Brand and/or model words, e.g. "Samsung A15" or "iPhone 13".
        """
        from app.modules.catalogue.models import Brand, Model

        words = [w for w in re.split(r"\s+", model_name.strip()) if w]
        stmt = select(Model, Brand.name).join(Brand, Brand.id == Model.brand_id)
        for w in words:
            stmt = stmt.where((Model.name.ilike(f"%{w}%")) | (Brand.name.ilike(f"%{w}%")))
        row = db.execute(stmt.limit(1)).first()
        if row is None:
            return _json({"found": False})
        m, brand = row
        hint = price_hint(db, shop_id, m.id, None, None, can_cost=can_cost)
        return _json({"found": True, "model": f"{brand} {m.name}", **hint})

    return [hisaab, khata, phone_by_imei, stock, best_sellers, today_overview, rate]


def _system(shop: Shop, lang: str) -> str:
    return (
        f"You are the in-app assistant of a Pakistani mobile phone shop called {shop.name}. "
        f"Today is {shop_today().isoformat()} (Asia/Karachi). "
        f"Answer in {LANG_NAMES.get(lang, LANG_NAMES['ur'])}. "
        "Use the tools to look up the shop's own records; never invent numbers or names. "
        "Amounts are rupees: write 'Rs. 45,000' with thousands separators and Latin digits. "
        "Shopkeepers are busy: answer in 2 to 5 short lines, the number first, then one line of "
        "context; a short list when they ask for several people or models. "
        "Use the shop's words: udhaar (credit), khata, hisaab, PTA, box pack. "
        "If the answer is not in the shop's data, say so in one line. Do not give legal or tax "
        "advice beyond the shop's own numbers."
    )


def chat(
    db: Session, shop: Shop, can_cost: bool, history: list[dict], question: str, lang: str
) -> dict:
    row = _check(db, shop.id)
    tools = build_tools(db, shop.id, can_cost)
    messages = [{"role": m["role"], "content": m["content"]} for m in history if m.get("content")]
    messages.append({"role": "user", "content": question})
    runner = _client().beta.messages.tool_runner(
        model=settings.ai_model,
        max_tokens=4000,
        system=_system(shop, lang),
        tools=tools,
        messages=messages,
        output_config={"effort": "low"},
        max_iterations=6,
    )
    used: list[str] = []
    final = None
    in_tok = out_tok = 0
    for message in runner:
        final = message
        in_tok += int(getattr(message.usage, "input_tokens", 0) or 0)
        out_tok += int(getattr(message.usage, "output_tokens", 0) or 0)
        used += [b.name for b in message.content if getattr(b, "type", "") == "tool_use"]
    text = "".join(
        b.text for b in (final.content if final else []) if getattr(b, "type", "") == "text"
    ).strip()
    if final is not None and final.stop_reason == "refusal":
        text = {
            "en": "I cannot help with that.",
            "ur": "میں اس میں مدد نہیں کر سکتا۔",
            "roman": "Main is mein madad nahi kar sakta.",
        }[lang if lang in LANG_NAMES else "ur"]

    class _U:
        input_tokens = in_tok
        output_tokens = out_tok

    _record(db, row, _U)
    return {
        "answer": text,
        "tools": used,
        "used_today": row.calls,
        "limit": settings.ai_daily_limit,
    }
