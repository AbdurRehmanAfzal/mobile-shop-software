"""One-time corrections of postings made before the accounting audit (owner 2026-11-05, ADR-048).

The ledger is append-only: nothing is changed or removed. Each correction is a new balanced group,
dated like the posting it corrects (so reports by period stay right), marked
`document_type = "correction:<kind>"` with the corrected entry / document as `document_id`, and
never posted twice. Safe to run any number of times.

1. A sale's typed "other item" with a buying price took its cost out of stock (inventory) although it
   was never in stock — the stock value went below zero. Correct: that cost comes from the owner's
   goods (equity). The same for a void of such a sale and for a customer return of such a line.
2. Money posted to the old `purchases` account (a dealer bill's other item, its return or void, and a
   supplier return of a stock item) moves to where it belongs: spending on items not kept in stock
   (`expense:other_purchases`), or the stock (inventory) for a returned stock item.
"""

import uuid
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.base import ZERO
from app.modules.ledger import accounts as acc
from app.modules.ledger.models import LedgerEntry, LedgerGroup
from app.modules.ledger.service import Posting, money, post

CENT = Decimal("0.01")


def _done(db: Session, kind: str, ref: uuid.UUID) -> bool:
    return (
        db.scalar(
            select(LedgerGroup.id).where(
                LedgerGroup.document_type == f"correction:{kind}", LedgerGroup.document_id == ref
            )
        )
        is not None
    )


def _stock_move(db: Session, group_id: uuid.UUID) -> Decimal:
    """Σ(debit − credit) on inventory lines of a group that are not a phone's (items)"""
    v = db.scalar(
        select(func.coalesce(func.sum(LedgerEntry.debit - LedgerEntry.credit), 0)).where(
            LedgerEntry.group_id == group_id,
            LedgerEntry.account == acc.SysAccount.INVENTORY,
            LedgerEntry.device_id.is_(None),
        )
    )
    return money(v or 0)


def _fix(
    db: Session, g: LedgerGroup, kind: str, amount: Decimal, stock_was_credited: bool, memo: str
) -> None:
    """undo a wrong stock movement of `amount` on group g, moving it to the owner's goods"""
    p = Posting(document_type=f"correction:{kind}", document_id=g.id, memo=memo, at=g.at)
    if stock_was_credited:
        p.debit(acc.SysAccount.INVENTORY, amount).credit(acc.SysAccount.EQUITY, amount)
    else:
        p.debit(acc.SysAccount.EQUITY, amount).credit(acc.SysAccount.INVENTORY, amount)
    post(db, g.shop_id, None, p)


