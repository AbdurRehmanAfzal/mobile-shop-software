"""PostingService: the only way money moves (ADR-002).

Every document module builds a list of `Line`s and calls `post()` inside its own transaction.
`post()` validates the group balances, writes the rows, refreshes cached party balances and
returns the group. Corrections go through `reverse()`; rows are never edited or deleted.
"""

import uuid
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.clock import local_day
from app.core.errors import AppError, Conflict, NotFound, ValidationFailed
from app.db.base import ZERO, utcnow
from app.modules.audit.service import record_audit
from app.modules.ledger import accounts as acc
from app.modules.ledger.models import CashAccount, CashAccountKind, LedgerEntry, LedgerGroup
from app.modules.parties.models import Party

CENT = Decimal("0.01")


def money(value: Decimal | str | float) -> Decimal:
    return Decimal(str(value)).quantize(CENT, rounding=ROUND_HALF_UP)


@dataclass(slots=True)
class Line:
    account: str
    debit: Decimal = ZERO
    credit: Decimal = ZERO
    party_id: uuid.UUID | None = None
    cash_account_id: uuid.UUID | None = None
    device_id: uuid.UUID | None = None
    memo: str | None = None

    def __post_init__(self):
        self.debit = money(self.debit)
        self.credit = money(self.credit)
        if acc.is_party(self.account) and self.party_id is None:
            self.party_id = acc.id_of(self.account)
        if acc.is_cash(self.account) and self.cash_account_id is None:
            self.cash_account_id = acc.id_of(self.account)


@dataclass(slots=True)
class Posting:
    document_type: str
    memo: str | None = None
    document_id: uuid.UUID | None = None
    lines: list[Line] = field(default_factory=list)
    at: datetime | None = None

    def debit(self, account: str, amount, **kw) -> "Posting":
        self.lines.append(Line(account=account, debit=money(amount), **kw))
        return self

    def credit(self, account: str, amount, **kw) -> "Posting":
        self.lines.append(Line(account=account, credit=money(amount), **kw))
        return self


def at_for(day: date | None) -> datetime | None:
    """Ledger time for a document dated `day`: now when it is today (or unset), else noon UTC of
    that day (17:00 in Pakistan), so statements and day reports file it under its own date while
    entries typed today keep their real order."""
    from app.core.clock import today as shop_today

    if day is None or day >= shop_today():
        return None
    return datetime.combine(day, time(12, 0), tzinfo=UTC)


class Unbalanced(AppError):
    status_code = 500
    code = "ledger_unbalanced"
    message_en = "Internal error: posting does not balance"
    message_ur = "اندرونی خرابی: کھاتہ برابر نہیں"


def post(
    db: Session, shop_id: uuid.UUID, user_id: uuid.UUID | None, posting: Posting
) -> LedgerGroup:
    lines = [ln for ln in posting.lines if ln.debit != ZERO or ln.credit != ZERO]
    if not lines:
        raise ValidationFailed(code="ledger_empty")
    for ln in lines:
        if ln.debit < ZERO or ln.credit < ZERO or (ln.debit > ZERO and ln.credit > ZERO):
            raise Unbalanced(details={"line": ln.account})
    total_debit = sum((ln.debit for ln in lines), ZERO)
    total_credit = sum((ln.credit for ln in lines), ZERO)
    if total_debit != total_credit:
        raise Unbalanced(details={"debit": str(total_debit), "credit": str(total_credit)})

    at = posting.at or utcnow()
    group = LedgerGroup(
        shop_id=shop_id,
        document_type=posting.document_type,
        document_id=posting.document_id,
        memo=posting.memo,
        posted_by=user_id,
        at=at,
    )
    db.add(group)
    db.flush()
    touched_parties: set[uuid.UUID] = set()
    for i, ln in enumerate(lines):
        _check_account_belongs(db, shop_id, ln)
        db.add(
            LedgerEntry(
                shop_id=shop_id,
                group_id=group.id,
                seq=i,
                account=ln.account,
                party_id=ln.party_id,
                cash_account_id=ln.cash_account_id,
                device_id=ln.device_id,
                debit=ln.debit,
                credit=ln.credit,
                memo=ln.memo,
                at=at,
            )
        )
        if ln.party_id:
            touched_parties.add(ln.party_id)
    db.flush()
    for pid in touched_parties:
        refresh_party_balance(db, shop_id, pid)
    return group


