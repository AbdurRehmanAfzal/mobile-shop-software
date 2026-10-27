"""Every bill of the shop in one list (owner, 2026-10-27: "shopkeeper koi bhi invoice dekh sake").

Sales, purchases, returns and repair jobs keep their own tables and screens; this module only reads
them and shapes each into the same row, so one screen can search and filter them all: by bill
number, the person's name or phone, a phone's IMEI, the date, and whether money is still due.
What a user may see follows the same rules as the original screens (purchases only with VIEW_COST).
"""

import datetime as dt
import uuid
from decimal import Decimal

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.clock import local_date
from app.core.permissions import Cap
from app.db.base import ZERO
from app.db.refs import user_name
from app.modules.catalogue.models import Brand, Model
from app.modules.devices.models import Device
from app.modules.ledger.service import money
from app.modules.parties.models import Party
from app.modules.purchases.models import Purchase, PurchaseLine, PurchaseStatus
from app.modules.repairs.models import OPEN_STATUSES, RepairJob, RepairStatus
from app.modules.returns.models import ReturnDoc, ReturnKind
from app.modules.sales.models import Invoice, InvoiceLine, InvoiceStatus

KINDS = ("sale", "purchase", "sale_return", "purchase_return", "repair")
STATES = ("paid", "due", "open", "returned", "void")
PER_KIND = 300  # read at most this many of each kind before merging


def _digits(q: str) -> str:
    return "".join(c for c in q if c.isdigit())


def _label(db: Session, device_ids: list[uuid.UUID]) -> str | None:
    """'Samsung Galaxy A54 · Nokia 105 +1' for the phones on a bill"""
    names = []
    for did in device_ids:
        d = db.get(Device, did)
        if d:
            b, m = db.get(Brand, d.brand_id), db.get(Model, d.model_id)
            names.append(f"{b.name if b else ''} {m.name if m else ''}".strip())
    if not names:
        return None
    return " · ".join(names[:2]) + (f" +{len(names) - 2}" if len(names) > 2 else "")


