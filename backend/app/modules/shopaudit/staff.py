"""Staff report (docs/31 R4): one row per employee for the period — what they sold (discounts,
profit, credit, returns), bought, paid in / out, spent — and, for the owner only, the security
counts from the ADR-031 / audit-log feed with the same flags.

Nothing is computed here that another report does not already compute: the figures come from
`trade.sales`, `trade.purchases`, `finance.expenses` and `security.feed`, regrouped by person, so
the staff report always agrees with them."""

import uuid
from collections import defaultdict

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.periods import Period
from app.db.base import ZERO
from app.db.refs import user_name
from app.modules.ledger.service import money
from app.modules.payments.models import Payment
from app.modules.shopaudit import finance, security, trade


def staff(
    db: Session, shop_id: uuid.UUID, shop, p: Period, *, can_cost: bool, is_owner: bool
) -> dict:
    sales = trade.sales(db, shop_id, p, can_cost=can_cost, limit=1)
    buys = trade.purchases(db, shop_id, p, limit=1) if can_cost else None
    spent = finance.expenses(db, shop_id, p)
    feed = security.feed(db, shop_id, shop, p, limit=10**9) if is_owner else None

    rows: dict = defaultdict(lambda: {"user_id": None})

    def row(uid) -> dict:
        r = rows[uid]
        r["user_id"] = uid
        return r

    for u in sales["by_user"]:
        row(u["user_id"])["sales"] = {
            k: u[k]
            for k in (
                "bills",
                "units",
                "billed",
                "discount",
                "on_credit",
                "due",
                "profit",
                "margin_pct",
                "returns",
                "returns_amount",
            )
        }
    for u in (buys or {}).get("by_user", []):
        row(u["user_id"])["purchases"] = {
            k: u[k] for k in ("bills", "phones", "items", "total", "on_credit", "owed")
        }
    for u in spent["by_user"]:
        row(u["user_id"])["expenses"] = {"count": u["count"], "amount": u["amount"]}
    for uid, direction, n, amt in db.execute(
        select(
            Payment.created_by,
            Payment.direction,
            func.count(Payment.id),
            func.coalesce(func.sum(Payment.amount), 0),
        )
        .where(
            Payment.shop_id == shop_id,
            Payment.date >= p.date_from,
            Payment.date <= p.date_to,
            Payment.status != "voided",
        )
        .group_by(Payment.created_by, Payment.direction)
    ).all():
        pay = row(uid).setdefault(
            "payments", {"in_count": 0, "in_amount": ZERO, "out_count": 0, "out_amount": ZERO}
        )
        pay[f"{direction}_count"] += int(n)
        pay[f"{direction}_amount"] = money(pay[f"{direction}_amount"] + money(amt))
    if feed is not None:
        kinds: dict = defaultdict(lambda: defaultdict(int))
        for r in feed["rows"]:
            kinds[r["user_id"]][r["kind"]] += 1
        for uid, k in kinds.items():
            flags = [x for x, n in security.FLAG_AT.items() if k.get(x, 0) >= n]
            if k.get("bypass", 0) >= feed["flag_at"]["bypass"]:
                flags.append("bypass")
            row(uid)["security"] = {"kinds": dict(k), "total": sum(k.values()), "flags": flags}

    out = []
    for uid, r in rows.items():
        r.setdefault("sales", None)
        r.setdefault("purchases", None)
        r.setdefault("expenses", None)
        r.setdefault("payments", None)
        r.setdefault("security", None)
        out.append({**r, "user_name": user_name(db, uid)})
    out.sort(
        key=lambda r: (
            -(len(r["security"]["flags"]) if r["security"] else 0),
            -(r["sales"]["billed"] if r["sales"] else ZERO),
        )
    )
    return {
        "period": p.as_dict(),
        "rows": out,
        "totals": {
            "people": len(out),
            "sales_billed": sales["totals"]["billed"],
            "sales_profit": sales["totals"]["profit"],
            "discount": sales["totals"]["discount"],
            "purchases_total": buys["totals"]["total"] if buys else None,
            "expenses": spent["total"],
        },
        "flag_at": feed["flag_at"] if feed else None,
        "security_shown": feed is not None,
        "notes": [
            (
                "Each column is the same figure as its own report (Sales, Purchases, Expenses, "
                "Security), grouped by the person who recorded it."
            ),
            (
                "Security counts (voids, price changes, sales under asking / cost, skipped ID "
                "checks, wrong PINs, stock adjustments) are shown to the owner only."
            ),
        ],
    }
