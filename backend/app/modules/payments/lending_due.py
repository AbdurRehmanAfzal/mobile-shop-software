"""Len-den return dates and reminders (docs/32 §7, owner 2026-11-02).

A len-den entry may carry the date the money is to come back (`due_date`). Per person, the date that
counts is the earliest one among their still-open entries on the side the person is on:
- they owe the shop (money lent) → the customer is reminded on WhatsApp, by hand or by the night job
  (a day before, on the day, then every 3 days while late);
- the shop owes them (money borrowed) → the owner sees it on the home screen and in the audit.

Everything is derived from the payments; only `reminded_at` is stamped when a reminder goes out."""

import datetime as dt
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import today as shop_today
from app.core.errors import NotFound, ValidationFailed
from app.db.base import ZERO, utcnow
from app.modules.audit.service import record_audit
from app.modules.auth.models import Shop
from app.modules.ledger.service import money
from app.modules.notifications.models import Channel, Message
from app.modules.notifications.service import fmt, lang_for, queue, settings_for
from app.modules.parties.models import Party
from app.modules.payments.models import Payment, PaymentPurpose
from app.modules.payments.service import _unallocated, get_payment

DUE = "lending_due"
LATE = "lending_late"
SOON_DAYS = 3
EVERY_DAYS = 3  # at most one automatic reminder per person in this many days


def _aware(t: dt.datetime | None) -> dt.datetime | None:
    if t is not None and t.tzinfo is None:
        return t.replace(tzinfo=dt.UTC)
    return t


def status_of(due: dt.date, today: dt.date) -> str:
    if due < today:
        return "late"
    if due == today:
        return "today"
    if due <= today + dt.timedelta(days=SOON_DAYS):
        return "soon"
    return "later"


def due_by_party(
    db: Session,
    shop_id: uuid.UUID,
    party_ids: list[uuid.UUID] | None = None,
    today: dt.date | None = None,
) -> dict[uuid.UUID, dict]:
    """party -> {side, amount, due_date, days_late, status, reminded_at, entries} for every person
    whose open len-den has a return date."""
    today = today or shop_today()
    stmt = select(Payment).where(
        Payment.shop_id == shop_id,
        Payment.purpose == PaymentPurpose.LENDING,
        Payment.status == "posted",
    )
    if party_ids is not None:
        if not party_ids:
            return {}
        stmt = stmt.where(Payment.party_id.in_(party_ids))
    per: dict[uuid.UUID, list[Payment]] = {}
    for p in db.scalars(stmt).all():
        per.setdefault(p.party_id, []).append(p)
    out: dict[uuid.UUID, dict] = {}
    for pid, pays in per.items():
        bal = money(
            sum(((1 if p.direction == "out" else -1) * _unallocated(p) for p in pays), ZERO)
        )
        if bal == ZERO:
            continue
        direction = "out" if bal > ZERO else "in"
        open_ = [p for p in pays if p.direction == direction and _unallocated(p) > ZERO]
        dated = [p for p in open_ if p.due_date is not None]
        if not dated:
            continue
        due = min(p.due_date for p in dated)
        stamps = [_aware(p.reminded_at) for p in open_ if p.reminded_at is not None]
        out[pid] = {
            "side": "owes_us" if direction == "out" else "we_owe",
            "amount": abs(bal),
            "due_date": due,
            "days_late": max(0, (today - due).days),
            "status": status_of(due, today),
            "reminded_at": max(stamps) if stamps else None,
            "entries": [p.id for p in open_],
        }
    return out


def due_rows(db: Session, shop_id: uuid.UUID, today: dt.date | None = None) -> list[dict]:
    rows = due_by_party(db, shop_id, today=today)
    parties = (
        {x.id: x for x in db.scalars(select(Party).where(Party.id.in_(list(rows)))).all()}
        if rows
        else {}
    )
    out = [
        {
            "party_id": pid,
            "name": parties[pid].name if pid in parties else None,
            "phone": parties[pid].phone if pid in parties else None,
            **{k: v for k, v in r.items() if k != "entries"},
        }
        for pid, r in rows.items()
    ]
    out.sort(key=lambda r: (r["due_date"], r["name"] or ""))
    return out


def counts(db: Session, shop_id: uuid.UUID) -> dict:
    """for the home screen and the overview: people late / due today on money lent, and money the
    shop borrowed that is due within 3 days or late"""
    rows = due_by_party(db, shop_id).values()
    lent = [r for r in rows if r["side"] == "owes_us"]
    owed = [r for r in rows if r["side"] == "we_owe" and r["status"] != "later"]
    return {
        "lending_late": sum(1 for r in lent if r["status"] == "late"),
        "lending_due_today": sum(1 for r in lent if r["status"] == "today"),
        "lending_late_amount": money(
            sum((r["amount"] for r in lent if r["status"] == "late"), ZERO)
        ),
        "lending_we_owe_due": len(owed),
        "lending_we_owe_amount": money(sum((r["amount"] for r in owed), ZERO)),
    }


