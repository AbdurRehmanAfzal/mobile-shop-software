"""Search of the built-in accessories list (accessories shops 2026-11-20, ADR-118).

Two sources, one answer:
* `seeds/accessory_library.py` — kinds of product per brand, read once into memory;
* the phone / tablet / watch / laptop model list — "Back Cover for Samsung Galaxy A56", "Laptop
  Charger for HP EliteBook 840 G5" are made on the fly from the models that match the words typed,
  so every model in the catalogue has its covers, glass, batteries and parts without a stored row.

Read-only: nothing here writes. What the shop picks becomes an ordinary item through the existing
create routes. `have` says how many of the shop's own items already carry that name, so the same
thing is not made twice.
"""

import re
import uuid
from functools import lru_cache

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.modules.accessories.models import Accessory
from app.modules.catalogue.models import Brand, Model
from app.seeds.accessory_library import FOR_MODEL, entries

_WORD = re.compile(r"[a-z0-9.+-]+")
# words that ask for a kind of thing, not for a model
_ASK = {w for words, *_ in FOR_MODEL for w in words} | {"for", "laptop", "mobile", "phone"}


@lru_cache(maxsize=1)
def _static() -> tuple[tuple[str, dict], ...]:
    return tuple((e["name"].lower(), e) for e in entries())


def _tokens(q: str) -> list[str]:
    return _WORD.findall(q.lower())[:8]


def _from_models(db: Session, shop_id: uuid.UUID, words: list[str], limit: int) -> list[dict]:
    """covers, glass, batteries and parts for the models the words name"""
    asked = [w for w in words if w in _ASK]
    named = [w for w in words if w not in _ASK and len(w) >= 2]
    if not named:
        return []
    full = func.lower(Brand.name + " " + Model.name)
    stmt = (
        select(Model, Brand.name)
        .join(Brand, Brand.id == Model.brand_id)
        .where(or_(Model.shop_id.is_(None), Model.shop_id == shop_id), Model.is_active.is_(True))
    )
    for w in named:
        stmt = stmt.where(full.like(f"%{w}%"))
    rows = db.execute(stmt.order_by(func.length(Model.name), Model.name).limit(6)).all()
    out = []
    for m, brand in rows:
        label = m.name if m.name.lower().startswith(brand.lower()) else f"{brand} {m.name}"
        made_for = (
            "laptop" if m.category == "laptop" else "gadget" if m.category == "watch" else "mobile"
        )
        fits = [t for t in FOR_MODEL if m.category in t[5]]
        # the words say which thing ("glass", "battery"); with none, the first few of that device
        wanted = [t for t in fits if any(w in t[0] for w in asked)] if asked else fits[:3]
        for _, name, kind, attr, options, _types in wanted:
            out.append(
                {
                    "name": f"{name} for {label}"[:150],
                    "brand": None,
                    "kind": kind,
                    "made_for": made_for,
                    "details": {"compatible": label[:200]},
                    "variant_by": attr,
                    "variants": options,
                    "model_id": str(m.id),
                }
            )
    return out[:limit]


def kinds() -> list[dict]:
    """the kinds of thing in the built-in list, in the order they are written, with how many lines
    each has — the cards a purchase offers beside the search (ADR-124)"""
    out: dict[str, int] = {}
    for _name, e in _static():
        out[e["kind"]] = out.get(e["kind"], 0) + 1
    return [{"kind": k, "lines": n} for k, n in out.items()]


def search(
    db: Session, shop_id: uuid.UUID, q: str, limit: int = 30, kind: str | None = None
) -> list[dict]:
    words = _tokens(q)
    if not words and not kind:
        return []
    # a kind card was tapped: that kind's lines (narrowed by the words, when there are any)
    found = _from_models(db, shop_id, words, max(6, limit // 2)) if words else []
    if kind:
        found = [e for e in found if e["kind"] == kind]
    hits = [
        (name, e)
        for name, e in _static()
        if all(w in name for w in words) and (not kind or e["kind"] == kind)
    ]
    # the plain kind of product first, then the shorter names (closer to what was typed)
    first = words[0] if words else ""
    hits.sort(key=lambda h: (h[1]["brand"] is not None, not h[0].startswith(first), len(h[0])))
    found += [dict(e) for _, e in hits[: max(0, limit - len(found))]]
    if not found:
        return []
    names = {e["name"].lower() for e in found}
    have = dict(
        db.execute(
            select(func.lower(Accessory.name), func.count(Accessory.id))
            .where(Accessory.shop_id == shop_id, func.lower(Accessory.name).in_(names))
            .group_by(func.lower(Accessory.name))
        ).all()
    )
    for e in found:
        e["have"] = have.get(e["name"].lower(), 0)
    return found


def size() -> int:
    return len(_static())
