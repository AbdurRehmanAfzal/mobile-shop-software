"""The stock screen of the new product, read from the server (owner 2026-11-25, mock-up 23 "Complete
Multi-Category Stock & Inventory Command Center"): a card per kind of stock and a row per brand, the
same per model, where the stock came from (each dealer / customer it was bought from: what is still
here, what was sold, what it cost, what the shop still owes them), and the stock ledger — every piece
that came in or went out, with its cost, its price and profit when it was sold, and the stock at cost
after it.

Read-only and derived: units are `devices` rows (a unit is the shop's while it is in stock, faulty, in
repair, on amanat or with a customer for approval), items are `accessories` with their batches and
movements, where a unit came from is its purchase line, what is owed is the person's ledger balance.
The ledger is built from the device events that move a unit in or out (purchase, sale, return,
return to the seller, branch move, used for parts) and the items' movements; the "stock at cost after"
is the running total of those movements' cost — the stock as these movements make it (an expense or a
price correction added later is not a movement). Cost, profit and what is owed only with VIEW_COST."""

import datetime as dt
import uuid
from collections import defaultdict
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import local_date
from app.db.base import ZERO
from app.modules.accessories.models import Accessory, AccessoryBatch, AccessoryMovement
from app.modules.accessories.stock import valuation
from app.modules.catalogue.models import Brand, Model
from app.modules.catalogue.service import name_key
from app.modules.devices.models import Device, DeviceEvent
from app.modules.ledger.service import money
from app.modules.parties.models import Party
from app.modules.purchases.models import Purchase, PurchaseLine, PurchaseStatus
from app.modules.returns.models import ReturnDoc
from app.modules.sales.models import Invoice, InvoiceLine, InvoiceStatus

KINDS = ("phone", "tablet", "watch", "laptop")
OWNED = ("in_stock", "faulty", "in_repair", "on_loan", "with_customer_for_approval")


def _units(db: Session, shop_id: uuid.UUID, category: str | None = None):
    q = (
        select(Device, Brand.name, Model.name)
        .join(Brand, Brand.id == Device.brand_id)
        .join(Model, Model.id == Device.model_id)
        .where(Device.shop_id == shop_id)
    )
    if category:
        q = q.where(Device.category == category)
    return db.execute(q).all()


def _bought(db: Session, shop_id: uuid.UUID) -> dict:
    """each unit's latest posted purchase line: (line, purchase)"""
    out = {}
    for ln, p in db.execute(
        select(PurchaseLine, Purchase)
        .join(Purchase, Purchase.id == PurchaseLine.purchase_id)
        .where(
            Purchase.shop_id == shop_id,
            Purchase.status == PurchaseStatus.POSTED,
            PurchaseLine.device_id.is_not(None),
        )
        .order_by(Purchase.date, Purchase.created_at)
    ).all():
        out[ln.device_id] = (ln, p)
    return out


def _sold(db: Session, shop_id: uuid.UUID) -> dict:
    """each unit's standing sale line (not returned): (line, invoice)"""
    out = {}
    for ln, inv in db.execute(
        select(InvoiceLine, Invoice)
        .join(Invoice, Invoice.id == InvoiceLine.invoice_id)
        .where(
            Invoice.shop_id == shop_id,
            Invoice.status != InvoiceStatus.VOID,
            InvoiceLine.device_id.is_not(None),
            InvoiceLine.returned_at.is_(None),
        )
        .order_by(Invoice.date, Invoice.created_at)
    ).all():
        out[ln.device_id] = (ln, inv)
    return out


def _c(v, can_cost: bool):
    return money(v) if can_cost and v is not None else None


# ---- the summary: a card per kind, a row per brand --------------------------------------------


