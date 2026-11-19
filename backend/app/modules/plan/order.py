"""What a shop chooses when it pays its fee (owner 2026-11-17, ADR-095): a package, extra modules,
add-on services and for how long — one month or one to five years, with a discount that grows with
the years. The prices are the provider's (Super admin → Website prices); the total is always worked
out here, never taken from the app. The chosen order rides on the fee payment as a snapshot and is
applied to the shop only when the provider approves that payment.

Owner 2026-11-17 (ADR-098): two more prices feed the same quote —
- a **special price for one shop** (`organisations.fee_deal`: a package at an agreed fee for a
  number of months, or with no end). The shop still sees the list price, crossed out, beside its
  own; months beyond the agreed ones cost the usual price; approving a payment uses the months up.
- a **sale for everyone** (`pricing.sale_pct` until `sale_until`): that much off the list price of
  packages and modules. It never touches a shop's own agreed fee or special price."""

import datetime as dt
import uuid
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy.orm import Session

from app.core.clock import today as shop_today
from app.core.errors import ValidationFailed
from app.modules.admin import modules as mods
from app.modules.admin import plans
from app.modules.auth.models import Organisation
from app.modules.public import pricing

MAX_DISCOUNT = 90  # per cent, whatever the settings say


def _d(v) -> Decimal:
    return Decimal(str(v or 0))


def _rupees(v: Decimal) -> Decimal:
    return v.quantize(Decimal(1), ROUND_HALF_UP)


def durations(p: dict) -> list[dict]:
    """1 month, then 1 … max_years years; every year adds `discount_per_year` per cent"""
    per = int(p.get("discount_per_year", 5))
    out = [{"months": 1, "years": 0, "discount_pct": 0}]
    for y in range(1, int(p.get("max_years", 5)) + 1):
        out.append({"months": 12 * y, "years": y, "discount_pct": min(MAX_DISCOUNT, y * per)})
    return out


def sale_pct(p: dict, today: dt.date | None = None) -> int:
    """the sale running today, in per cent (0 = none)"""
    pct = int(p.get("sale_pct") or 0)
    until = p.get("sale_until") or None
    if pct <= 0:
        return 0
    if until:
        try:
            if dt.date.fromisoformat(str(until)[:10]) < (today or shop_today()):
                return 0
        except ValueError:
            return 0
    return min(MAX_DISCOUNT, pct)


def _off(v: Decimal, pct: int) -> Decimal:
    return _rupees(v * (100 - pct) / 100) if pct else v


def deal_for(org: Organisation, plan: str) -> dict | None:
    """this shop's special price for the package, while it has months left (None = no end)"""
    d = org.fee_deal or None
    if not d or d.get("plan") != plan:
        return None
    left = d.get("months_left")
    if left is not None and int(left) <= 0:
        return None
    return {"price": _d(d.get("price")), "months_left": None if left is None else int(left)}


def _regular(org: Organisation, plan: str, p: dict, sale: int) -> Decimal:
    """The package's usual fee for this shop: its own agreed fee for the package it is on (never
    a sale on top), the list price — less a running sale — for any other. A package that has, or
    had, a special price goes back to the list price when the special months are over."""
    had_deal = bool(org.fee_deal) and org.fee_deal.get("plan") == plan
    if plan == org.plan and org.monthly_fee and org.monthly_fee > 0 and not had_deal:
        return _d(org.monthly_fee)
    return _off(_d(p["prices"][plan]), sale)


def _included(org: Organisation, plan: str) -> list[str]:
    return mods.effective(org) if plan == org.plan else list(mods.PLAN_DEFAULTS[plan])


def catalog(db: Session, org: Organisation) -> dict:
    p = pricing.get(db)
    sale = sale_pct(p)
    prices = p.get("module_prices", {})
    packages = []
    for k in pricing.PAID:
        deal = deal_for(org, k)
        packages.append(
            {
                "key": k,
                "list_price": _d(p["prices"][k]),
                # what a month of it costs this shop now
                "price": deal["price"] if deal else _regular(org, k, p, sale),
                "deal_months_left": deal["months_left"] if deal else None,
                "deal": bool(deal),
                "modules": _included(org, k),
                "current": k == org.plan,
            }
        )
    d = org.fee_deal or None
    return {
        "current": {
            "plan": org.plan,
            "modules": mods.effective(org),
            "monthly_fee": org.monthly_fee,
        },
        "packages": packages,
        # price 0 = not sold on its own (the provider switches it on by hand)
        "modules": [
            {
                "key": k,
                **names,
                "list_price": _d(prices.get(k)),
                "price": _off(_d(prices.get(k)), sale),
            }
            for k, names in mods.MODULES.items()
        ],
        "addons": [{"i": i, **a} for i, a in enumerate(p.get("addons", []))],
        "durations": durations(p),
        "sale": {"pct": sale, "until": p.get("sale_until") or None} if sale else None,
        "deal": (
            {
                "plan": d["plan"],
                "price": _d(d.get("price")),
                "months_left": d.get("months_left"),
                "note": d.get("note"),
            }
            if d and deal_for(org, d.get("plan"))
            else None
        ),
    }


