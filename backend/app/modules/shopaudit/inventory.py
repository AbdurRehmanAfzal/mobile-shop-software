"""Inventory intelligence (docs/16 §6, §7, §9 — docs/17 P6): what is in stock (now or on a day),
in every dimension the phones already carry, with cost and expected value; the age of every unit
with the shop's own bands; alerts; and the ID-check audit with the bypasses by employee."""

import datetime as dt
import uuid
from collections import defaultdict

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.periods import Period, day_end
from app.db.base import ZERO
from app.db.refs import user_name
from app.modules.catalogue.models import Brand, Model
from app.modules.devices.ageing import days_in_stock, intake_map
from app.modules.devices.models import Device, DeviceEvent
from app.modules.devices.state import DeviceStatus, EventType, VerificationStatus
from app.modules.ledger.service import money
from app.modules.parties.models import Party
from app.modules.purchases.models import Purchase, PurchaseLine, PurchaseStatus
from app.modules.shopaudit import service as core
from app.modules.shopaudit.prefs import BAND_KEYS, band_of, prefs_for
from app.modules.verification.models import Verification

CONDITIONS = ("box_pack", "open_box", "used", "patched")
PTA = ("pta_approved", "non_pta", "jv", "unknown")
VERIFICATION = ("not_required", "pending", "clear", "flagged")
CATEGORIES = ("phone", "tablet", "watch")


def _names(db: Session, devs: list[Device]) -> dict[uuid.UUID, tuple[str, str]]:
    bids = {d.brand_id for d in devs}
    mids = {d.model_id for d in devs}
    brands = (
        dict(db.execute(select(Brand.id, Brand.name).where(Brand.id.in_(bids))).all())
        if bids
        else {}
    )
    models = (
        dict(db.execute(select(Model.id, Model.name).where(Model.id.in_(mids))).all())
        if mids
        else {}
    )
    return {d.id: (brands.get(d.brand_id, ""), models.get(d.model_id, "")) for d in devs}


def _suppliers(
    db: Session, shop_id: uuid.UUID, device_ids: list[uuid.UUID]
) -> dict[uuid.UUID, dict]:
    """who each phone was last bought from (the purchase behind its current cycle)"""
    if not device_ids:
        return {}
    rows = db.execute(
        select(
            PurchaseLine.device_id,
            Purchase.party_id,
            Purchase.date,
            Purchase.no,
            Purchase.id,
            Party.name,
        )
        .join(Purchase, Purchase.id == PurchaseLine.purchase_id)
        .join(Party, Party.id == Purchase.party_id)
        .where(PurchaseLine.device_id.in_(device_ids), Purchase.status == PurchaseStatus.POSTED)
        .order_by(Purchase.date, Purchase.created_at)
    ).all()
    out: dict = {}
    for dev_id, pid, date, no, pur_id, name in rows:
        out[dev_id] = {
            "party_id": pid,
            "party_name": name,
            "purchase_date": date,
            "purchase_no": no,
            "purchase_id": pur_id,
        }
    return out


def _row(d: Device, names, suppliers, intakes, now, bands, can_cost) -> dict:
    b, m = names.get(d.id, ("", ""))
    cost = d.cost_price if (can_cost and d.cost_price is not None) else None
    asking = d.asking_price
    margin = (
        money(asking - d.cost_price)
        if (can_cost and asking is not None and d.cost_price is not None)
        else None
    )
    margin_pct = (
        round(float(margin / d.cost_price * 100), 1)
        if (margin is not None and d.cost_price)
        else None
    )
    days = days_in_stock(d, intakes, now)
    sup = suppliers.get(d.id) or {}
    return {
        "device_id": d.id,
        "label": f"{b} {m}".strip(),
        "brand": b,
        "model": m,
        "imei1": d.imei1,
        "category": d.category,
        "condition": d.condition,
        "pta_status": d.pta_status,
        "verification_status": d.verification_status,
        "status": d.status,
        "supplier": sup.get("party_name"),
        "supplier_id": sup.get("party_id"),
        "purchase_no": sup.get("purchase_no"),
        "purchase_id": sup.get("purchase_id"),
        "intake_date": (intakes.get(d.id) or d.first_seen_at).date()
        if hasattr((intakes.get(d.id) or d.first_seen_at), "date")
        else None,
        "days": days,
        "band": band_of(days, bands),
        "cost": cost,
        "asking": asking,
        "margin": margin,
        "margin_pct": margin_pct,
    }


