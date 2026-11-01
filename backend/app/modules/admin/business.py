"""The provider console (docs/28): what the product owner earns and who uses what — collections by
month, channel and plan, MRR, pending / upcoming / overdue fees, every shop's plan, time left, paid
total, last payment and channel, cloud vs one-PC install and when it was last used, and the license
keys. Read-only over `organisations`, `fee_payments` and `license_keys`."""

import datetime as dt
import uuid
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.clock import today as shop_today
from app.core.periods import day_start
from app.db.base import ZERO, utcnow
from app.modules.admin import plans
from app.modules.admin.fees import APPROVED, PENDING, FeePayment
from app.modules.admin.licenses import ISSUED, REDEEMED, REVOKED, LicenseKey
from app.modules.auth.models import Organisation, Shop
from app.modules.ledger.service import money

ONLINE_MINUTES = 10
PAID_PLANS = ("basic", "pro", "chain")


def _aware(t: dt.datetime | None) -> dt.datetime | None:
    if t is not None and t.tzinfo is None:
        return t.replace(tzinfo=dt.UTC)
    return t


def _home_shops(db: Session) -> dict[uuid.UUID, Shop]:
    """the first shop of every organisation (the one the admin list shows)"""
    out: dict[uuid.UUID, Shop] = {}
    for s in db.scalars(select(Shop).order_by(Shop.created_at)).all():
        out.setdefault(s.organisation_id, s)
    return out


def usage(org: Organisation, now: dt.datetime | None = None) -> dict:
    now = now or utcnow()
    last = _aware(org.last_active_at)
    seen = _aware(org.install_last_seen_at)
    deployment = org.deployment or "cloud"
    if deployment == "local":
        online = bool(seen and now - seen <= dt.timedelta(minutes=ONLINE_MINUTES * 6))
        last_used = seen
    else:
        online = bool(last and now - last <= dt.timedelta(minutes=ONLINE_MINUTES))
        last_used = last
    return {"deployment": deployment, "online": online, "last_used_at": last_used, "install_version": org.install_version}


def channel(method: str | None) -> str:
    """one name per channel: "Easypaisa", "easypaisa " and "EasyPaisa" are the same"""
    return " ".join((method or "").split()).lower()


def _month_key(d: dt.date) -> str:
    return f"{d.year}-{d.month:02d}"