def overview(db: Session, shop_id: uuid.UUID, *, can_cost: bool) -> dict:
    units = _units(db, shop_id)
    bought = _bought(db, shop_id)
    sold = _sold(db, shop_id)
    kinds = {
        k: {"key": k, "in_shop": 0, "sold": 0, "cost": ZERO, "asking": ZERO, "brands": set()}
        for k in KINDS
    }
    brands: dict = {}
    for d, bname, mname in units:
        k = kinds.setdefault(
            d.category,
            {
                "key": d.category,
                "in_shop": 0,
                "sold": 0,
                "cost": ZERO,
                "asking": ZERO,
                "brands": set(),
            },
        )
        b = brands.setdefault(
            d.brand_id,
            {
                "brand_id": d.brand_id,
                "brand_name": bname,
                "models": set(),
                "kinds": set(),
                "in_shop": 0,
                "sold": 0,
                "cost": ZERO,
                "asking": ZERO,
                "bought": ZERO,
                "sold_value": ZERO,
            },
        )
        b["models"].add(name_key(mname))
        b["kinds"].add(d.category)
        if d.id in bought:
            b["bought"] += bought[d.id][0].net_cost
        if d.status in OWNED:
            k["in_shop"] += 1
            k["cost"] += d.cost_price or ZERO
            k["asking"] += d.asking_price or ZERO
            k["brands"].add(d.brand_id)
            b["in_shop"] += 1
            b["cost"] += d.cost_price or ZERO
            b["asking"] += d.asking_price or ZERO
        elif d.status == "sold":
            k["sold"] += 1
            b["sold"] += 1
            if d.id in sold:
                b["sold_value"] += sold[d.id][0].line_total
    items = valuation(db, shop_id)
    sold_pieces = sum(
        -m.qty_delta
        for m in db.scalars(
            select(AccessoryMovement).where(
                AccessoryMovement.shop_id == shop_id, AccessoryMovement.reason == "sale"
            )
        ).all()
    )
    rows = [
        {
            "key": k["key"],
            "in_shop": k["in_shop"],
            "sold": k["sold"],
            "brands": len(k["brands"]),
            "cost": _c(k["cost"], can_cost),
            "asking": money(k["asking"]),
        }
        for k in kinds.values()
    ]
    rows.append(
        {
            "key": "items",
            "in_shop": items["units"],
            "sold": int(sold_pieces),
            "brands": items["items"],
            "cost": _c(items["cost"], can_cost),
            "asking": money(items["retail"]),
        }
    )
    payable = ZERO
    for p in db.scalars(select(Party).where(Party.shop_id == shop_id, Party.balance < 0)).all():
        payable += -p.balance
    brand_rows = sorted(
        (
            {
                "brand_id": b["brand_id"],
                "brand_name": b["brand_name"],
                "kinds": sorted(b["kinds"]),
                "models": len(b["models"]),
                "in_shop": b["in_shop"],
                "sold": b["sold"],
                "avg_cost": _c(b["cost"] / b["in_shop"], can_cost) if b["in_shop"] else None,
                "cost": _c(b["cost"], can_cost),
                "asking": money(b["asking"]),
                "bought": _c(b["bought"], can_cost),
                "sold_value": money(b["sold_value"]),
            }
            for b in brands.values()
        ),
        key=lambda r: (-r["in_shop"], -r["sold"], r["brand_name"]),
    )
    in_shop_units = sum(r["in_shop"] for r in rows if r["key"] != "items")
    return {
        "kinds": rows,
        "brands": brand_rows,
        "units_in_shop": in_shop_units,
        "pieces_in_shop": items["units"],
        "units_sold": sum(r["sold"] for r in rows if r["key"] != "items"),
        "cost": _c(sum((k["cost"] for k in kinds.values()), ZERO) + items["cost"], can_cost),
        "asking": money(sum((k["asking"] for k in kinds.values()), ZERO) + items["retail"]),
        "payable": _c(payable, can_cost),
    }


# ---- per model --------------------------------------------------------------------------------


def models(
    db: Session,
    shop_id: uuid.UUID,
    *,
    category: str | None = None,
    brand_id: uuid.UUID | None = None,
    can_cost: bool,
) -> list[dict]:
    if category == "items":
        rows = []
        for a in db.scalars(
            select(Accessory).where(Accessory.shop_id == shop_id, Accessory.is_active.is_(True))
        ).all():
            sold_pieces = sum(
                -m.qty_delta
                for m in db.scalars(
                    select(AccessoryMovement).where(
                        AccessoryMovement.accessory_id == a.id, AccessoryMovement.reason == "sale"
                    )
                ).all()
            )
            rows.append(
                {
                    "kind": "items",
                    "category": a.category,
                    "brand_name": a.brand,
                    "model_name": a.name,
                    "item_id": a.id,
                    "in_shop": a.qty,
                    "sold": int(sold_pieces),
                    "avg_cost": _c(a.avg_cost, can_cost),
                    "cost": _c((a.avg_cost or ZERO) * a.qty, can_cost),
                    "asking": money((a.price or ZERO) * a.qty),
                }
            )
        return sorted(rows, key=lambda r: (-r["in_shop"], r["model_name"]))
    sold = _sold(db, shop_id)
    groups: dict = {}
    for d, bname, mname in _units(db, shop_id, category if category in KINDS else None):
        if brand_id and d.brand_id != brand_id:
            continue
        key = (d.brand_id, name_key(mname))
        g = groups.setdefault(
            key,
            {
                "kind": d.category,
                "brand_id": d.brand_id,
                "brand_name": bname,
                "model_id": d.model_id,
                "model_name": mname,
                "in_shop": 0,
                "sold": 0,
                "cost": ZERO,
                "asking": ZERO,
                "sold_value": ZERO,
            },
        )
        if d.status in OWNED:
            g["in_shop"] += 1
            g["cost"] += d.cost_price or ZERO
            g["asking"] += d.asking_price or ZERO
        elif d.status == "sold":
            g["sold"] += 1
            if d.id in sold:
                g["sold_value"] += sold[d.id][0].line_total
    out = []
    for g in groups.values():
        out.append(
            {
                **g,
                "avg_cost": _c(g["cost"] / g["in_shop"], can_cost) if g["in_shop"] else None,
                "cost": _c(g["cost"], can_cost),
                "asking": money(g["asking"]),
                "sold_value": money(g["sold_value"]),
            }
        )
    return sorted(out, key=lambda r: (-r["in_shop"], -r["sold"], r["brand_name"], r["model_name"]))