def summary(
    db: Session, shop_id: uuid.UUID, shop, as_of: dt.date | None, *, can_cost: bool
) -> dict:
    until = day_end(as_of) if as_of else None
    walk = core.stock_walk(db, shop_id, until) if until else None
    if walk is None:
        devs = db.scalars(
            select(Device).where(Device.shop_id == shop_id, Device.status == DeviceStatus.IN_STOCK)
        ).all()
        status_counts = dict(
            db.execute(
                select(Device.status, func.count(Device.id))
                .where(Device.shop_id == shop_id)
                .group_by(Device.status)
            ).all()
        )
    else:
        ids = [d for d, s in walk.items() if s == DeviceStatus.IN_STOCK]
        devs = db.scalars(select(Device).where(Device.id.in_(ids))).all() if ids else []
        status_counts = defaultdict(int)
        for s in walk.values():
            status_counts[s] += 1
    names = _names(db, devs)
    prefs = prefs_for(shop)
    now = dt.datetime.now(dt.UTC) if not until else until
    intakes = intake_map(db, shop_id, [d.id for d in devs])

    def dim(keys, attr):
        out = {k: {"count": 0, "cost": ZERO, "asking": ZERO} for k in keys}
        for d in devs:
            k = getattr(d, attr)
            x = out.setdefault(k, {"count": 0, "cost": ZERO, "asking": ZERO})
            x["count"] += 1
            x["cost"] = money(x["cost"] + (d.cost_price or ZERO))
            x["asking"] = money(x["asking"] + (d.asking_price or ZERO))
        if not can_cost:
            for x in out.values():
                x["cost"] = None
        return [{"key": k, **v} for k, v in out.items()]

    brands: dict = {}
    for d in devs:
        b = names[d.id][0]
        x = brands.setdefault(b, {"brand": b, "count": 0, "cost": ZERO, "asking": ZERO})
        x["count"] += 1
        x["cost"] = money(x["cost"] + (d.cost_price or ZERO))
        x["asking"] = money(x["asking"] + (d.asking_price or ZERO))
    cost_total = money(sum((d.cost_price or ZERO for d in devs), ZERO))
    asking_total = money(sum((d.asking_price or ZERO for d in devs), ZERO))
    priced = [d for d in devs if d.cost_price is not None and d.asking_price is not None]
    margin_total = money(sum((d.asking_price - d.cost_price for d in priced), ZERO))
    rows = [_row(d, names, {}, intakes, now, prefs["age_bands"], can_cost) for d in devs]
    by_cost = sorted((r for r in rows if r["cost"] is not None), key=lambda r: -r["cost"])[:5]
    by_asking = sorted((r for r in rows if r["asking"] is not None), key=lambda r: -r["asking"])[:5]
    by_margin = sorted((r for r in rows if r["margin"] is not None), key=lambda r: -r["margin"])[:5]
    low_margin = sorted((r for r in rows if r["margin"] is not None), key=lambda r: r["margin"])[:5]
    return {
        "as_of": as_of,
        "count": len(devs),
        "cost_value": cost_total if can_cost else None,
        "asking_value": asking_total,
        "expected_margin": margin_total if can_cost else None,
        "expected_margin_pct": (
            round(float(margin_total / cost_total * 100), 1) if (can_cost and cost_total) else None
        ),
        "unpriced": sum(1 for d in devs if d.asking_price is None),
        "no_cost": sum(1 for d in devs if d.cost_price is None),
        "by_condition": dim(CONDITIONS, "condition"),
        "by_pta": dim(PTA, "pta_status"),
        "by_verification": dim(VERIFICATION, "verification_status"),
        "by_category": dim(CATEGORIES, "category"),
        "by_brand": sorted(
            (({**b, "cost": b["cost"] if can_cost else None}) for b in brands.values()),
            key=lambda b: -b["count"],
        ),
        "status_counts": {s.value: int(status_counts.get(s.value, 0)) for s in DeviceStatus},
        "most_expensive_cost": by_cost if can_cost else [],
        "most_expensive_asking": by_asking,
        "highest_margin": by_margin if can_cost else [],
        "lowest_margin": low_margin if can_cost else [],
        "prefs": prefs,
        "notes": [
            "Dimensions overlap: one phone is counted once per dimension (a used PTA-approved phone is in both).",
            "The stock on a past day is rebuilt from the device events; values are the phones' recorded cost and asking price.",
        ],
    }


