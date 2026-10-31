"""Owner security & fraud audit (docs/16 §14 — docs/17 P8): one feed, owner only, of everything
that bends a number or a rule — asking-price changes, sales under the asking or under cost,
discounts, voids, reversals, stock adjustments, opening balances, skipped ID checks, PIN
approvals and wrong PINs — each with who, when, before / after, reason and authorisation.

Nothing here is computed from a new table: the rows come from the immutable device events, the
audit log, the price-change report and the bills themselves."""

import datetime as dt
import uuid
from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.periods import Period, day_end
from app.db.base import ZERO
from app.db.refs import user_name
from app.modules.audit.models import AuditLog
from app.modules.catalogue.models import Brand, Model
from app.modules.devices.models import Device
from app.modules.ledger.service import money
from app.modules.parties.models import Party
from app.modules.payments.models import Payment
from app.modules.purchases.models import Purchase
from app.modules.reports import service as rep
from app.modules.sales.models import Invoice, InvoiceLine, InvoiceStatus
from app.modules.shopaudit.prefs import prefs_for

KINDS = (
    "asking_changed",
    "below_asking",
    "below_cost",
    "discount",
    "void",
    "reversal",
    "stock_adjust",
    "opening_balance",
    "bypass",
    "pin_wrong",
    "delete",
    "security",
    "transfer",
)
# audit-log action -> feed kind
ACTIONS = {
    "void": "void",
    "reverse": "reversal",
    "adjust": "stock_adjust",
    "opening_balance": "opening_balance",
    "override": "bypass",
    "delete": "delete",
    "pin_wrong": "pin_wrong",
    "password_set_by_admin": "security",
    "password_reset_otp": "security",
    "super_admin_access": "security",
    "create_branch": "security",
    "modules": "security",
    "plan": "security",
}
# per-employee counts at or above these make the person "flagged" (shown with the counts)
FLAG_AT = {
    "void": 3,
    "below_asking": 3,
    "below_cost": 2,
    "discount": 5,
    "pin_wrong": 3,
    "asking_changed": 5,
}