def list_documents(
    db: Session,
    shop_id: uuid.UUID,
    ctx,
    *,
    kind: str | None = None,
    q: str | None = None,
    date_from: dt.date | None = None,
    date_to: dt.date | None = None,
    state: str | None = None,
    limit: int = 100,
) -> list[dict]:
    q = (q or "").strip()
    digits = _digits(q)
    want = {kind} if kind else set(KINDS)
    if not ctx.can(Cap.VIEW_COST):
        want -= {"purchase", "purchase_return"}
    if not ctx.can(Cap.TRANSACT):
        want -= {"sale", "purchase", "sale_return", "purchase_return"}
    if not (ctx.can(Cap.REPAIR_CREATE) or ctx.can(Cap.REPAIR_WORK)):
        want -= {"repair"}

    # what the search text matches: people (name / phone) and phones (IMEI)
    party_ids: list[uuid.UUID] = []
    device_ids: list[uuid.UUID] = []
    if q:
        conds = [Party.name.ilike(f"%{q}%")]
        if len(digits) >= 4:
            conds.append(Party.phone.like(f"%{digits[-10:]}%"))
        party_ids = list(db.scalars(select(Party.id).where(Party.shop_id == shop_id, or_(*conds))))
        if len(digits) >= 4:
            device_ids = list(
                db.scalars(
                    select(Device.id).where(
                        Device.shop_id == shop_id,
                        or_(Device.imei1.like(f"%{digits}%"), Device.imei2.like(f"%{digits}%")),
                    )
                )
            )

    def dated(stmt, col):
        if date_from:
            stmt = stmt.where(col >= date_from)
        if date_to:
            stmt = stmt.where(col <= date_to)
        return stmt

    rows: list[dict] = []
    parties: dict[uuid.UUID, Party | None] = {}

    def party(pid):
        if pid and pid not in parties:
            parties[pid] = db.get(Party, pid)
        return parties.get(pid) if pid else None

    def base(kind_: str, doc, *, total, paid, due, state_, devices, ref=None):
        p = party(doc.party_id)
        return {
            "kind": kind_,
            "id": doc.id,
            "no": doc.no,
            "date": getattr(doc, "date", None),
            "created_at": doc.created_at,
            "party_id": doc.party_id,
            "party_name": p.name if p else None,
            "party_phone": p.phone if p else None,
            "items": _label(db, devices),
            "total": money(total),
            "paid": money(paid),
            "due": money(due),
            "state": state_,
            "ref_id": ref.id if ref is not None else None,
            "ref_no": ref.no if ref is not None else None,
            "created_by_name": user_name(db, doc.created_by),
        }

    sale_hits: list[uuid.UUID] = []
    if "sale" in want or "sale_return" in want:
        stmt = select(Invoice).where(Invoice.shop_id == shop_id)
        if q:
            by_device = select(InvoiceLine.invoice_id).where(InvoiceLine.device_id.in_(device_ids))
            stmt = stmt.where(
                or_(
                    Invoice.no.ilike(f"%{q}%"),
                    Invoice.party_id.in_(party_ids),
                    Invoice.id.in_(by_device),
                )
            )
        found = list(
            db.scalars(
                dated(stmt, Invoice.date)
                .order_by(Invoice.date.desc(), Invoice.created_at.desc())
                .limit(PER_KIND)
            )
        )
        sale_hits = [i.id for i in found]
        if "sale" in want:
            for inv in found:
                if inv.status == InvoiceStatus.VOID:
                    st, due = "void", ZERO
                elif inv.status == InvoiceStatus.RETURNED:
                    st, due = "returned", ZERO
                else:
                    due = max(ZERO, inv.total - inv.returned_total - inv.paid)
                    st = "due" if due > 0 else "paid"
                rows.append(
                    base(
                        "sale",
                        inv,
                        total=inv.total,
                        paid=inv.paid,
                        due=due,
                        state_=st,
                        devices=[ln.device_id for ln in inv.lines if ln.device_id],
                    )
                )

    purchase_hits: list[uuid.UUID] = []
    if "purchase" in want or "purchase_return" in want:
        stmt = select(Purchase).where(Purchase.shop_id == shop_id)
        if q:
            by_device = select(PurchaseLine.purchase_id).where(
                PurchaseLine.device_id.in_(device_ids)
            )
            stmt = stmt.where(
                or_(
                    Purchase.no.ilike(f"%{q}%"),
                    Purchase.reference.ilike(f"%{q}%"),
                    Purchase.party_id.in_(party_ids),
                    Purchase.id.in_(by_device),
                )
            )
        found = list(
            db.scalars(
                dated(stmt, Purchase.date)
                .order_by(Purchase.date.desc(), Purchase.created_at.desc())
                .limit(PER_KIND)
            )
        )
        purchase_hits = [p.id for p in found]
        if "purchase" in want:
            for pur in found:
                if pur.status == PurchaseStatus.VOIDED:
                    st, due = "void", ZERO
                else:
                    # here "due" is what the shop still has to pay the seller
                    due = max(ZERO, pur.total - pur.returned_total - pur.paid)
                    st = "due" if due > 0 else "paid"
                rows.append(
                    base(
                        "purchase",
                        pur,
                        total=pur.total,
                        paid=pur.paid,
                        due=due,
                        state_=st,
                        devices=[ln.device_id for ln in pur.lines if ln.device_id],
                    )
                )

    for rk, kind_, model, hits in (
        (ReturnKind.SALE, "sale_return", Invoice, sale_hits),
        (ReturnKind.PURCHASE, "purchase_return", Purchase, purchase_hits),
    ):
        if kind_ not in want:
            continue
        stmt = select(ReturnDoc).where(ReturnDoc.shop_id == shop_id, ReturnDoc.kind == rk)
        if q:
            stmt = stmt.where(
                or_(
                    ReturnDoc.no.ilike(f"%{q}%"),
                    ReturnDoc.document_no.ilike(f"%{q}%"),
                    ReturnDoc.party_id.in_(party_ids),
                    ReturnDoc.document_id.in_(hits),
                )
            )
        for r in db.scalars(
            dated(stmt, ReturnDoc.date)
            .order_by(ReturnDoc.date.desc(), ReturnDoc.created_at.desc())
            .limit(PER_KIND)
        ):
            devices = [
                uuid.UUID(str(ln["device_id"])) for ln in (r.lines or []) if ln.get("device_id")
            ]
            rows.append(
                base(
                    kind_,
                    r,
                    total=r.amount,
                    paid=r.refund_amount,
                    due=ZERO,
                    state_="returned",
                    devices=devices,
                    ref=db.get(model, r.document_id),
                )
            )

    if "repair" in want:
        stmt = select(RepairJob).where(RepairJob.shop_id == shop_id)
        if q:
            conds = [
                RepairJob.no.ilike(f"%{q}%"),
                RepairJob.party_id.in_(party_ids),
                RepairJob.device_desc.ilike(f"%{q}%"),
            ]
            if len(digits) >= 4:
                conds.append(RepairJob.imei.like(f"%{digits}%"))
            stmt = stmt.where(or_(*conds))
        # repair jobs have no bill date column; the day the phone came in is used
        found = db.scalars(stmt.order_by(RepairJob.created_at.desc()).limit(PER_KIND))
        for job in found:
            day = local_date(job.created_at)
            if (date_from and day < date_from) or (date_to and day > date_to):
                continue
            if job.status in OPEN_STATUSES:
                st, due = "open", ZERO
            elif job.status == RepairStatus.DELIVERED:
                due = max(ZERO, job.total - job.paid)
                st = "due" if due > 0 else "paid"
            else:  # returned unrepaired / unclaimed
                st, due = "void", ZERO
            row = base(
                "repair",
                job,
                total=job.total,
                paid=job.paid,
                due=due,
                state_=st,
                devices=[job.device_id] if job.device_id else [],
            )
            row["date"] = day
            row["items"] = row["items"] or job.device_desc
            rows.append(row)

    if state:
        rows = [r for r in rows if r["state"] == state]
    rows.sort(key=lambda r: (r["date"], r["created_at"]), reverse=True)
    return rows[:limit]


def totals(rows: list[dict]) -> dict[str, Decimal]:
    """sum of what is still due on the listed sales (to get) and purchases (to pay)"""
    get = sum((r["due"] for r in rows if r["kind"] in ("sale", "repair")), ZERO)
    give = sum((r["due"] for r in rows if r["kind"] == "purchase"), ZERO)
    return {"to_get": money(get), "to_give": money(give)}