# ---- where the stock came from -----------------------------------------------------------------


def parties(db: Session, shop_id: uuid.UUID, *, can_cost: bool) -> list[dict]:
    units = {d.id: (d, b, m) for d, b, m in _units(db, shop_id)}
    per: dict = {}

    def g(pid):
        return per.setdefault(
            pid,
            {
                "party_id": pid,
                "in_shop": 0,
                "sold": 0,
                "returned": 0,
                "pieces_in_shop": 0,
                "pieces_in": 0,
                "cost": ZERO,
                "billed": ZERO,
                "brands": set(),
                "models": [],
                "kinds": set(),
            },
        )

    for ln, p in db.execute(
        select(PurchaseLine, Purchase)
        .join(Purchase, Purchase.id == PurchaseLine.purchase_id)
        .where(
            Purchase.shop_id == shop_id,
            Purchase.status == PurchaseStatus.POSTED,
            Purchase.party_id.is_not(None),
        )
    ).all():
        r = g(p.party_id)
        r["billed"] += ln.net_cost
        if ln.device_id and ln.device_id in units:
            d, bname, mname = units[ln.device_id]
            r["brands"].add(bname)
            r["kinds"].add(d.category)
            label = f"{bname} {mname}"
            if label not in r["models"]:
                r["models"].append(label)
            if ln.returned_at:
                r["returned"] += 1
            elif d.status in OWNED:
                r["in_shop"] += 1
                r["cost"] += d.cost_price or ZERO
            elif d.status == "sold":
                r["sold"] += 1
    for b in db.scalars(
        select(AccessoryBatch).where(
            AccessoryBatch.shop_id == shop_id, AccessoryBatch.party_id.is_not(None)
        )
    ).all():
        r = g(b.party_id)
        r["pieces_in"] += b.qty_in
        r["pieces_in_shop"] += b.qty_left
        r["cost"] += money(b.unit_cost * b.qty_left)
        r["kinds"].add("items")
    names = (
        {
            p.id: p
            for p in db.scalars(
                select(Party).where(Party.shop_id == shop_id, Party.id.in_(list(per)))
            ).all()
        }
        if per
        else {}
    )
    out = []
    for pid, r in per.items():
        p = names.get(pid)
        if p is None:
            continue
        bal = money(p.balance)
        out.append(
            {
                "party_id": pid,
                "name": p.name,
                "name_ur": p.name_ur,
                "phone": p.phone,
                "party_kinds": p.kinds,
                "kinds": sorted(r["kinds"]),
                "brands": sorted(r["brands"]),
                "models": r["models"][:8],
                "models_count": len(r["models"]),
                "in_shop": r["in_shop"],
                "sold": r["sold"],
                "returned": r["returned"],
                "pieces_in_shop": r["pieces_in_shop"],
                "pieces_in": r["pieces_in"],
                "cost": _c(r["cost"], can_cost),
                "billed": _c(r["billed"], can_cost),
                # what the shop owes them (dene) or they owe the shop (lene): the khata's balance
                "balance": bal if can_cost else None,
            }
        )
    return sorted(out, key=lambda r: (-(r["in_shop"] + r["pieces_in_shop"]), -r["sold"], r["name"]))


# ---- the stock ledger ----------------------------------------------------------------------------

