"""The prices on the landing page (owner 2026-11-16, ADR-092): monthly price and one-time setup fee
per plan, how many months a year paid at once costs, the trial length, and add-ons sold separately.
The provider edits them in Super admin → Website prices; until then the defaults are the prices that
were on the page before (no setup fee, no add-ons). These are what a visitor sees — a shop's own
fee stays `organisations.monthly_fee`, set per shop."""

import copy
from decimal import Decimal

from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.modules.admin.fees import PlatformSetting

KEY = "pricing"
PAID = ("basic", "pro", "chain")
DEFAULTS: dict = {
    "prices": {"basic": 1500, "pro": 3000, "chain": 6000},  # PKR per month
    "setup_fee": {"basic": 0, "pro": 0, "chain": 0},  # PKR, one time
    "yearly_paid_months": 10,  # a year paid at once = this many months
    "trial_days": 14,
    "addons": [],  # [{en, ur, roman, price, per: month | year | once}]
}


class Addon(BaseModel):
    en: str = Field(min_length=2, max_length=120)
    ur: str = Field(default="", max_length=120)
    roman: str = Field(default="", max_length=120)
    price: Decimal = Field(ge=0, le=10_000_000)
    per: str = Field(default="once", pattern="^(month|year|once)$")


class PricingIn(BaseModel):
    prices: dict[str, Decimal]
    setup_fee: dict[str, Decimal] = Field(default_factory=dict)
    yearly_paid_months: int = Field(default=10, ge=1, le=12)
    trial_days: int = Field(default=14, ge=0, le=90)
    addons: list[Addon] = Field(default_factory=list, max_length=20)


def get(db: Session) -> dict:
    row = db.get(PlatformSetting, KEY)
    value = copy.deepcopy(DEFAULTS)
    if row and isinstance(row.value, dict):
        for k, v in row.value.items():
            if isinstance(v, dict) and isinstance(value.get(k), dict):
                value[k].update({kk: vv for kk, vv in v.items() if kk in PAID})
            elif k in value:
                value[k] = v
    return value


def set_(db: Session, data: PricingIn) -> dict:
    clean = get(db)
    for plan in PAID:
        if plan in data.prices:
            clean["prices"][plan] = int(max(Decimal(0), data.prices[plan]))
        if plan in data.setup_fee:
            clean["setup_fee"][plan] = int(max(Decimal(0), data.setup_fee[plan]))
    clean["yearly_paid_months"] = data.yearly_paid_months
    clean["trial_days"] = data.trial_days
    clean["addons"] = [
        {
            "en": a.en.strip(),
            "ur": a.ur.strip(),
            "roman": a.roman.strip(),
            "price": int(a.price),
            "per": a.per,
        }
        for a in data.addons
    ]
    row = db.get(PlatformSetting, KEY)
    if row is None:
        db.add(PlatformSetting(key=KEY, value=clean))
    else:
        row.value = clean
    db.commit()
    return clean