def set_due_date(
    db: Session, shop_id: uuid.UUID, user_id: uuid.UUID, payment_id: uuid.UUID, due: dt.date | None
) -> Payment:
    p = get_payment(db, shop_id, payment_id)
    if p.purpose != PaymentPurpose.LENDING or p.status != "posted":
        raise ValidationFailed(
            code="due_date_lending_only",
            message_en="A return date is only for a len-den entry",
            message_ur="واپسی کی تاریخ صرف لین دین پر ہوتی ہے",
        )
    before = p.due_date
    p.due_date = due
    p.updated_at = utcnow()
    record_audit(
        db,
        shop_id=shop_id,
        user_id=user_id,
        entity="payment",
        entity_id=p.id,
        action="due_date",
        before={"due_date": before.isoformat() if before else None},
        after={"due_date": due.isoformat() if due else None},
    )
    db.commit()
    return p


def _ctx(shop: Shop, party: Party, row: dict) -> dict:
    return {
        "shop": shop.name,
        "customer": party.name,
        "amount": fmt(row["amount"]),
        "due": row["due_date"].strftime("%d-%m-%Y"),
        "late": row["days_late"],
    }


def _queue(db: Session, shop: Shop, party: Party, row: dict) -> Message:
    msg = queue(
        db,
        shop,
        channel=Channel.WHATSAPP,
        audience="customer",
        recipient=party.phone,
        template_key=LATE if row["status"] == "late" else DUE,
        lang=lang_for(shop, settings_for(shop)),
        ctx=_ctx(shop, party, row),
        event_type="reminder",
        document_type="lending",
        document_id=None,
        party_id=party.id,
    )
    now = utcnow()
    for pid in row["entries"]:
        db.get(Payment, pid).reminded_at = now
    return msg


def remind(db: Session, shop: Shop, user_id: uuid.UUID, party_id: uuid.UUID) -> Message:
    """A WhatsApp reminder to a person who owes the shop len-den, sent by hand."""
    party = db.get(Party, party_id)
    if party is None or party.shop_id != shop.id:
        raise NotFound(code="party_not_found")
    row = due_by_party(db, shop.id, [party_id]).get(party_id)
    if row is None:
        # no return date typed: remind for what is open anyway
        from app.modules.payments.service import lending_balances

        bal = lending_balances(db, shop.id, [party_id]).get(party_id, ZERO)
        if bal > ZERO:
            pays = db.scalars(
                select(Payment).where(
                    Payment.shop_id == shop.id,
                    Payment.party_id == party_id,
                    Payment.purpose == PaymentPurpose.LENDING,
                    Payment.status == "posted",
                    Payment.direction == "out",
                )
            ).all()
            row = {
                "side": "owes_us",
                "amount": bal,
                "due_date": shop_today(),
                "days_late": 0,
                "status": "today",
                "entries": [p.id for p in pays if _unallocated(p) > ZERO],
            }
    if row is None or row["side"] != "owes_us":
        raise ValidationFailed(
            code="nothing_to_remind",
            message_en="This person owes the shop no len-den",
            message_ur="اس شخص نے لین دین میں دکان کو کچھ نہیں دینا",
        )
    if not party.phone:
        raise ValidationFailed(
            code="no_phone", message_en="No phone number", message_ur="موبائل نمبر نہیں"
        )
    msg = _queue(db, shop, party, row)
    record_audit(
        db,
        shop_id=shop.id,
        user_id=user_id,
        entity="party",
        entity_id=party.id,
        action="lending_reminder",
        after={"amount": str(row["amount"])},
    )
    db.commit()
    return msg


def auto_reminders(db: Session, shop: Shop, today: dt.date | None = None) -> int:
    """The night job: a reminder to each person who owes len-den due tomorrow or earlier, at most
    one every 3 days per person."""
    today = today or shop_today()
    now = utcnow()
    rows = {
        pid: r
        for pid, r in due_by_party(db, shop.id, today=today).items()
        if r["side"] == "owes_us" and r["due_date"] <= today + dt.timedelta(days=1)
    }
    if not rows:
        return 0
    parties = {x.id: x for x in db.scalars(select(Party).where(Party.id.in_(list(rows)))).all()}
    n = 0
    for pid, r in rows.items():
        party = parties.get(pid)
        if party is None or not party.phone or not party.is_active:
            continue
        last = r["reminded_at"]
        if last is not None and (now - last).days < EVERY_DAYS:
            continue
        _queue(db, shop, party, r)
        n += 1
    db.flush()
    return n