DEVICE_MOVES = {
    "purchased": ("in", 1),
    "sold": ("out", -1),
    "sale_returned": ("return_in", 1),
    "returned_to_supplier": ("return_out", -1),
    "transferred_in": ("transfer_in", 1),
    "transferred_out": ("transfer_out", -1),
    "used_for_parts": ("parts", -1),
}


def _docs(db: Session, shop_id: uuid.UUID, ids: dict[str, set]) -> dict:
    """document number and party for each document id"""
    out: dict = {}
    if ids.get("purchase"):
        for p in db.scalars(
            select(Purchase).where(Purchase.shop_id == shop_id, Purchase.id.in_(ids["purchase"]))
        ).all():
            out[p.id] = (p.no, p.party_id)
    if ids.get("invoice"):
        for i in db.scalars(
            select(Invoice).where(Invoice.shop_id == shop_id, Invoice.id.in_(ids["invoice"]))
        ).all():
            out[i.id] = (i.no, i.party_id)
    if ids.get("return"):
        for r in db.scalars(
            select(ReturnDoc).where(ReturnDoc.shop_id == shop_id, ReturnDoc.id.in_(ids["return"]))
        ).all():
            out[r.id] = (r.no, r.party_id)
    if ids.get("transfer"):
        from app.modules.transfers.models import BranchTransfer

        for t in db.scalars(
            select(BranchTransfer).where(BranchTransfer.id.in_(ids["transfer"]))
        ).all():
            out[t.id] = (t.no, None)
    return out