def _check_account_belongs(db: Session, shop_id: uuid.UUID, ln: Line) -> None:
    if ln.party_id is not None:
        p = db.get(Party, ln.party_id)
        if p is None or p.shop_id != shop_id:
            raise NotFound(code="party_not_found")
    if ln.cash_account_id is not None:
        c = db.get(CashAccount, ln.cash_account_id)
        if c is None or c.shop_id != shop_id:
            raise NotFound(code="cash_account_not_found")


def reverse(
    db: Session, shop_id: uuid.UUID, user_id: uuid.UUID, group_id: uuid.UUID, reason: str
) -> LedgerGroup:
    original = get_group(db, shop_id, group_id)
    if original.reversed_by_group_id is not None:
        raise Conflict(
            code="already_reversed",
            message_en="Already reversed",
            message_ur="پہلے ہی منسوخ ہو چکا",
        )
    if original.reverses_group_id is not None:
        raise Conflict(code="cannot_reverse_reversal")
    posting = Posting(
        document_type=f"reversal:{original.document_type}",
        document_id=original.document_id,
        memo=reason,
    )
    for e in original.entries:
        posting.lines.append(
            Line(
                account=e.account,
                debit=e.credit,
                credit=e.debit,
                party_id=e.party_id,
                cash_account_id=e.cash_account_id,
                device_id=e.device_id,
                memo=e.memo,
            )
        )
    rev = post(db, shop_id, user_id, posting)
    rev.reverses_group_id = original.id
    original.reversed_by_group_id = rev.id
    record_audit(
        db,
        shop_id=shop_id,
        user_id=user_id,
        entity="ledger_group",
        entity_id=original.id,
        action="reverse",
        after={"reason": reason, "reversal_group_id": str(rev.id)},
    )
    db.flush()
    return rev


def get_group(db: Session, shop_id: uuid.UUID, group_id: uuid.UUID) -> LedgerGroup:
    g = db.get(LedgerGroup, group_id)
    if g is None or g.shop_id != shop_id:
        raise NotFound(code="ledger_group_not_found")
    return g


# ---- balances ----------------------------------------------------------------


def party_balance(
    db: Session, shop_id: uuid.UUID, party_id: uuid.UUID, until: datetime | None = None
) -> Decimal:
    stmt = select(func.coalesce(func.sum(LedgerEntry.debit - LedgerEntry.credit), 0)).where(
        LedgerEntry.shop_id == shop_id, LedgerEntry.party_id == party_id
    )
    if until is not None:
        stmt = stmt.where(LedgerEntry.at < until)
    return money(db.scalar(stmt) or 0)


def refresh_party_balance(db: Session, shop_id: uuid.UUID, party_id: uuid.UUID) -> Decimal:
    bal = party_balance(db, shop_id, party_id)
    party = db.get(Party, party_id)
    if party is not None:
        party.balance = bal
    return bal


def cash_balance(
    db: Session, shop_id: uuid.UUID, cash_account_id: uuid.UUID, until: datetime | None = None
) -> Decimal:
    account = db.get(CashAccount, cash_account_id)
    if account is None or account.shop_id != shop_id:
        raise NotFound(code="cash_account_not_found")
    stmt = select(func.coalesce(func.sum(LedgerEntry.debit - LedgerEntry.credit), 0)).where(
        LedgerEntry.shop_id == shop_id, LedgerEntry.cash_account_id == cash_account_id
    )
    if until is not None:
        stmt = stmt.where(LedgerEntry.at < until)
    return money(account.opening_balance + (db.scalar(stmt) or 0))


def account_total(
    db: Session,
    shop_id: uuid.UUID,
    account: str,
    date_from: date | None = None,
    date_to: date | None = None,
) -> Decimal:
    """Σ(debit − credit) for a system account; callers interpret the sign."""
    stmt = select(func.coalesce(func.sum(LedgerEntry.debit - LedgerEntry.credit), 0)).where(
        LedgerEntry.shop_id == shop_id, LedgerEntry.account == account
    )
    if date_from:
        stmt = stmt.where(local_day(LedgerEntry.at) >= date_from)
    if date_to:
        stmt = stmt.where(local_day(LedgerEntry.at) <= date_to)
    return money(db.scalar(stmt) or 0)


# ---- statements ---------------------------------------------------------------


