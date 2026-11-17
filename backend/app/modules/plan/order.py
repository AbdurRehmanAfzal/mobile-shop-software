"""What a shop chooses when it pays its fee (owner 2026-11-17, ADR-095): a package, extra modules,
add-on services and for how long — one month or one to five years, with a discount that grows with
the years. The prices are the provider's (Super admin → Website prices); the total is always worked
out here, never taken from the app. The chosen order rides on the fee payment as a snapshot and is
applied to the shop only when the provider approves that payment."""

import uuid
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy.orm import Session

from app.core.errors import ValidationFailed
from app.modules.admin import modules as mods
from app.modules.admin import plans
from app.modules.auth.models import Organisation
from app.modules.public import pricing

MAX_DISCOUNT = 90  # per cent, whatever the settings say


def _d(v) -> Decimal:
    return Decimal(str(v or 0))


def durations(p: dict) -> list[dict]:
    """1 month, then 1 … max_years years; every year adds `discount_per_year` per cent"""
    per = int(p.get("discount_per_year", 5))
    out = [{"months": 1, "years": 0, "discount_pct": 0}]
    for y in range(1, int(p.get("max_years", 5)) + 1):
        out.append({"months": 12 * y, "years": y, "discount_pct": min(MAX_DISCOUNT, y * per)})
    return out


def _base(org: Organisation, plan: str, p: dict) -> Decimal:
    """The package's fee for this shop: its own agreed fee for the package it is on, the list
    price for any other."""
    if plan == org.plan and org.monthly_fee and org.monthly_fee > 0:
        return _d(org.monthly_fee)
    return _d(p["prices"][plan])


def _included(org: Organisation, plan: str) -> list[str]:
    return mods.effective(org) if plan == org.plan else list(mods.PLAN_DEFAULTS[plan])


def catalog(db: Session, org: Organisation) -> dict:
    p = pricing.get(db)
    prices = p.get("module_prices", {})
    return {
        "current": {
            "plan": org.plan,
            "modules": mods.effective(org),
            "monthly_fee": org.monthly_fee,
        },
        "packages": [
            {
                "key": k,
                "price": _base(org, k, p),
                "modules": _included(org, k),
                "current": k == org.plan,
            }
            for k in pricing.PAID
        ],
        # price 0 = not sold on its own (the provider switches it on by hand)
        "modules": [
            {"key": k, **names, "price": _d(prices.get(k))} for k, names in mods.MODULES.items()
        ],
        "addons": [{"i": i, **a} for i, a in enumerate(p.get("addons", []))],
        "durations": durations(p),
    }


def quote(
    db: Session,
    org: Organisation,
    *,
    plan: str,
    modules: list[str],
    addons: list[int],
    months: int,
) -> dict:
    p = pricing.get(db)
    if plan not in pricing.PAID:
        raise ValidationFailed(
            code="order_plan",
            message_en="Choose a package",
            message_ur="پیکج چنیں",
        )
    term = next((d for d in durations(p) if d["months"] == months), None)
    if term is None:
        raise ValidationFailed(
            code="order_months",
            message_en="Choose one month or a number of years",
            message_ur="ایک مہینہ یا سال چنیں",
        )
    same = plan == org.plan
    included = _included(org, plan)
    prices = p.get("module_prices", {})
    extras = [
        k for k in mods.MODULES if k in set(modules) and k not in included and _d(prices.get(k)) > 0
    ]
    base = _base(org, plan, p)
    lines = [
        {"kind": "package", "key": plan, "per": "month", "unit": base, "amount": base * months}
    ]
    monthly = base
    for k in extras:
        unit = _d(prices[k])
        monthly += unit
        lines.append(
            {
                "kind": "module",
                "key": k,
                "en": mods.MODULES[k]["en"],
                "ur": mods.MODULES[k]["ur"],
                "per": "month",
                "unit": unit,
                "amount": unit * months,
            }
        )
    recurring = monthly * months
    once = Decimal(0)
    listed = p.get("addons", [])
    for i in sorted(set(addons)):
        if not 0 <= i < len(listed):
            raise ValidationFailed(
                code="order_addon",
                message_en="That add-on is no longer offered. Open the page again.",
                message_ur="یہ ایڈ آن اب دستیاب نہیں۔ صفحہ دوبارہ کھولیں۔",
            )
        a = listed[i]
        unit = _d(a["price"])
        if a["per"] == "month":
            amount = unit * months
            recurring += amount
        elif a["per"] == "year":
            amount = unit * ((months + 11) // 12)
            recurring += amount
        else:
            amount = unit
            once += amount
        lines.append(
            {
                "kind": "addon",
                "key": str(i),
                "en": a["en"],
                "ur": a.get("ur", ""),
                "roman": a.get("roman", ""),
                "per": a["per"],
                "unit": unit,
                "amount": amount,
            }
        )
    # the discount is on what repeats (package, modules, monthly / yearly add-ons), in whole rupees
    discount = (recurring * term["discount_pct"] / 100).quantize(Decimal(1), ROUND_HALF_UP)
    if extras:
        touch, final = True, [k for k in mods.MODULES if k in set(included) | set(extras)]
    elif same:
        touch, final = False, included  # nothing new on the same package: leave the shop as it is
    else:
        touch, final = True, None  # another package as it comes: its modules follow the package
    return {
        "plan": plan,
        "months": months,
        "years": term["years"],
        "discount_pct": term["discount_pct"],
        "lines": lines,
        "monthly": monthly,
        "recurring": recurring,
        "discount": discount,
        "once": once,
        "total": recurring - discount + once,
        "extras": extras,
        "modules": final if final is not None else included,
        "touch_modules": touch,
        "set_modules": final,
    }


def snapshot(q: dict) -> dict:
    """the quote as plain JSON, kept on the payment"""

    def plain(v):
        if isinstance(v, Decimal):
            return str(v)
        if isinstance(v, dict):
            return {k: plain(x) for k, x in v.items()}
        if isinstance(v, list):
            return [plain(x) for x in v]
        return v

    return plain(q)


def apply(db: Session, org: Organisation, snap: dict, *, by: uuid.UUID, months: int) -> None:
    """The provider approved the payment: the shop gets the package, the modules and the monthly
    fee it chose, and `months` more. Nothing is deleted when a package gets smaller — the module's
    screens are hidden, its data stays."""
    plans.set_plan(
        db,
        org,
        by=by,
        plan=snap["plan"] if snap["plan"] in pricing.PAID else None,
        expires_on=None,
        clear_expiry=False,
        extend_months=months or None,
        monthly_fee=_d(snap["monthly"]),
        note=None,
    )
    if snap.get("touch_modules"):
        org.modules = mods.clean(snap.get("set_modules"))
