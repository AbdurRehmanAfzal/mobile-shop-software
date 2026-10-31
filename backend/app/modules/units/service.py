"""Unit-wise money (owner 2026-10-30): what one phone cost and what is still owed for it, what it
sold for and what is still to come in, every payment on it, its margin — and the same per person:
each phone bought from or sold to them with agreed / paid / remaining, payables and receivables
kept apart.

Nothing new is recorded. It is all read from what the shop already keeps: purchase and invoice
lines (the device per line), the documents' `paid`, each payment's allocations (document + amount)
and the ledger. A payment allocated to a bill with several phones is attributed to each phone in
proportion to its line; the bill total is shown beside it so the shopkeeper sees why."""

import datetime as dt
import uuid
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import NotFound
from app.db.base import ZERO
from app.db.refs import user_name
from app.modules.auth.models import User
from app.modules.devices.models import Device, DeviceEvent
from app.modules.devices.service import get_device, get_device_out
from app.modules.ledger.service import money
from app.modules.parties.models import Party
from app.modules.payments.models import Payment
from app.modules.purchases.models import Purchase, PurchaseLine, PurchaseStatus
from app.modules.returns.models import ReturnDoc
from app.modules.sales.models import Invoice, InvoiceLine, InvoiceStatus

UTC = dt.UTC


def _share(doc_total: Decimal, line_total: Decimal, amount: Decimal) -> Decimal:
    if doc_total <= ZERO or line_total >= doc_total:
        return money(amount)
    return money(amount * line_total / doc_total)


def _payments_on(
    db: Session, shop_id: uuid.UUID, party_id: uuid.UUID, doc_type: str, doc_id
) -> list[tuple[Payment, Decimal]]:
    """Posted payments of that person that were allocated to this document, oldest first."""
    pays = db.scalars(
        select(Payment)
        .where(Payment.shop_id == shop_id, Payment.party_id == party_id, Payment.status == "posted")
        .order_by(Payment.date, Payment.created_at)
    ).all()
    out = []
    for p in pays:
        for a in p.allocations or []:
            if a.get("document_type") == doc_type and a.get("document_id") == str(doc_id):
                out.append((p, money(a["amount"])))
    return out


def _at(p: Payment) -> dt.datetime:
    """Backdated payments sort by their date, not by when they were typed in."""
    created = p.created_at
    if created is not None and created.tzinfo is None:
        created = created.replace(tzinfo=UTC)
    if created is not None and created.astimezone(UTC).date() == p.date:
        return created
    return dt.datetime.combine(p.date, dt.time(12, 0), tzinfo=UTC)


def _party(db: Session, party_id) -> Party | None:
    return db.get(Party, party_id) if party_id else None


def _pay_row(p: Payment, amount: Decimal, kind: str) -> dict:
    return {
        "kind": kind,  # payment_out | payment_in
        "at": _at(p),
        "date": p.date,
        "payment_id": p.id,
        "no": p.no,
        "amount": amount,
        "payment_amount": p.amount,
        "method": p.method,
        "reference": p.reference,
        "notes": p.notes,
    }


def _side(
    db: Session,
    shop_id: uuid.UUID,
    doc,
    line_total: Decimal,
    doc_type: str,
    returned_at,
    asking=None,
) -> dict:
    """One side of a phone's money: the document, this phone's share, the payments on it."""
    party = _party(db, doc.party_id)
    allocs = _payments_on(db, shop_id, doc.party_id, doc_type, doc.id) if doc.party_id else []
    allocated_doc = sum((a for _, a in allocs), ZERO)
    upfront_doc = money(max(ZERO, doc.paid - allocated_doc))  # paid when the bill was made
    upfront = _share(doc.total, line_total, upfront_doc)
    pay_kind = "payment_out" if doc_type == "purchase" else "payment_in"
    payments = [_pay_row(p, _share(doc.total, line_total, a), pay_kind) for p, a in allocs]
    paid = money(upfront + sum((r["amount"] for r in payments), ZERO))
    remaining = ZERO if returned_at else money(max(ZERO, line_total - paid))
    return {
        "doc_type": doc_type,
        "doc_id": doc.id,
        "no": doc.no,
        "date": doc.date,
        "party_id": doc.party_id,
        "party_name": party.name if party else None,
        "party_phone": party.phone if party else None,
        "line_total": line_total,
        "doc_total": doc.total,
        "doc_paid": doc.paid,
        "shared_bill": doc.total > line_total,
        "upfront": upfront,
        "payments": payments,
        "paid": paid,
        "remaining": remaining,
        "returned_at": returned_at,
        "asking_at_sale": money(asking) if asking is not None else None,
    }


