"""Important business insights for the complete report (docs/31 R8): plain sentences read off the
same figures the screens show, each with the numbers it is based on. Rules only — nothing is
guessed, and a rule that has no data says nothing."""

import uuid
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.periods import Period
from app.db.base import ZERO
from app.modules.shopaudit import inventory, products, reconcile, security, service, trade


def _pct(a: Decimal, b: Decimal) -> float | None:
    return round(float(a / b * 100), 1) if b else None


def _n(v) -> str:
    return f"{Decimal(v):,.0f}"


def build(
    db: Session, shop_id: uuid.UUID, shop, p: Period, *, can_cost: bool, is_owner: bool
) -> list[dict]:
    """[{key, level: good | watch | info, text}]"""
    out: list[dict] = []

    def say(key: str, level: str, text: str) -> None:
        out.append({"key": key, "level": level, "text": text})

    o = service.overview(db, shop_id, p, can_cost=can_cost)
    ns, prev_ns = o["sales"]["net_sales"], o["previous"]["net_sales"]
    ch = _pct(ns - prev_ns, prev_ns)
    if ch is not None:
        say(
            "sales_change",
            "good" if ch >= 0 else "watch",
            f"Net sales {_n(ns)}: {'up' if ch >= 0 else 'down'} {abs(ch)}% on the period before "
            f"({_n(prev_ns)}).",
        )
    elif ns:
        say("sales_change", "info", f"Net sales {_n(ns)}; nothing sold in the period before.")
    if can_cost and o["profit"]:
        gp, np_ = o["profit"]["gross_profit"], o["profit"]["net_profit"]
        m = _pct(gp, ns)
        if m is not None:
            say(
                "margin",
                "watch" if m < 10 else "info",
                f"Gross margin {m}% (gross profit {_n(gp)} on net sales {_n(ns)}).",
            )
        say(
            "net_profit",
            "good" if np_ > ZERO else "watch",
            f"Net profit {_n(np_)} after expenses of {_n(o['expenses']['total'])}.",
        )
    s = trade.sales(db, shop_id, p, can_cost=can_cost, limit=1)["totals"]
    credit = _pct(s["on_credit"], s["billed"])
    if credit:
        say(
            "credit_share",
            "watch" if credit >= 30 else "info",
            f"{credit}% of what was billed went on credit ({_n(s['on_credit'])} of "
            f"{_n(s['billed'])}); {_n(s['due'])} of these bills is still due.",
        )
    rec = o["debt"]["receivable"]
    if rec["closing"] != rec["opening"]:
        grew = rec["closing"] > rec["opening"]
        say(
            "receivable",
            "watch" if grew else "good",
            f"People owe the shop {_n(rec['closing'])} at the end, "
            f"{'up' if grew else 'down'} from {_n(rec['opening'])}.",
        )
    pr = products.products(db, shop_id, shop, p, can_cost=can_cost, group="model")
    rows = sorted(pr["rows"], key=lambda r: -Decimal(r["revenue"]))
    if rows:
        top = rows[0]
        say(
            "top_product",
            "info",
            f"Best seller by money: {top['label']} — {top['units']} sold for {_n(top['revenue'])}.",
        )
    age = inventory.ageing(db, shop_id, shop, can_cost=can_cost)
    dead = age["alert_counts"].get("dead_stock", 0)
    if dead:
        say("dead_stock", "watch", f"{dead} phone(s) in stock are past the dead-stock age.")
    slow = age["alert_counts"].get("high_value_slow", 0)
    if slow:
        say("slow_value", "watch", f"{slow} high-value phone(s) are moving slowly.")
    checks = reconcile.checks(db, shop_id, p)
    bad = [c["key"] for c in checks if not c["ok"]]
    say(
        "checks",
        "watch" if bad else "good",
        f"Books check: {len(checks) - len(bad)} of {len(checks)} reconciliation checks pass"
        + (f" (not passing: {', '.join(bad)})." if bad else "."),
    )
    if is_owner:
        feed = security.feed(db, shop_id, shop, p, limit=1)
        flagged = [u["user_name"] for u in feed["by_user"] if u["flags"]]
        if flagged:
            say(
                "security",
                "watch",
                f"Flagged in the security audit: {', '.join(flagged)} (see Security & fraud audit).",
            )
    return out