def overview(db: Session) -> dict:
    now = utcnow()
    today = shop_today()
    month_start = today.replace(day=1)
    prev_start = (month_start - dt.timedelta(days=1)).replace(day=1)
    orgs = db.scalars(select(Organisation).where(Organisation.is_active.is_(True))).all()
    from app.modules.plan import billing

    sched = billing.schedule(db)
    counts = {"total": 0, "paid": 0, "trial": 0, "unlimited": 0, "due_soon": 0, "expired": 0, "locked": 0, "cloud": 0, "local": 0, "online_now": 0, "active_today": 0, "active_7d": 0}
    mrr = ZERO
    coming_30 = ZERO
    coming_30_n = 0
    coming_7 = ZERO
    coming_7_n = 0
    overdue = ZERO
    overdue_n = 0
    by_plan: dict[str, dict] = {}
    for o in orgs:
        counts["total"] += 1
        info = plans.plan_info(o, with_pending=False, sched=sched)
        st = info["status"]
        if st in counts:
            counts[st] += 1
        fee = money(o.monthly_fee or ZERO)
        g = by_plan.setdefault(o.plan, {"plan": o.plan, "shops": 0, "mrr": ZERO})
        g["shops"] += 1
        if o.plan == "trial":
            counts["trial"] += 1
        elif o.plan in PAID_PLANS:
            counts["paid"] += 1
            if st not in ("expired", "locked") and fee > ZERO:
                mrr += fee
                g["mrr"] = money(g["mrr"] + fee)
        left = info["days_left"]
        if fee > ZERO and left is not None:
            if 0 <= left <= 30:
                coming_30 += fee
                coming_30_n += 1
                if left <= 7:
                    coming_7 += fee
                    coming_7_n += 1
            elif left < 0:
                overdue += fee
                overdue_n += 1
        u = usage(o, now)
        counts["local" if u["deployment"] == "local" else "cloud"] += 1
        if u["online"]:
            counts["online_now"] += 1
        lu = u["last_used_at"]
        if lu and lu >= day_start(today):
            counts["active_today"] += 1
        if lu and now - lu <= dt.timedelta(days=7):
            counts["active_7d"] += 1

    approved = select(FeePayment).where(FeePayment.status == APPROVED)
    rows = db.scalars(approved).all()
    total = month = prev = ZERO
    by_channel: dict[str, dict] = {}
    monthly: dict[str, Decimal] = {}
    first12 = (month_start.replace(year=month_start.year - 1) if month_start.month == 12 else month_start.replace(year=month_start.year - 1, month=month_start.month + 1))
    for p in rows:
        amt = money(p.amount)
        total += amt
        day = p.paid_on or (_aware(p.handled_at) or _aware(p.created_at)).date()
        if day >= month_start:
            month += amt
        elif day >= prev_start:
            prev += amt
        c = by_channel.setdefault(channel(p.method), {"method": channel(p.method), "count": 0, "amount": ZERO})
        c["count"] += 1
        c["amount"] = money(c["amount"] + amt)
        if day >= first12:
            monthly[_month_key(day)] = money(monthly.get(_month_key(day), ZERO) + amt)
    series = []
    d = first12
    for _ in range(12):
        series.append({"month": _month_key(d), "amount": monthly.get(_month_key(d), ZERO)})
        d = (d.replace(day=28) + dt.timedelta(days=4)).replace(day=1)
    pend = db.execute(select(func.count(FeePayment.id), func.coalesce(func.sum(FeePayment.amount), 0)).where(FeePayment.status == PENDING)).one()
    keys = dict(db.execute(select(LicenseKey.status, func.count(LicenseKey.id)).group_by(LicenseKey.status)).all())
    paying = len({p.organisation_id for p in rows})
    return {
        "counts": counts,
        "paying_shops": paying,
        "mrr": money(mrr),
        "arpu": money(mrr / counts["paid"]) if counts["paid"] else ZERO,
        "collected_total": money(total),
        "collected_month": money(month),
        "collected_prev_month": money(prev),
        "pending_count": pend[0] or 0,
        "pending_amount": money(Decimal(str(pend[1] or 0))),
        "coming_7": {"count": coming_7_n, "amount": money(coming_7)},
        "coming_30": {"count": coming_30_n, "amount": money(coming_30)},
        "overdue": {"count": overdue_n, "amount": money(overdue)},
        "by_channel": sorted(by_channel.values(), key=lambda c: -c["amount"]),
        "by_plan": sorted(by_plan.values(), key=lambda g: -g["shops"]),
        "monthly": series,
        "keys": {"issued": keys.get(ISSUED, 0), "redeemed": keys.get(REDEEMED, 0), "revoked": keys.get(REVOKED, 0)},
    }