def party_statement(
    db: Session,
    shop_id: uuid.UUID,
    party_id: uuid.UUID,
    date_from: date | None,
    date_to: date | None,
) -> dict:
    party = db.get(Party, party_id)
    if party is None or party.shop_id != shop_id:
        raise NotFound(code="party_not_found")
    stmt = (
        select(LedgerEntry, LedgerGroup)
        .join(LedgerGroup, LedgerGroup.id == LedgerEntry.group_id)
        .where(LedgerEntry.shop_id == shop_id, LedgerEntry.party_id == party_id)
        .order_by(LedgerEntry.at, LedgerEntry.seq)
    )
    if date_from:
        stmt = stmt.where(local_day(LedgerEntry.at) >= date_from)
    if date_to:
        stmt = stmt.where(local_day(LedgerEntry.at) <= date_to)
    opening = ZERO
    if date_from:
        opening = money(
            db.scalar(
                select(func.coalesce(func.sum(LedgerEntry.debit - LedgerEntry.credit), 0)).where(
                    LedgerEntry.shop_id == shop_id,
                    LedgerEntry.party_id == party_id,
                    local_day(LedgerEntry.at) < date_from,
                )
            )
            or 0
        )
    running = opening
    rows = []
    for entry, group in db.execute(stmt).all():
        running = money(running + entry.debit - entry.credit)
        rows.append(
            {
                "entry_id": entry.id,
                "group_id": group.id,
                "at": entry.at,
                "document_type": group.document_type,
                "document_id": group.document_id,
                "memo": entry.memo or group.memo,
                "debit": entry.debit,
                "credit": entry.credit,
                "balance": running,
                "reversed": group.reversed_by_group_id is not None,
            }
        )
    return {
        "party_id": party_id,
        "opening_balance": opening,
        "closing_balance": running,
        "rows": rows,
    }


def cash_book(
    db: Session,
    shop_id: uuid.UUID,
    cash_account_id: uuid.UUID,
    date_from: date | None,
    date_to: date | None,
) -> dict:
    account = db.get(CashAccount, cash_account_id)
    if account is None or account.shop_id != shop_id:
        raise NotFound(code="cash_account_not_found")
    stmt = (
        select(LedgerEntry, LedgerGroup)
        .join(LedgerGroup, LedgerGroup.id == LedgerEntry.group_id)
        .where(LedgerEntry.shop_id == shop_id, LedgerEntry.cash_account_id == cash_account_id)
        .order_by(LedgerEntry.at, LedgerEntry.seq)
    )
    opening = account.opening_balance
    if date_from:
        stmt = stmt.where(local_day(LedgerEntry.at) >= date_from)
        opening = money(
            opening
            + (
                db.scalar(
                    select(
                        func.coalesce(func.sum(LedgerEntry.debit - LedgerEntry.credit), 0)
                    ).where(
                        LedgerEntry.shop_id == shop_id,
                        LedgerEntry.cash_account_id == cash_account_id,
                        local_day(LedgerEntry.at) < date_from,
                    )
                )
                or 0
            )
        )
    if date_to:
        stmt = stmt.where(local_day(LedgerEntry.at) <= date_to)
    running = money(opening)
    rows = []
    for entry, group in db.execute(stmt).all():
        running = money(running + entry.debit - entry.credit)
        rows.append(
            {
                "entry_id": entry.id,
                "group_id": group.id,
                "at": entry.at,
                "document_type": group.document_type,
                "document_id": group.document_id,
                "memo": entry.memo or group.memo,
                "in_": entry.debit,
                "out": entry.credit,
                "balance": running,
                "reversed": group.reversed_by_group_id is not None,
            }
        )
    return {
        "cash_account_id": cash_account_id,
        "opening_balance": money(opening),
        "closing_balance": running,
        "rows": rows,
    }


# ---- cash accounts ---------------------------------------------------------------


def ensure_default_cash_account(db: Session, shop_id: uuid.UUID) -> CashAccount:
    existing = db.scalar(
        select(CashAccount).where(CashAccount.shop_id == shop_id, CashAccount.is_default.is_(True))
    )
    if existing:
        return existing
    account = CashAccount(
        shop_id=shop_id, kind=CashAccountKind.CASH, name="Cash", name_ur="نقد", is_default=True
    )
    db.add(account)
    db.flush()
    return account


def default_cash_account(db: Session, shop_id: uuid.UUID) -> CashAccount:
    return ensure_default_cash_account(db, shop_id)


def list_cash_accounts(db: Session, shop_id: uuid.UUID) -> list[dict]:
    rows = db.scalars(
        select(CashAccount)
        .where(CashAccount.shop_id == shop_id, CashAccount.is_active.is_(True))
        .order_by(CashAccount.is_default.desc(), CashAccount.created_at)
    ).all()
    return [{**_acc_dict(a), "balance": cash_balance(db, shop_id, a.id)} for a in rows]


