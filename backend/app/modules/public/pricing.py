"""The prices on the landing page (owner 2026-11-16, ADR-092): monthly price and one-time setup fee
per plan, how many months a year paid at once costs, the trial length, and add-ons sold separately.
The provider edits them in Super admin → Website prices; until then the defaults are the prices that
the owner chose on 2026-11-17 (2,000 / 5,000 / 7,500 a month, setup 5,000 / 8,000 / 15,000,
four service add-ons). These are what a visitor sees — a shop's own
fee stays `organisations.monthly_fee`, set per shop.

Owner 2026-11-17 (ADR-095): the same settings price what a shop chooses when it pays — a module
added on top of a package (`module_prices`, per month; 0 = not sold on its own) and the discount
for paying years ahead (`discount_per_year` per cent for each year, up to `max_years`)."""

import copy
import datetime as dt
from decimal import Decimal

from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.modules.admin.fees import PlatformSetting
from app.modules.admin.modules import MODULES

KEY = "pricing"
PAID = ("basic", "pro", "chain")
DEFAULTS: dict = {
    # owner 2026-11-17: 2,000 / 5,000 / 7,500 a month, and a one-time setup fee
    "prices": {"basic": 2000, "pro": 5000, "chain": 7500},  # PKR per month
    "setup_fee": {"basic": 5000, "pro": 8000, "chain": 15000},  # PKR, one time
    "yearly_paid_months": 10,  # a year paid at once = this many months
    "trial_days": 14,
    # a module added on top of a package, PKR per month (ADR-095). Together they cost more than
    # the next package, so the package stays the better buy. 0 = switched on by the provider only.
    "module_prices": {
        "accessories": 300,
        "repairs": 500,
        "expenses": 300,
        "held_sales": 300,
        "tax": 300,
        "exchange": 300,
        "reports": 500,
        "exports": 300,
        "notifications": 500,
        "loans": 500,
        "installments": 500,
        "attendance": 300,
        "ai": 1000,
        "login_activity": 0,
        "laptops": 0,
        "no_mobiles": 0,
    },
    "discount_per_year": 5,  # per cent off for each year paid at once: 1 year 5 … 5 years 25
    "max_years": 5,
    # a sale for everyone (ADR-098): per cent off the list price of packages and modules, until
    # this day ("" = until switched off); 0 = no sale
    "sale_pct": 0,
    "sale_until": "",
    # [{en, ur, roman, price, per: month | year | once}] — services, not features: every plan's
    # features stay as they are
    "addons": [
        {
            "en": "We enter your old stock for you (from your register or Excel)",
            "ur": "آپ کا پرانا اسٹاک ہم ڈال دیں (رجسٹر یا ایکسل سے)",
            "roman": "Aap ka purana stock hum daal dein (register ya Excel se)",
            "price": 5000,
            "per": "once",
        },
        {
            "en": "Visit to your shop: installation and staff training",
            "ur": "آپ کی دکان پر آ کر انسٹالیشن اور عملے کی ٹریننگ",
            "roman": "Aap ki dukaan par aa kar installation aur staff ki training",
            "price": 5000,
            "per": "once",
        },
        {
            "en": "Offline install on your shop computer (works with no internet)",
            "ur": "دکان کے کمپیوٹر پر آف لائن انسٹال (انٹرنیٹ کے بغیر چلتا ہے)",
            "roman": "Dukaan ke computer par offline install (internet ke baghair chalta hai)",
            "price": 5000,
            "per": "once",
        },
        {
            "en": "Priority support on a phone call",
            "ur": "فون کال پر ترجیحی سپورٹ",
            "roman": "Phone call par tarjeehi support",
            "price": 1000,
            "per": "month",
        },
    ],
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
    module_prices: dict[str, Decimal] = Field(default_factory=dict)
    discount_per_year: int | None = Field(default=None, ge=0, le=15)
    max_years: int | None = Field(default=None, ge=1, le=5)
    sale_pct: int | None = Field(default=None, ge=0, le=90)
    sale_until: dt.date | None = None
    addons: list[Addon] = Field(default_factory=list, max_length=20)


def get(db: Session) -> dict:
    row = db.get(PlatformSetting, KEY)
    value = copy.deepcopy(DEFAULTS)
    if row and isinstance(row.value, dict):
        for k, v in row.value.items():
            if k == "module_prices" and isinstance(v, dict):
                value[k].update({kk: vv for kk, vv in v.items() if kk in MODULES})
            elif isinstance(v, dict) and isinstance(value.get(k), dict):
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
    for key, price in data.module_prices.items():
        if key in MODULES:
            clean["module_prices"][key] = int(max(Decimal(0), price))
    if data.discount_per_year is not None:
        clean["discount_per_year"] = data.discount_per_year
    if data.max_years is not None:
        clean["max_years"] = data.max_years
    if data.sale_pct is not None:
        clean["sale_pct"] = data.sale_pct
        clean["sale_until"] = data.sale_until.isoformat() if data.sale_until else ""
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