def _returns_for(db: Session, shop_id: uuid.UUID, device_id: uuid.UUID, doc_ids: set) -> list[dict]:
    rows = (
        db.scalars(
            select(ReturnDoc).where(
                ReturnDoc.shop_id == shop_id, ReturnDoc.document_id.in_(list(doc_ids))
            )
        ).all()
        if doc_ids
        else []
    )
    out = []
    for r in rows:
        if any(str(ln.get("device_id")) == str(device_id) for ln in (r.lines or [])):
            party = _party(db, r.party_id)
            out.append(
                {
                    "kind": "return_" + r.kind,  # return_sale | return_purchase
                    "at": dt.datetime.combine(r.date, dt.time(12, 0), tzinfo=UTC)
                    if not r.created_at
                    else (
                        r.created_at if r.created_at.tzinfo else r.created_at.replace(tzinfo=UTC)
                    ),
                    "date": r.date,
                    "return_id": r.id,
                    "no": r.no,
                    "doc_no": r.document_no,
                    "document_type": "invoice" if r.kind == "sale" else "purchase",
                    "document_id": r.document_id,
                    "party_id": r.party_id,
                    "amount": r.amount,
                    "refund": r.refund_amount,
                    "kept": r.kept_amount,
                    "party_name": party.name if party else None,
                    "reason": r.reason,
                }
            )
    return out


def _original_asking(events, d) -> Decimal | None:
    """The first asking price ever set: on the intake event, else the first change's 'from'."""
    for e, _pn, _un in events:
        if e.type == "purchased" and (e.data or {}).get("asking"):
            return Decimal(e.data["asking"])
    for e, _pn, _un in events:
        if e.type == "price_changed" and (e.data or {}).get("from"):
            return Decimal(e.data["from"])
    return money(d.asking_price) if d.asking_price is not None else None