def create_cash_account(db: Session, shop_id: uuid.UUID, user_id: uuid.UUID, data) -> dict:
    account = CashAccount(shop_id=shop_id, **data.model_dump())
    db.add(account)
    db.flush()
    record_audit(
        db,
        shop_id=shop_id,
        user_id=user_id,
        entity="cash_account",
        entity_id=account.id,
        action="create",
        after={"name": account.name, "kind": account.kind},
    )
    db.commit()
    return {**_acc_dict(account), "balance": cash_balance(db, shop_id, account.id)}


def _acc_dict(a: CashAccount) -> dict:
    return {
        "id": a.id,
        "kind": a.kind,
        "name": a.name,
        "name_ur": a.name_ur,
        "account_no": a.account_no,
        "opening_balance": a.opening_balance,
        "opening_date": a.opening_date,
        "is_default": a.is_default,
        "is_active": a.is_active,
    }


# ---- opening balances (migrating from the diary) -----------------------------------


def post_party_opening_balance(
    db: Session,
    shop_id: uuid.UUID,
    user_id: uuid.UUID,
    party_id: uuid.UUID,
    amount: Decimal,
    party_owes: bool,
    memo: str | None,
) -> LedgerGroup:
    amount = money(amount)
    if amount <= ZERO:
        raise ValidationFailed(code="amount_positive")
    party = db.get(Party, party_id)
    if party is None or party.shop_id != shop_id:
        raise NotFound(code="party_not_found")
    p = Posting(
        document_type="opening_balance",
        memo=memo or "Opening balance / پرانا بقایا",
        document_id=party_id,
    )
    if party_owes:
        p.debit(acc.party_account(party_id), amount).credit(acc.SysAccount.EQUITY, amount)
    else:
        p.debit(acc.SysAccount.EQUITY, amount).credit(acc.party_account(party_id), amount)
    group = post(db, shop_id, user_id, p)
    record_audit(
        db,
        shop_id=shop_id,
        user_id=user_id,
        entity="party",
        entity_id=party_id,
        action="opening_balance",
        after={"amount": str(amount), "party_owes": party_owes},
    )
    db.commit()
    return group


def update_cash_account(
    db: Session, shop_id: uuid.UUID, user_id: uuid.UUID, account_id: uuid.UUID, data
) -> dict:
    a = db.get(CashAccount, account_id)
    if a is None or a.shop_id != shop_id or not a.is_active:
        raise NotFound(code="cash_account_not_found")
    changes = data.model_dump(exclude_unset=True)
    before = {k: getattr(a, k) for k in changes}
    for k, v in changes.items():
        setattr(a, k, v)
    if "name" in changes:
        a.name_ur = None
    record_audit(
        db,
        shop_id=shop_id,
        user_id=user_id,
        entity="cash_account",
        entity_id=a.id,
        action="update",
        before=before,
        after=changes,
    )
    db.commit()
    return {**_acc_dict(a), "balance": cash_balance(db, shop_id, a.id)}


def delete_cash_account(
    db: Session, shop_id: uuid.UUID, user_id: uuid.UUID, account_id: uuid.UUID
) -> str:
    from app.db.refs import count_references

    a = db.get(CashAccount, account_id)
    if a is None or a.shop_id != shop_id or not a.is_active:
        raise NotFound(code="cash_account_not_found")
    if a.is_default:
        raise Conflict(
            code="cash_account_default",
            message_en="The main cash drawer cannot be deleted",
            message_ur="مین کیش دراز ختم نہیں ہو سکتا",
        )
    if cash_balance(db, shop_id, a.id) != 0:
        raise Conflict(
            code="cash_account_has_balance",
            message_en="This account still has money. Move it to another account first.",
            message_ur="اس اکاؤنٹ میں ابھی رقم ہے۔ پہلے دوسرے اکاؤنٹ میں منتقل کریں۔",
        )
    used = count_references(db, "cash_accounts", a.id)
    action = "archive" if used else "delete"
    record_audit(
        db,
        shop_id=shop_id,
        user_id=user_id,
        entity="cash_account",
        entity_id=a.id,
        action=action,
        before={"name": a.name},
    )
    if used:
        a.is_active = False
    else:
        db.delete(a)
    db.commit()
    return action