def quote(
    db: Session,
    org: Organisation,
    *,
    plan: str,
    modules: list[str],
    addons: list[int],
    months: int,
    any_months: bool = False,
) -> dict:
    """`any_months`: the provider may give any number of months (1–60); a shop picks from the list"""
    p = pricing.get(db)
    if plan not in pricing.PAID:
        raise ValidationFailed(
            code="order_plan",
            message_en="Choose a package",
            message_ur="پیکج چنیں",
        )
    term = next((d for d in durations(p) if d["months"] == months), None)
    if term is None and any_months and 1 <= months <= 60:
        years = min(months // 12, int(p.get("max_years", 5)))
        term = {
            "months": months,
            "years": months // 12,
            "discount_pct": min(MAX_DISCOUNT, years * int(p.get("discount_per_year", 5))),
        }
    if term is None:
        raise ValidationFailed(
            code="order_months",
            message_en="Choose one month or a number of years",
            message_ur="ایک مہینہ یا سال چنیں",
        )
    sale = sale_pct(p)
    same = plan == org.plan
    included = _included(org, plan)
    prices = p.get("module_prices", {})
    extras = [
        k for k in mods.MODULES if k in set(modules) and k not in included and _d(prices.get(k)) > 0
    ]
    list_price = _d(p["prices"][plan])
    regular = _regular(org, plan, p, sale)
    deal = deal_for(org, plan)
    # the special price covers the months it has left; the rest of the order costs the usual fee
    deal_months = 0
    if deal:
        deal_months = months if deal["months_left"] is None else min(months, deal["months_left"])
    package = (deal["price"] * deal_months if deal else Decimal(0)) + regular * (
        months - deal_months
    )
    first = deal["price"] if deal_months else regular
    lines = [{"kind": "package", "key": plan, "per": "month", "unit": first, "amount": package}]
    extra_monthly = Decimal(0)
    for k in extras:
        unit = _off(_d(prices[k]), sale)
        extra_monthly += unit
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
    recurring = package + extra_monthly * months
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
    discount = _rupees(recurring * term["discount_pct"] / 100)
    if extras:
        touch, final = True, [k for k in mods.MODULES if k in set(included) | set(extras)]
    elif same:
        touch, final = False, included  # nothing new on the same package: leave the shop as it is
    else:
        touch, final = True, None  # another package as it comes: its modules follow the package
    # the monthly fee the shop is on after this order: its special price while months of it remain
    left_after = None
    if deal and deal["months_left"] is not None:
        left_after = deal["months_left"] - deal_months
    still_deal = bool(deal) and (deal["months_left"] is None or left_after > 0)
    base_after = deal["price"] if still_deal else _regular(org, plan, p, 0)
    return {
        "plan": plan,
        "months": months,
        "years": term["years"],
        "discount_pct": term["discount_pct"],
        "lines": lines,
        "list_price": list_price,
        "monthly": base_after + sum((_d(prices[k]) for k in extras), Decimal(0)),
        # what the first month of this order costs (the figure the shop reads as "per month")
        "per_month": first + extra_monthly,
        "recurring": recurring,
        "discount": discount,
        "once": once,
        "total": recurring - discount + once,
        "sale_pct": sale,
        "deal_price": deal["price"] if deal_months else None,
        "deal_months": deal_months,
        # against the list price of the package, before the discount for years
        "saved": max(Decimal(0), list_price * months - package),
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
    screens are hidden, its data stays. Months bought at the shop's special price are used up."""
    # ADR-109: what only the provider switches (laptops, login activity, "without mobiles") is
    # not part of any package, so a package order never takes it away
    by_hand = [k for k in mods.effective(org) if k in mods.OPT_IN]
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
        chosen = mods.clean(snap.get("set_modules"))
        if by_hand:
            base = chosen if chosen is not None else mods.PLAN_DEFAULTS.get(org.plan, [])
            chosen = mods.clean([*base, *by_hand])
        org.modules = chosen
    used = int(snap.get("deal_months") or 0)
    deal = org.fee_deal or None
    if used and deal and deal.get("plan") == snap["plan"] and deal.get("months_left") is not None:
        # a new dict, so the JSON column is seen as changed
        org.fee_deal = {**deal, "months_left": max(0, int(deal["months_left"]) - used)}


def set_deal(
    db: Session,
    org: Organisation,
    *,
    by: uuid.UUID,
    shop_id: uuid.UUID,
    plan: str,
    price: Decimal,
    months: int | None,
    note: str | None,
) -> dict:
    """the provider gives this shop a package at a special price for `months` (None = no end)"""
    from app.modules.audit.service import record_audit

    before = org.fee_deal
    org.fee_deal = {
        "plan": plan,
        "price": str(_rupees(_d(price))),
        "months": months,
        "months_left": months,
        "note": (note or "").strip() or None,
        "set_on": shop_today().isoformat(),
    }
    record_audit(
        db,
        shop_id=shop_id,
        user_id=by,
        entity="organisation",
        entity_id=org.id,
        action="fee_deal",
        before=before,
        after=org.fee_deal,
    )
    db.commit()
    return org.fee_deal


def clear_deal(db: Session, org: Organisation, *, by: uuid.UUID, shop_id: uuid.UUID) -> None:
    from app.modules.audit.service import record_audit

    if org.fee_deal is None:
        return
    record_audit(
        db,
        shop_id=shop_id,
        user_id=by,
        entity="organisation",
        entity_id=org.id,
        action="fee_deal_removed",
        before=org.fee_deal,
        after=None,
    )
    deal = org.fee_deal
    org.fee_deal = None
    # the shop was paying the special price as its monthly fee: back to the list price
    if org.plan == deal.get("plan") and org.monthly_fee == _d(deal.get("price")):
        org.monthly_fee = _d(pricing.get(db)["prices"].get(org.plan, org.monthly_fee))
    db.commit()