def device_money(db: Session, shop_id: uuid.UUID, device_id: uuid.UUID, *, can_cost: bool) -> dict:
    d = get_device(db, shop_id, device_id)
    # every purchase and sale this phone was ever on (a phone can come back and be sold again)
    pl = db.execute(
        select(PurchaseLine, Purchase)
        .join(Purchase, Purchase.id == PurchaseLine.purchase_id)
        .where(
            Purchase.shop_id == shop_id,
            PurchaseLine.device_id == device_id,
            Purchase.status == PurchaseStatus.POSTED,
        )
        .order_by(Purchase.date, Purchase.created_at)
    ).all()
    il = db.execute(
        select(InvoiceLine, Invoice)
        .join(Invoice, Invoice.id == InvoiceLine.invoice_id)
        .where(
            Invoice.shop_id == shop_id,
            InvoiceLine.device_id == device_id,
            Invoice.status != InvoiceStatus.VOID,
        )
        .order_by(Invoice.date, Invoice.created_at)
    ).all()
    purchases = [
        _side(db, shop_id, doc, money(ln.net_cost), "purchase", ln.returned_at) for ln, doc in pl
    ]
    sales = [
        _side(db, shop_id, doc, money(ln.line_total), "invoice", ln.returned_at, ln.asking_price)
        for ln, doc in il
    ]
    purchase = next(
        (p for p in reversed(purchases) if not p["returned_at"]),
        purchases[-1] if purchases else None,
    )
    sale = next((s for s in reversed(sales) if not s["returned_at"]), None)
    returns = _returns_for(
        db, shop_id, device_id, {p["doc_id"] for p in purchases} | {s["doc_id"] for s in sales}
    )

    # the story in order: events, bills, payments, returns
    timeline: list[dict] = []
    ev = db.execute(
        select(DeviceEvent, Party.name, User.name)
        .outerjoin(Party, Party.id == DeviceEvent.party_id)
        .outerjoin(User, User.id == DeviceEvent.user_id)
        .where(DeviceEvent.device_id == device_id)
        .order_by(DeviceEvent.seq)
    ).all()
    cost = (
        purchase["line_total"]
        if purchase
        else (money(d.cost_price) if d.cost_price is not None else None)
    )
    sold_for = sale["line_total"] if sale else None
    summary = {
        "status": d.status,
        "source": "purchase"
        if purchase
        else ("opening_stock" if d.cost_price is not None else None),
        "cost": cost,
        "paid_out": purchase["paid"] if purchase else (cost if cost is not None else None),
        "payable": purchase["remaining"] if purchase else ZERO,
        "asking_price": d.asking_price,
        "original_asking": _original_asking(ev, d),
        "sold_for": sold_for,
        "received": sale["paid"] if sale else ZERO,
        "receivable": sale["remaining"] if sale else ZERO,
        "margin": money(sold_for - cost) if sold_for is not None and cost is not None else None,
        "refunded": sum((r["refund"] for r in returns), ZERO),
    }

    for e, pn, un in ev:
        if e.type in ("purchased", "sold"):
            continue  # the bill rows below say it with the money
        at = e.at if e.at.tzinfo else e.at.replace(tzinfo=UTC)
        timeline.append(
            {
                "kind": "event",
                "event": e.type,
                "event_id": e.id,
                "at": at,
                "date": at.date(),
                "party_name": pn,
                "party_id": e.party_id,
                "user_name": un,
                "document_type": e.document_type,
                "document_id": e.document_id,
                "amount": e.amount if (e.type != "purchased" or can_cost) else None,
                "data": e.data,
            }
        )
    for side, kind in [(p, "purchase") for p in purchases] + [(s, "sale") for s in sales]:
        at = dt.datetime.combine(side["date"], dt.time(0, 1), tzinfo=UTC)
        timeline.append(
            {
                "kind": kind,
                "at": at,
                "date": side["date"],
                "no": side["no"],
                "doc_id": side["doc_id"],
                "doc_type": side["doc_type"],
                "party_id": side["party_id"],
                "party_name": side["party_name"],
                "amount": side["line_total"],
                "upfront": side["upfront"],
                "remaining_then": money(side["line_total"] - side["upfront"]),
                "shared_bill": side["shared_bill"],
                "doc_total": side["doc_total"],
            }
        )
        for pr in side["payments"]:
            timeline.append(
                {
                    **pr,
                    "doc_no": side["no"],
                    "party_name": side["party_name"],
                    "party_id": side["party_id"],
                }
            )
    timeline += returns
    timeline.sort(key=lambda r: r["at"])
    # running balances on this unit after each money row
    pay_bal = rec_bal = ZERO
    for r in timeline:
        if r["kind"] == "purchase":
            pay_bal = money(pay_bal + r["amount"] - r["upfront"])
        elif r["kind"] == "payment_out":
            pay_bal = money(pay_bal - r["amount"])
        elif r["kind"] == "sale":
            rec_bal = money(rec_bal + r["amount"] - r["upfront"])
        elif r["kind"] == "payment_in":
            rec_bal = money(rec_bal - r["amount"])
        elif r["kind"] == "return_sale":
            rec_bal = ZERO
        elif r["kind"] == "return_purchase":
            pay_bal = ZERO
        r["payable_after"] = pay_bal
        r["receivable_after"] = rec_bal

    if not can_cost:
        for p in purchases:
            for k in ("line_total", "doc_total", "doc_paid", "upfront", "paid", "remaining"):
                p[k] = None
            for pr in p["payments"]:
                pr["amount"] = None
        for k in ("cost", "paid_out", "payable", "margin"):
            summary[k] = None
        for r in timeline:
            if r["kind"] in ("purchase", "payment_out"):
                for k in ("amount", "upfront", "remaining_then", "doc_total", "payment_amount"):
                    r.pop(k, None)
            r.pop("payable_after", None)
            if r["kind"] == "event" and r.get("event") == "purchased":
                r["amount"] = None

    return {
        "device": get_device_out(db, shop_id, device_id),
        "purchase": purchase,
        "sale": sale,
        "purchases": purchases,
        "sales": sales,
        "returns": returns,
        "summary": summary,
        "timeline": timeline,
    }


