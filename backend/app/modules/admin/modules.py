"""Which modules a shop may use (owner 2026-10-29): the basics are always on; the rest follow the
plan unless the product owner sets them by hand for that shop. The API refuses a switched-off
module's routes with 403 `module_off`; the app hides its tiles and buttons."""

from app.core.errors import Forbidden
from app.modules.auth.models import Organisation

# always on, not switchable: stock, sale, purchase, return, khata/parties, payments, invoices,
# ID check, settings, staff, the day's hisaab and dashboard
MODULES: dict[str, dict[str, str]] = {
    "accessories": {"en": "Accessories & watches (counted stock)", "ur": "ایکسیسریز اور گھڑیاں"},
    "repairs": {"en": "Repairs", "ur": "مرمت"},
    "expenses": {"en": "Expenses & day close", "ur": "خرچے اور دن بند"},
    "held_sales": {"en": "Hold a sale", "ur": "سیل ہولڈ"},
    "tax": {"en": "Tax on bills", "ur": "بل پر ٹیکس"},
    "exchange": {"en": "Exchange (old phone in)", "ur": "ایکسچینج"},
    "reports": {"en": "Profit & reports", "ur": "منافع اور رپورٹس"},
    "exports": {"en": "Download & share (PDF / Excel)", "ur": "ڈاؤن لوڈ اور شیئر"},
    "notifications": {
        "en": "WhatsApp messages & reminders",
        "ur": "واٹس ایپ پیغامات اور یاد دہانی",
    },
    "loans": {"en": "Loans to other shops (amanat)", "ur": "امانت (دوسری دکان کو)"},
    "installments": {"en": "Installments (qist)", "ur": "قسطیں"},
    "attendance": {"en": "Staff attendance (hazri)", "ur": "عملے کی حاضری"},
    "ai": {"en": "Assistant & photo reading (AI)", "ur": "اسسٹنٹ اور تصویر پڑھنا (AI)"},
}

PLAN_DEFAULTS: dict[str, list[str]] = {
    "trial": list(MODULES),
    "basic": ["accessories", "expenses", "held_sales", "tax"],
    "pro": [
        "accessories",
        "expenses",
        "held_sales",
        "tax",
        "repairs",
        "exchange",
        "reports",
        "exports",
        "notifications",
        "installments",
        "attendance",
        "ai",
    ],
    "chain": list(MODULES),
}

# API prefix -> module; everything not listed is basic
ROUTE_MODULES: list[tuple[str, str]] = [
    ("/api/v1/accessories", "accessories"),
    ("/api/v1/repairs", "repairs"),
    ("/api/v1/expenses", "expenses"),
    ("/api/v1/sales/held", "held_sales"),
    ("/api/v1/exchanges", "exchange"),
    ("/api/v1/exports", "exports"),
    ("/api/v1/notifications", "notifications"),
    ("/api/v1/loans", "loans"),
    ("/api/v1/installments", "installments"),
    ("/api/v1/attendance", "attendance"),
    ("/api/v1/ai", "ai"),
    # profit & co.; the dashboard, the day's hisaab and stock summary stay basic
    ("/api/v1/reports/profit-loss", "reports"),
    ("/api/v1/reports/cash-flow", "reports"),
    ("/api/v1/reports/tax", "reports"),
    ("/api/v1/reports/stock-ageing", "reports"),
    ("/api/v1/reports/top-sellers", "reports"),
    ("/api/v1/reports/forecast", "reports"),
    ("/api/v1/reports/price-changes", "reports"),
]


def clean(keys: list[str] | None) -> list[str] | None:
    if keys is None:
        return None
    return [k for k in MODULES if k in set(keys)]


def effective(org: Organisation) -> list[str]:
    if org.modules is not None:
        return clean(org.modules) or []
    return list(PLAN_DEFAULTS.get(org.plan, PLAN_DEFAULTS["trial"]))


def module_for(path: str) -> str | None:
    for prefix, key in ROUTE_MODULES:
        if path == prefix or path.startswith((prefix + "/", prefix + "?")):
            return key
    return None


def assert_module(org: Organisation, path: str) -> None:
    key = module_for(path)
    if key and key not in effective(org):
        raise Forbidden(
            code="module_off",
            message_en=f"{MODULES[key]['en']} is not in this shop's plan. Contact the software provider.",
            message_ur=f"{MODULES[key]['ur']} اس دکان کے پلان میں شامل نہیں۔ سافٹ ویئر فراہم کنندہ سے رابطہ کریں۔",
            details={"module": key},
        )