def feed(
    db: Session,
    shop_id: uuid.UUID,
    shop,
    p: Period,
    *,
    kind: str | None = None,
    user_id: uuid.UUID | None = None,
    limit: int = 200,
) -> dict:
    prefs = prefs_for(shop)
    rows: list[dict] = []
    names: dict = {}

    def who(uid):
        if uid not in names:
            names[uid] = user_name(db, uid)
        return names[uid]

    # 1. asking-price changes and sales under the asking price (ADR-031 report)
    for r in rep.price_changes(db, shop_id, p.date_from, p.date_to, True)["rows"]:
        rows.append(
            {
                "at": r["at"],
                "kind": r["kind"],
                "user_id": None,
                "user_name": r["user_name"],
                "label": f"{r['label']} · {r['imei1']}",
                "before": r["old_asking"],
                "after": r["new_asking"] if r["kind"] == "asking_changed" else r["sold_price"],
                "amount": r["diff"],
                "reason": r["reason"],
                "approved_by": r["approved_by"],
                "source": r["source"],
                "ref": r["invoice_no"],
                "link": {"type": "device", "id": r["device_id"]},
            }
        )
    # 2. bills: discounts and sales under cost
    inv_rows = db.execute(
        select(Invoice, InvoiceLine, Device.imei1, Brand.name, Model.name)
        .join(InvoiceLine, InvoiceLine.invoice_id == Invoice.id)
        .join(Device, Device.id == InvoiceLine.device_id, isouter=True)
        .join(Brand, Brand.id == Device.brand_id, isouter=True)
        .join(Model, Model.id == Device.model_id, isouter=True)
        .where(
            Invoice.shop_id == shop_id,
            Invoice.date >= p.date_from,
            Invoice.date <= p.date_to,
            Invoice.status != InvoiceStatus.VOID,
        )
    ).all()
    seen_discount: set = set()
    for inv, ln, imei, b, m in inv_rows:
        if inv.discount > ZERO and inv.id not in seen_discount:
            seen_discount.add(inv.id)
            rows.append(
                {
                    "at": inv.created_at,
                    "kind": "discount",
                    "user_id": inv.created_by,
                    "user_name": who(inv.created_by),
                    "label": inv.no,
                    "before": inv.subtotal,
                    "after": inv.total,
                    "amount": inv.discount,
                    "reason": None,
                    "approved_by": None,
                    "source": "checkout",
                    "ref": inv.no,
                    "link": {"type": "invoice", "id": inv.id},
                }
            )
        if ln.kind == "device" and ln.cost > ZERO and ln.line_total < ln.cost:
            rows.append(
                {
                    "at": inv.created_at,
                    "kind": "below_cost",
                    "user_id": inv.created_by,
                    "user_name": who(inv.created_by),
                    "label": f"{b} {m} · {imei}",
                    "before": ln.cost,
                    "after": ln.line_total,
                    "amount": money(ln.line_total - ln.cost),
                    "reason": None,
                    "approved_by": None,
                    "source": "checkout",
                    "ref": inv.no,
                    "link": {"type": "device", "id": ln.device_id},
                }
            )
    # 3. the audit log: voids, reversals, adjustments, opening balances, bypasses, wrong PINs, admin
    logs = db.scalars(
        select(AuditLog)
        .where(
            AuditLog.shop_id == shop_id,
            AuditLog.action.in_(list(ACTIONS)),
            AuditLog.at >= day_end(p.date_from - dt.timedelta(days=1)),
            AuditLog.at < day_end(p.date_to),
        )
        .order_by(AuditLog.at.desc())
    ).all()
    logs += db.scalars(
        select(AuditLog).where(
            AuditLog.shop_id == shop_id,
            AuditLog.entity == "cash_transfer",
            AuditLog.at >= day_end(p.date_from - dt.timedelta(days=1)),
            AuditLog.at < day_end(p.date_to),
        )
    ).all()
    labels = _labels(db, logs)
    for a in logs:
        k = "transfer" if a.entity == "cash_transfer" else ACTIONS.get(a.action, "security")
        after = a.after or {}
        before = a.before or {}
        rows.append(
            {
                "at": a.at,
                "kind": k,
                "user_id": a.user_id,
                "user_name": who(a.user_id),
                "label": labels.get((a.entity, a.entity_id)) or f"{a.entity}",
                "before": before.get("previous")
                or before.get("amount")
                or (None if not before else _short(before)),
                "after": after.get("amount")
                or after.get("previous")
                or (None if not after else _short(after)),
                "amount": after.get("amount"),
                "reason": after.get("reason"),
                "approved_by": None,
                "source": a.entity,
                "ref": after.get("no") or after.get("reversal_group_id"),
                "link": _link(a),
            }
        )
    rows.sort(key=lambda r: str(r["at"]), reverse=True)
    by_user: dict = defaultdict(
        lambda: {"user_name": None, "total": 0, "kinds": defaultdict(int), "flags": []}
    )
    for r in rows:
        u = by_user[r["user_name"] or "—"]
        u["user_name"] = r["user_name"] or "—"
        u["total"] += 1
        u["kinds"][r["kind"]] += 1
    users = []
    for u in by_user.values():
        flags = [k for k, n in FLAG_AT.items() if u["kinds"].get(k, 0) >= n]
        if u["kinds"].get("bypass", 0) >= prefs["bypass_min"]:
            flags.append("bypass")
        users.append(
            {
                "user_name": u["user_name"],
                "total": u["total"],
                "kinds": dict(u["kinds"]),
                "flags": flags,
            }
        )
    users.sort(key=lambda u: (-len(u["flags"]), -u["total"]))
    counts = {k: sum(1 for r in rows if r["kind"] == k) for k in KINDS}
    shown = [
        r
        for r in rows
        if (kind is None or r["kind"] == kind) and (user_id is None or r["user_id"] == user_id)
    ]
    return {
        "period": p.as_dict(),
        "counts": counts,
        "total": len(rows),
        "rows": shown[:limit],
        "by_user": users,
        "flag_at": {**FLAG_AT, "bypass": prefs["bypass_min"]},
        "kinds": list(KINDS),
        "notes": [
            (
                "Every row is an immutable record: a device event, an audit-log entry or a finalised bill. "
                "Nothing in this feed can be edited or deleted from the app."
            ),
            "A finalised bill's amounts cannot be changed; a mistake is a void (shown here) and a new bill.",
            "Login failures are not recorded per user; wrong owner PINs on a price approval are.",
        ],
    }


def _short(d: dict) -> str:
    return ", ".join(f"{k}: {v}" for k, v in list(d.items())[:3])


def _link(a: AuditLog) -> dict | None:
    if a.entity in ("invoice", "device", "party", "purchase", "payment", "expense"):
        return {"type": a.entity, "id": a.entity_id}
    if a.entity == "verification":
        return None
    return None


def _labels(db: Session, logs: list) -> dict:
    out: dict = {}
    by_entity: dict = defaultdict(set)
    for a in logs:
        if a.entity_id:
            by_entity[a.entity].add(a.entity_id)
    if by_entity.get("invoice"):
        for i, no in db.execute(
            select(Invoice.id, Invoice.no).where(Invoice.id.in_(by_entity["invoice"]))
        ).all():
            out[("invoice", i)] = no
    if by_entity.get("purchase"):
        for i, no in db.execute(
            select(Purchase.id, Purchase.no).where(Purchase.id.in_(by_entity["purchase"]))
        ).all():
            out[("purchase", i)] = no
    if by_entity.get("payment"):
        for i, no in db.execute(
            select(Payment.id, Payment.no).where(Payment.id.in_(by_entity["payment"]))
        ).all():
            out[("payment", i)] = no
    if by_entity.get("party"):
        for i, name in db.execute(
            select(Party.id, Party.name).where(Party.id.in_(by_entity["party"]))
        ).all():
            out[("party", i)] = name
    if by_entity.get("device"):
        for i, imei, b, m in db.execute(
            select(Device.id, Device.imei1, Brand.name, Model.name)
            .join(Brand, Brand.id == Device.brand_id)
            .join(Model, Model.id == Device.model_id)
            .where(Device.id.in_(by_entity["device"]))
        ).all():
            out[("device", i)] = f"{b} {m} · {imei}"
    return out