def party_units(db: Session, shop_id: uuid.UUID, party_id: uuid.UUID, *, can_cost: bool) -> dict:
    """Every phone bought from or sold to this person, with agreed / paid / remaining; the
    payables and receivables totals kept apart; what the ledger balance holds beyond them."""
    party = db.get(Party, party_id)
    if party is None or party.shop_id != shop_id:
        raise NotFound(code="party_not_found")
    rows: list[dict] = []
    pl = db.execute(
        select(PurchaseLine, Purchase, Device)
        .join(Purchase, Purchase.id == PurchaseLine.purchase_id)
        .join(Device, Device.id == PurchaseLine.device_id)
        .where(
            Purchase.shop_id == shop_id,
            Purchase.party_id == party_id,
            Purchase.status == PurchaseStatus.POSTED,
        )
        .order_by(Purchase.date.desc(), Purchase.created_at.desc())
    ).all()
    il = db.execute(
        select(InvoiceLine, Invoice, Device)
        .join(Invoice, Invoice.id == InvoiceLine.invoice_id)
        .join(Device, Device.id == InvoiceLine.device_id)
        .where(
            Invoice.shop_id == shop_id,
            Invoice.party_id == party_id,
            Invoice.status != InvoiceStatus.VOID,
        )
        .order_by(Invoice.date.desc(), Invoice.created_at.desc())
    ).all()
    for ln, doc, dev in pl:
        side = _side(db, shop_id, doc, money(ln.net_cost), "purchase", ln.returned_at)
        rows.append({"role": "bought_from", **_unit_row(db, shop_id, dev, side)})
    for ln, doc, dev in il:
        side = _side(db, shop_id, doc, money(ln.line_total), "invoice", ln.returned_at)
        rows.append({"role": "sold_to", **_unit_row(db, shop_id, dev, side)})
    rows.sort(key=lambda r: (r["date"], r["no"]), reverse=True)
    payable = sum((r["remaining"] for r in rows if r["role"] == "bought_from"), ZERO)
    receivable = sum((r["remaining"] for r in rows if r["role"] == "sold_to"), ZERO)
    balance = money(party.balance)  # + = they owe the shop
    other = money(balance - (receivable - payable))  # opening balances, misc items, adjustments
    pending = sum(1 for r in rows if r["remaining"] > ZERO)
    if not can_cost:
        for r in rows:
            if r["role"] == "bought_from":
                for k in ("agreed", "paid", "remaining", "upfront"):
                    r[k] = None
    return {
        "party_id": party.id,
        "name": party.name,
        "balance": balance,
        "receivable": receivable,
        "payable": payable if can_cost else None,
        "other": other if can_cost else None,
        "bought_count": sum(1 for r in rows if r["role"] == "bought_from"),
        "sold_count": sum(1 for r in rows if r["role"] == "sold_to"),
        "pending_count": pending,
        "rows": rows,
    }