def shops(db: Session, q: str | None = None, deployment: str | None = None, status: str | None = None) -> list[dict]:
    """one row per customer (organisation): plan, time left, fees, payments, usage, keys"""
    from app.modules.plan import billing

    sched = billing.schedule(db)
    now = utcnow()
    home = _home_shops(db)
    paid = {
        oid: (n, money(Decimal(str(s or 0))))
        for oid, n, s in db.execute(
            select(FeePayment.organisation_id, func.count(FeePayment.id), func.sum(FeePayment.amount))
            .where(FeePayment.status == APPROVED)
            .group_by(FeePayment.organisation_id)
        ).all()
    }
    pending = {
        oid: money(Decimal(str(s or 0)))
        for oid, s in db.execute(
            select(FeePayment.organisation_id, func.sum(FeePayment.amount))
            .where(FeePayment.status == PENDING)
            .group_by(FeePayment.organisation_id)
        ).all()
    }
    last: dict[uuid.UUID, FeePayment] = {}
    for p in db.scalars(select(FeePayment).where(FeePayment.status == APPROVED).order_by(FeePayment.created_at)).all():
        last[p.organisation_id] = p
    keys: dict[uuid.UUID, dict] = {}
    for oid, st, n in db.execute(select(LicenseKey.organisation_id, LicenseKey.status, func.count(LicenseKey.id)).group_by(LicenseKey.organisation_id, LicenseKey.status)).all():
        keys.setdefault(oid, {})[st] = n
    out = []
    for o in db.scalars(select(Organisation).where(Organisation.is_active.is_(True))).all():
        s = home.get(o.id)
        if s is None:
            continue
        if q and q.lower() not in f"{o.name} {s.name} {s.city or ''} {s.phone or ''}".lower():
            continue
        info = plans.plan_info(o, with_pending=False, sched=sched)
        u = usage(o, now)
        if deployment and u["deployment"] != deployment:
            continue
        if status and info["status"] != status and not (status == "due" and info["status"] in ("due_soon", "expired")):
            continue
        lp = last.get(o.id)
        n, total = paid.get(o.id, (0, ZERO))
        k = keys.get(o.id, {})
        out.append({
            "organisation_id": str(o.id),
            "shop_id": str(s.id),
            "name": s.name,
            "city": s.city,
            "phone": s.phone,
            "plan": o.plan,
            "plan_status": info["status"],
            "plan_expires_at": o.plan_expires_at,
            "days_left": info["days_left"],
            "monthly_fee": money(o.monthly_fee or ZERO),
            "paid_total": total,
            "payments": n,
            "pending_amount": pending.get(o.id, ZERO),
            "last_payment_at": (lp.paid_on or _aware(lp.handled_at).date()) if lp else None,
            "last_payment_amount": money(lp.amount) if lp else None,
            "last_channel": channel(lp.method) if lp else None,
            **u,
            "keys_unused": k.get(ISSUED, 0),
            "keys_total": sum(k.values()),
            "created_at": o.created_at,
        })
    rank = {"locked": 0, "expired": 1, "due_soon": 2, "ok": 3, "unlimited": 4}
    out.sort(key=lambda r: (rank.get(r["plan_status"], 5), r["days_left"] if r["days_left"] is not None else 99999))
    return out


def payments(db: Session, method: str | None, status: str | None, q: str | None, d_from: dt.date | None, d_to: dt.date | None, limit: int = 500) -> dict:
    stmt = (
        select(FeePayment, Shop.name, Organisation.plan)
        .join(Shop, Shop.id == FeePayment.shop_id)
        .join(Organisation, Organisation.id == FeePayment.organisation_id)
        .order_by(FeePayment.created_at.desc())
    )
    if method:
        stmt = stmt.where(func.lower(func.trim(FeePayment.method)) == channel(method))
    if status:
        stmt = stmt.where(FeePayment.status == status)
    rows = []
    total = ZERO
    for p, shop_name, plan in db.execute(stmt.limit(limit)).all():
        day = p.paid_on or (_aware(p.handled_at) or _aware(p.created_at)).date()
        if d_from and day < d_from or d_to and day > d_to:
            continue
        if q and q.lower() not in f"{shop_name} {p.reference or ''} {p.receipt_no or ''}".lower():
            continue
        rows.append({
            "id": str(p.id), "shop_id": str(p.shop_id), "shop_name": shop_name, "plan": plan,
            "amount": money(p.amount), "method": channel(p.method), "reference": p.reference, "months": p.months,
            "status": p.status, "paid_on": day, "created_at": p.created_at, "receipt_no": p.receipt_no,
            "note": p.note, "decision_note": p.decision_note,
        })
        if p.status == APPROVED:
            total += money(p.amount)
    methods = sorted({channel(m) for (m,) in db.execute(select(FeePayment.method).distinct()).all()})
    return {"rows": rows, "approved_total": money(total), "methods": methods}


def keys(db: Session, status: str | None, shop_id: uuid.UUID | None, q: str | None) -> list[dict]:
    from app.modules.admin.licenses import to_out

    stmt = select(LicenseKey, Shop.name).join(Shop, Shop.id == LicenseKey.shop_id).order_by(LicenseKey.issued_at.desc())
    if status:
        stmt = stmt.where(LicenseKey.status == status)
    if shop_id:
        stmt = stmt.where(LicenseKey.shop_id == shop_id)
    out = []
    for k, name in db.execute(stmt.limit(500)).all():
        if q and q.lower() not in f"{name} {k.code} {k.nonce}".lower():
            continue
        out.append(to_out(k, name))
    return out