def ageing(db: Session, shop_id: uuid.UUID, shop, *, can_cost: bool) -> dict:
    prefs = prefs_for(shop)
    devs = db.scalars(
        select(Device).where(Device.shop_id == shop_id, Device.status == DeviceStatus.IN_STOCK)
    ).all()
    ids = [d.id for d in devs]
    names = _names(db, devs)
    suppliers = _suppliers(db, shop_id, ids)
    intakes = intake_map(db, shop_id, ids)
    now = dt.datetime.now(dt.UTC)
    rows = [_row(d, names, suppliers, intakes, now, prefs["age_bands"], can_cost) for d in devs]
    rows.sort(key=lambda r: -r["days"])
    bands = {k: {"band": k, "count": 0, "cost": ZERO, "asking": ZERO} for k in BAND_KEYS}
    for r in rows:
        x = bands[r["band"]]
        x["count"] += 1
        x["cost"] = money(x["cost"] + (r["cost"] or ZERO))
        x["asking"] = money(x["asking"] + (r["asking"] or ZERO))
    # repeated returns per device (sale_returned events) for the alert
    returns = (
        dict(
            db.execute(
                select(DeviceEvent.device_id, func.count(DeviceEvent.id))
                .where(
                    DeviceEvent.shop_id == shop_id,
                    DeviceEvent.device_id.in_(ids),
                    DeviceEvent.type == EventType.SALE_RETURNED,
                )
                .group_by(DeviceEvent.device_id)
            ).all()
        )
        if ids
        else {}
    )
    alerts = []
    slow_edge = prefs["age_bands"][1]  # beyond "normal"
    for r in rows:
        if r["days"] > prefs["age_bands"][3]:
            alerts.append({"kind": "dead_stock", **_ref(r)})
        elif r["days"] > slow_edge and (r["cost"] or ZERO) >= prefs["high_value"]:
            alerts.append({"kind": "high_value_slow", **_ref(r)})
        if r["margin_pct"] is not None and r["margin_pct"] < prefs["low_margin_pct"]:
            alerts.append({"kind": "low_margin", **_ref(r)})
        if can_cost and r["cost"] is None:
            alerts.append({"kind": "missing_cost", **_ref(r)})
        if r["asking"] is None:
            alerts.append({"kind": "missing_asking", **_ref(r)})
        if r["verification_status"] in (VerificationStatus.PENDING, VerificationStatus.FLAGGED):
            alerts.append({"kind": "verification_" + r["verification_status"], **_ref(r)})
        if returns.get(r["device_id"], 0) >= 2:
            alerts.append({"kind": "repeat_returns", **_ref(r), "times": returns[r["device_id"]]})
    order = {
        "verification_flagged": 0,
        "dead_stock": 1,
        "high_value_slow": 2,
        "verification_pending": 3,
        "missing_cost": 4,
        "missing_asking": 5,
        "low_margin": 6,
        "repeat_returns": 7,
    }
    alerts.sort(key=lambda a: (order.get(a["kind"], 9), -(a.get("cost") or 0)))
    return {
        "prefs": prefs,
        "band_keys": list(BAND_KEYS),
        "band_edges": prefs["age_bands"],
        "bands": [{**bands[k], "cost": bands[k]["cost"] if can_cost else None} for k in BAND_KEYS],
        "rows": rows,
        "alerts": alerts,
        "alert_counts": {k: sum(1 for a in alerts if a["kind"] == k) for k in order},
        "notes": [
            "Age counts from the day the phone came in on its current cycle (a purchase or a return), not from its last note or price change."
        ],
    }


def _ref(r: dict) -> dict:
    return {
        k: r[k]
        for k in ("device_id", "label", "imei1", "days", "cost", "asking", "margin_pct", "supplier")
    }