def _unit_row(db: Session, shop_id: uuid.UUID, dev: Device, side: dict) -> dict:
    out = get_device_out(db, shop_id, dev.id)
    return {
        "date": side["date"],
        "device_id": dev.id,
        "label": f"{out['brand_name']} {out['model_name']}",
        "imei1": dev.imei1,
        "storage_name": out.get("storage_name"),
        "colour_name": out.get("colour_name"),
        "status": dev.status,
        "doc_type": side["doc_type"],
        "doc_id": side["doc_id"],
        "no": side["no"],
        "agreed": side["line_total"],
        "upfront": side["upfront"],
        "paid": side["paid"],
        "remaining": side["remaining"],
        "payments": len(side["payments"]),
        "settled": side["remaining"] <= ZERO,
        "returned_at": side["returned_at"],
        "shared_bill": side["shared_bill"],
    }


# ---- the payment receipt / voucher ---------------------------------------------------------


def payment_receipt_html(
    db: Session, shop_id: uuid.UUID, payment_id: uuid.UUID, fmt: str, lang: str | None
) -> str:
    import html

    from app.modules.auth.models import Shop
    from app.modules.ledger.models import LedgerEntry, LedgerGroup

    p = db.get(Payment, payment_id)
    if p is None or p.shop_id != shop_id:
        raise NotFound(code="payment_not_found")
    shop = db.get(Shop, shop_id)
    party = _party(db, p.party_id)
    lang = lang if lang in ("en", "ur") else (shop.default_locale or "ur")
    ur = lang == "ur"
    T = {
        "in": "وصولی کی رسید" if ur else "Payment received",
        "out": "ادائیگی کا واؤچر" if ur else "Payment voucher",
        "from": "سے وصول" if ur else "Received from",
        "to": "کو ادا" if ur else "Paid to",
        "amount": "رقم" if ur else "Amount",
        "method": "طریقہ" if ur else "Paid by",
        "date": "تاریخ" if ur else "Date",
        "for": "کس مد میں" if ur else "Against",
        "bill": "بل" if ur else "Bill",
        "phone": "موبائل" if ur else "Phone",
        "this": "یہ ادائیگی" if ur else "This payment",
        "left": "اب باقی" if ur else "Left now",
        "balance": "کھاتے کا بقایا" if ur else "Account balance after",
        "owes": "گاہک پر" if ur else "they owe",
        "owed": "دکان پر" if ur else "shop owes",
        "by": "درج کیا" if ur else "Recorded by",
        "notes": "نوٹ" if ur else "Notes",
        "thanks": shop.receipt_footer_ur or "شکریہ" if ur else shop.receipt_footer or "Thank you",
        "void": "منسوخ" if ur else "VOID",
    }
    e = html.escape
    method = {
        "cash": ("نقد", "Cash"),
        "online": ("آن لائن", "Online"),
        "cheque": ("چیک", "Cheque"),
        "bank": ("بینک", "Bank"),
        "remittance": ("بیرونِ ملک سے", "Remittance"),
    }.get(p.method, (p.method, p.method))[0 if ur else 1]
    # the party's ledger balance right after this payment
    bal_after = None
    if p.ledger_group_id:
        g = db.get(LedgerGroup, p.ledger_group_id)
        if g is not None:
            from sqlalchemy import func

            bal_after = money(
                db.scalar(
                    select(
                        func.coalesce(func.sum(LedgerEntry.debit - LedgerEntry.credit), 0)
                    ).where(
                        LedgerEntry.shop_id == shop_id,
                        LedgerEntry.party_id == p.party_id,
                        LedgerEntry.at <= g.at,
                    )
                )
                or 0
            )
    rows = ""
    for a in p.allocations or []:
        doc_id = uuid.UUID(a["document_id"])
        if a["document_type"] == "invoice":
            doc = db.get(Invoice, doc_id)
            lines = (
                db.scalars(
                    select(InvoiceLine).where(
                        InvoiceLine.invoice_id == doc_id, InvoiceLine.device_id.is_not(None)
                    )
                ).all()
                if doc
                else []
            )
        else:
            doc = db.get(Purchase, doc_id)
            lines = (
                db.scalars(
                    select(PurchaseLine).where(
                        PurchaseLine.purchase_id == doc_id, PurchaseLine.device_id.is_not(None)
                    )
                ).all()
                if doc
                else []
            )
        phones = []
        for ln in lines[:3]:
            o = get_device_out(db, shop_id, ln.device_id)
            phones.append(f"{o['brand_name']} {o['model_name']} · {o['imei1']}")
        left = money(doc.total - doc.paid) if doc else ZERO
        rows += f"<tr><td>{e(a['document_no'])}<br><small>{e(' / '.join(phones))}</small></td><td class='n'>{money(a['amount']):,.0f}</td><td class='n'>{left:,.0f}</td></tr>"
    width = "72mm" if fmt == "thermal" else "190mm"
    shop_name = e(shop.name_ur) if ur and shop.name_ur else e(shop.name)
    who = T["from"] if p.direction == "in" else T["to"]
    bal_html = ""
    if bal_after is not None and bal_after != 0:
        bal_html = f"<div class='row'><span>{T['balance']}</span><b>{abs(bal_after):,.0f} ({T['owes'] if bal_after > 0 else T['owed']})</b></div>"
    css = f"""*{{box-sizing:border-box}}body{{font-family:Arial,'Noto Nastaliq Urdu',sans-serif;margin:0;padding:6mm;width:{width};color:#000;direction:{"rtl" if ur else "ltr"}}}
    h1{{font-size:15px;margin:0 0 2px}}h2{{font-size:13px;margin:0 0 6px;font-weight:600}}.no{{font-family:monospace;font-size:12px}}.amt{{font-size:26px;font-weight:800;margin:8px 0;text-align:center;direction:ltr}}
    .row{{display:flex;justify-content:space-between;font-size:12px;padding:2px 0}}table{{width:100%;border-collapse:collapse;font-size:12px;margin-top:6px}}td,th{{padding:3px 0;border-bottom:1px dashed #999;vertical-align:top}}th{{text-align:start}}.n{{text-align:end;direction:ltr;white-space:nowrap}}.void{{color:#b00;font-weight:800;text-align:center}}.foot{{margin-top:8px;text-align:center;font-size:11px}}
    @page{{size:{"80mm auto" if fmt == "thermal" else "A5"};margin:0}}"""
    body = f"""<h1>{shop_name}</h1>{f"<div class='row'><span>{e(shop.phone or '')}</span><span>{e(shop.city or '')}</span></div>" if shop.phone or shop.city else ""}
    <h2>{T["in"] if p.direction == "in" else T["out"]} <span class='no'>{e(p.no)}</span></h2>
    {"<div class='void'>" + T["void"] + "</div>" if p.status != "posted" else ""}
    <div class='row'><span>{T["date"]}</span><b dir='ltr'>{p.date.strftime("%d-%m-%Y")}</b></div>
    <div class='row'><span>{who}</span><b>{e(party.name if party else "")}{(" · " + e(party.phone)) if party and party.phone else ""}</b></div>
    <div class='amt'>Rs. {p.amount:,.0f}</div>
    <div class='row'><span>{T["method"]}</span><b>{e(method)}{(" · " + e(p.reference)) if p.reference else ""}</b></div>
    {f"<table><tr><th>{T['for']}</th><th class='n'>{T['this']}</th><th class='n'>{T['left']}</th></tr>{rows}</table>" if rows else ""}
    {bal_html}
    {f"<div class='row'><span>{T['notes']}</span><span>{e(p.notes)}</span></div>" if p.notes else ""}
    <div class='row'><span>{T["by"]}</span><span>{e(user_name(db, p.created_by) or "")}</span></div>
    <div class='foot'>{e(T["thanks"])}</div>"""
    return f"<!doctype html><html lang='{lang}'><head><meta charset='utf-8'><title>{e(p.no)}</title><style>{css}</style></head><body>{body}</body></html>"