def ledger(
    db: Session,
    shop_id: uuid.UUID,
    *,
    date_from: dt.date | None = None,
    date_to: dt.date | None = None,
    category: str | None = None,
    move: str | None = None,
    brand_id: uuid.UUID | None = None,
    party_id: uuid.UUID | None = None,
    can_cost: bool,
) -> dict:
    units = {d.id: (d, b, m) for d, b, m in _units(db, shop_id)}
    rows: list[dict] = []
    sale_lines = {
        (ln.invoice_id, ln.device_id): ln
        for ln in db.scalars(
            select(InvoiceLine)
            .join(Invoice, Invoice.id == InvoiceLine.invoice_id)
            .where(Invoice.shop_id == shop_id, InvoiceLine.device_id.is_not(None))
        ).all()
    }
    want_devices = category in (None, "", *KINDS)
    want_items = category in (None, "", "items")
    if want_devices:
        for e in db.scalars(
            select(DeviceEvent)
            .where(DeviceEvent.shop_id == shop_id, DeviceEvent.type.in_(list(DEVICE_MOVES)))
            .order_by(DeviceEvent.at, DeviceEvent.seq)
        ).all():
            d, bname, mname = units.get(e.device_id, (None, None, None))
            if d is None or (category and d.category != category):
                continue
            kind, qty = DEVICE_MOVES[e.type]
            amount = money(e.amount) if e.amount is not None else None
            unit_cost = amount
            price = None
            profit = None
            if e.type == "sold":
                ln = sale_lines.get((e.document_id, d.id))
                unit_cost = money(ln.cost) if ln is not None and ln.cost is not None else None
                price = money(ln.line_total) if ln is not None else amount
                profit = (
                    money(price - unit_cost)
                    if price is not None and unit_cost is not None
                    else None
                )
            elif e.type == "sale_returned":
                ln = next(
                    (
                        x
                        for (inv, dev), x in sale_lines.items()
                        if dev == d.id and x.returned_at is not None
                    ),
                    None,
                )
                unit_cost = money(ln.cost) if ln is not None and ln.cost is not None else amount
            rows.append(
                {
                    "at": e.at,
                    "kind": kind,
                    "category": d.category,
                    "brand_id": d.brand_id,
                    "label": f"{bname} {mname}",
                    "code": d.imei1,
                    "device_id": d.id,
                    "item_id": None,
                    "qty": qty,
                    "unit_cost": unit_cost,
                    "price": price,
                    "profit": profit,
                    "party_id": e.party_id,
                    "document_type": e.document_type,
                    "document_id": e.document_id,
                }
            )
    if want_items:
        items = {
            a.id: a for a in db.scalars(select(Accessory).where(Accessory.shop_id == shop_id)).all()
        }
        item_sales = defaultdict(lambda: [ZERO, ZERO])
        for ln in db.scalars(
            select(InvoiceLine)
            .join(Invoice, Invoice.id == InvoiceLine.invoice_id)
            .where(Invoice.shop_id == shop_id, InvoiceLine.accessory_id.is_not(None))
        ).all():
            s = item_sales[(ln.invoice_id, ln.accessory_id)]
            s[0] += ln.line_total
            s[1] += ln.cost or ZERO
        for m in db.scalars(
            select(AccessoryMovement)
            .where(AccessoryMovement.shop_id == shop_id)
            .order_by(AccessoryMovement.at)
        ).all():
            a = items.get(m.accessory_id)
            if a is None or m.qty_delta == 0:
                continue
            kind = {
                "purchase": "in",
                "sale": "out",
                "return": "return_in" if m.qty_delta > 0 else "return_out",
            }.get(m.reason, "adjust")
            if m.document_type in ("transfer_in", "branch_transfer_in"):
                kind = "transfer_in"
            price = profit = None
            if m.reason == "sale" and m.document_id:
                s = item_sales.get((m.document_id, a.id))
                if s:
                    price, profit = money(s[0]), money(s[0] - s[1])
            rows.append(
                {
                    "at": m.at,
                    "kind": kind,
                    "category": "items",
                    "brand_id": None,
                    "label": a.name,
                    "code": a.sku,
                    "device_id": None,
                    "item_id": a.id,
                    "qty": m.qty_delta,
                    "unit_cost": money(m.unit_cost),
                    "price": price,
                    "profit": profit,
                    "party_id": None,
                    "document_type": m.document_type,
                    "document_id": m.document_id,
                }
            )
    rows.sort(key=lambda r: r["at"] if r["at"].tzinfo else r["at"].replace(tzinfo=dt.UTC))
    # the stock at cost after each movement, over everything shown before the period too
    running = ZERO
    for r in rows:
        if r["unit_cost"] is not None:
            running += r["unit_cost"] * r["qty"]
        r["worth_after"] = money(running)
        r["date"] = local_date(r["at"])

    ids: dict[str, set] = defaultdict(set)
    for r in rows:
        dtp = r["document_type"] or ""
        if r["document_id"] is None:
            continue
        if dtp in ("purchase", "opening_stock"):
            ids["purchase"].add(r["document_id"])
        elif dtp == "invoice":
            ids["invoice"].add(r["document_id"])
        elif "return" in dtp:
            ids["return"].add(r["document_id"])
        elif "transfer" in dtp:
            ids["transfer"].add(r["document_id"])
    docs = _docs(db, shop_id, ids)
    pids = {r["party_id"] for r in rows if r["party_id"]} | {v[1] for v in docs.values() if v[1]}
    pnames = (
        {
            p.id: p.name
            for p in db.scalars(
                select(Party).where(Party.shop_id == shop_id, Party.id.in_(list(pids)))
            ).all()
        }
        if pids
        else {}
    )

    shown = []
    for r in rows:
        no, dparty = docs.get(r["document_id"], (None, None))
        pid = r["party_id"] or dparty
        if date_from and r["date"] < date_from:
            continue
        if date_to and r["date"] > date_to:
            continue
        if (
            move
            and r["kind"] != move
            and not (move == "return" and r["kind"].startswith("return"))
            and not (move == "transfer" and r["kind"].startswith("transfer"))
        ):
            continue
        if brand_id and r["brand_id"] != brand_id:
            continue
        if party_id and pid != party_id:
            continue
        shown.append(
            {
                **r,
                "no": no,
                "party_id": pid,
                "party_name": pnames.get(pid),
                "unit_cost": _c(r["unit_cost"], can_cost),
                "profit": _c(r["profit"], can_cost),
                "worth_after": _c(r["worth_after"], can_cost),
            }
        )
    ins = [r for r in shown if r["kind"] == "in"]
    outs = [r for r in shown if r["kind"] == "out"]
    rets = [r for r in shown if r["kind"] == "return_out"]
    return {
        "rows": list(reversed(shown)),
        "in_units": sum(r["qty"] for r in ins),
        "in_cost": _c(sum((Decimal(r["unit_cost"] or 0) * r["qty"] for r in ins), ZERO), can_cost),
        "out_units": -sum(r["qty"] for r in outs),
        "out_value": money(sum((Decimal(r["price"] or 0) for r in outs), ZERO)),
        "returned_value": _c(
            sum((Decimal(r["unit_cost"] or 0) * -r["qty"] for r in rets), ZERO), can_cost
        ),
        "returned_count": len(rets),
        "profit": _c(sum((Decimal(r["profit"] or 0) for r in outs), ZERO), can_cost),
    }