def fix_typed_sale_items(db: Session) -> int:
    from app.modules.returns.models import ReturnDoc
    from app.modules.sales.models import Invoice, InvoiceLine

    n = 0
    # sales and their voids
    rows = db.execute(
        select(InvoiceLine.invoice_id, func.sum(InvoiceLine.cost))
        .where(InvoiceLine.kind == "misc", InvoiceLine.accessory_id.is_(None), InvoiceLine.cost > 0)
        .group_by(InvoiceLine.invoice_id)
    ).all()
    for invoice_id, typed_cost in rows:
        typed_cost = money(typed_cost)
        inv = db.get(Invoice, invoice_id)
        stock_items = money(
            db.scalar(
                select(func.coalesce(func.sum(InvoiceLine.cost), 0)).where(
                    InvoiceLine.invoice_id == invoice_id,
                    InvoiceLine.kind == "misc",
                    InvoiceLine.accessory_id.is_not(None),
                )
            )
            or 0
        )
        groups = db.scalars(
            select(LedgerGroup).where(
                LedgerGroup.shop_id == inv.shop_id,
                LedgerGroup.document_id == invoice_id,
                LedgerGroup.document_type.in_(("invoice", "reversal:invoice")),
            )
        ).all()
        for g in groups:
            if _done(db, "typed_item", g.id):
                continue
            sign = (
                -1 if g.document_type == "invoice" else 1
            )  # a sale credits stock, its void debits it
            extra = money(sign * _stock_move(db, g.id) - stock_items)
            if abs(extra - typed_cost) < CENT:
                _fix(
                    db,
                    g,
                    "typed_item",
                    typed_cost,
                    g.document_type == "invoice",
                    f"Correction: typed item cost of {inv.no} is the owner's goods, not stock",
                )
                n += 1
    # customer returns of such lines
    for doc in db.scalars(
        select(ReturnDoc).where(ReturnDoc.kind == "sale", ReturnDoc.ledger_group_id.is_not(None))
    ).all():
        ids = [
            uuid.UUID(ln["invoice_line_id"]) for ln in doc.lines or [] if ln.get("invoice_line_id")
        ]
        if not ids:
            continue
        lines = db.scalars(select(InvoiceLine).where(InvoiceLine.id.in_(ids))).all()
        typed = money(
            sum((ln.cost for ln in lines if ln.kind == "misc" and ln.accessory_id is None), ZERO)
        )
        items = money(
            sum(
                (ln.cost for ln in lines if ln.kind == "misc" and ln.accessory_id is not None), ZERO
            )
        )
        if typed <= 0:
            continue
        for g in db.scalars(
            select(LedgerGroup).where(
                LedgerGroup.shop_id == doc.shop_id, LedgerGroup.id == doc.ledger_group_id
            )
        ).all():
            if _done(db, "typed_item", g.id):
                continue
            extra = money(_stock_move(db, g.id) - items)
            if abs(extra - typed) < CENT:
                _fix(
                    db,
                    g,
                    "typed_item",
                    typed,
                    False,
                    f"Correction: typed item returned on {doc.no} goes back to the owner's goods, not stock",
                )
                n += 1
    return n


def fix_old_purchases_account(db: Session) -> int:
    from app.modules.purchases.models import PurchaseLine
    from app.modules.returns.models import ReturnDoc

    n = 0
    entries = db.scalars(
        select(LedgerEntry)
        .join(LedgerGroup, LedgerGroup.id == LedgerEntry.group_id)
        .where(
            LedgerEntry.account == acc.SysAccount.PURCHASES,
            ~LedgerGroup.document_type.like("correction:%"),
        )
        .order_by(LedgerEntry.at)
    ).all()
    for e in entries:
        if _done(db, "purchases", e.id):
            continue
        g = db.get(LedgerGroup, e.group_id)
        p = Posting(
            document_type="correction:purchases",
            document_id=e.id,
            memo=f"Correction: {e.memo or 'other item'} moved off the old purchases account",
            at=g.at,
        )
        if e.debit > 0:  # a bill's other item (or the void of its return): spending
            p.debit(acc.OTHER_PURCHASES, e.debit, memo=e.memo).credit(
                acc.SysAccount.PURCHASES, e.debit
            )
        else:
            target = acc.OTHER_PURCHASES
            if g.document_type == "purchase_return":
                doc = db.scalar(select(ReturnDoc).where(ReturnDoc.ledger_group_id == g.id))
                for ln in (doc.lines if doc else []) or []:
                    pl = (
                        db.get(PurchaseLine, uuid.UUID(ln["purchase_line_id"]))
                        if ln.get("purchase_line_id")
                        else None
                    )
                    if (
                        pl is not None
                        and pl.accessory_id
                        and (ln.get("description") or pl.description) == e.memo
                    ):
                        target = (
                            acc.SysAccount.INVENTORY
                        )  # a stock item went back: it leaves the stock
                        break
            p.debit(acc.SysAccount.PURCHASES, e.credit).credit(target, e.credit, memo=e.memo)
        post(db, g.shop_id, None, p)
        n += 1
    return n


def run(db: Session) -> dict:
    out = {
        "typed_sale_items": fix_typed_sale_items(db),
        "purchases_account": fix_old_purchases_account(db),
    }
    db.commit()
    return out