def verification(db: Session, shop_id: uuid.UUID, shop, p: Period) -> dict:
    prefs = prefs_for(shop)
    in_stock = dict(
        db.execute(
            select(Device.verification_status, func.count(Device.id))
            .where(Device.shop_id == shop_id, Device.status == DeviceStatus.IN_STOCK)
            .group_by(Device.verification_status)
        ).all()
    )
    all_devices = dict(
        db.execute(
            select(Device.verification_status, func.count(Device.id))
            .where(Device.shop_id == shop_id)
            .group_by(Device.verification_status)
        ).all()
    )
    # checks done in the period (every saved check row) and their results
    checks = dict(
        db.execute(
            select(Verification.result, func.count(Verification.id))
            .where(
                Verification.shop_id == shop_id,
                Verification.checked_at.is_not(None),
                Verification.checked_at >= day_end(p.date_from - dt.timedelta(days=1)),
                Verification.checked_at < day_end(p.date_to),
            )
            .group_by(Verification.result)
        ).all()
    )
    # bypasses: "verified" events with override=True in the period
    events = db.execute(
        select(DeviceEvent, Device)
        .join(Device, Device.id == DeviceEvent.device_id)
        .where(
            DeviceEvent.shop_id == shop_id,
            DeviceEvent.type == EventType.VERIFIED,
            DeviceEvent.at >= day_end(p.date_from - dt.timedelta(days=1)),
            DeviceEvent.at < day_end(p.date_to),
        )
        .order_by(DeviceEvent.at.desc())
    ).all()
    bypass_events = [(e, d) for e, d in events if (e.data or {}).get("override")]
    devs = [d for _e, d in bypass_events]
    names = _names(db, devs)
    suppliers = _suppliers(db, shop_id, [d.id for d in devs])
    rows = []
    per_user: dict = defaultdict(
        lambda: {"user_id": None, "user_name": None, "bypasses": 0, "flagged_bypassed": 0}
    )
    for e, d in bypass_events:
        b, m = names.get(d.id, ("", ""))
        sup = suppliers.get(d.id) or {}
        data = e.data or {}
        u = per_user[e.user_id]
        u["user_id"] = e.user_id
        u["user_name"] = u["user_name"] or user_name(db, e.user_id)
        u["bypasses"] += 1
        if data.get("previous") == "flagged":
            u["flagged_bypassed"] += 1
        rows.append(
            {
                "at": e.at,
                "device_id": d.id,
                "label": f"{b} {m}".strip(),
                "imei1": d.imei1,
                "party_id": sup.get("party_id"),
                "party_name": sup.get("party_name"),
                "purchase_no": sup.get("purchase_no"),
                "user_id": e.user_id,
                "user_name": u["user_name"],
                "reason": data.get("reason"),
                "previous": data.get("previous"),
                "document_type": e.document_type,
                "document_id": e.document_id,
                "status_now": d.verification_status,
                "device_status": d.status,
            }
        )
    # how many intakes each bypasser handled in the period (share of bypasses)
    intakes = dict(
        db.execute(
            select(DeviceEvent.user_id, func.count(DeviceEvent.id))
            .where(
                DeviceEvent.shop_id == shop_id,
                DeviceEvent.type == EventType.PURCHASED,
                DeviceEvent.at >= day_end(p.date_from - dt.timedelta(days=1)),
                DeviceEvent.at < day_end(p.date_to),
            )
            .group_by(DeviceEvent.user_id)
        ).all()
    )
    users = []
    for uid, u in per_user.items():
        n_in = int(intakes.get(uid, 0))
        share = round(u["bypasses"] / n_in * 100, 1) if n_in else None
        users.append(
            {
                **u,
                "intakes": n_in,
                "share": share,
                "unusual": bool(
                    u["flagged_bypassed"]
                    or (
                        u["bypasses"] >= prefs["bypass_min"]
                        and (share is None or share >= prefs["bypass_share"])
                    )
                ),
            }
        )
    users.sort(key=lambda u: (-u["unusual"], -u["bypasses"]))
    return {
        "period": p.as_dict(),
        "in_stock": {k: int(in_stock.get(k, 0)) for k in VERIFICATION},
        "all_devices": {k: int(all_devices.get(k, 0)) for k in VERIFICATION},
        "checks_in_period": {k: int(checks.get(k, 0)) for k in ("clear", "pending", "flagged")},
        "bypasses": len(rows),
        "rows": rows,
        "by_user": users,
        "prefs": {"bypass_share": prefs["bypass_share"], "bypass_min": prefs["bypass_min"]},
        "notes": [
            "A skipped check ('I know this person') is recorded as a bypass with the reason and who did it; it is never counted as a completed check.",
            "'Unusual' = the person skipped at least the minimum number of checks and at least the share of their own intakes set in the thresholds, or skipped a flagged phone.",
        ],
    }
