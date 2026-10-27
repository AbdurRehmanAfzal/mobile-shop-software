import datetime as dt
import uuid
from decimal import Decimal

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.errors import Conflict, Forbidden, NotFound, ValidationFailed
from app.core.permissions import Cap
from app.db.base import ZERO, utcnow
from app.modules.audit.service import record_audit
from app.modules.auth.models import Shop, User
from app.modules.expenses.models import DayClose, Expense, ExpenseCategory
from app.modules.expenses.schemas import CategoryCreate, DayCloseIn, ExpenseCreate
from app.modules.files.service import belongs
from app.modules.ledger import accounts as acc
from app.modules.ledger.models import CashAccount, LedgerEntry
from app.modules.ledger.service import Posting, default_cash_account, money, post, reverse
from app.modules.parties.models import Party
from app.modules.purchases.service import next_number

DEFAULT_CATEGORIES: list[tuple[str, str, str, int]] = [
    ("rent", "Shop rent", "دکان کا کرایہ", 10),
    ("electricity", "Electricity", "بجلی", 20),
    ("salary", "Salary", "تنخواہ", 30),
    ("advance", "Staff advance", "عملے کو ایڈوانس", 40),
    ("repair_parts", "Repair parts", "مرمت کے پرزے", 50),
    ("transport", "Transport", "آنا جانا", 60),
    ("tea", "Tea & refreshments", "چائے پانی", 70),
    ("mobile_bill", "Phone & internet", "فون اور انٹرنیٹ", 80),
    ("tax_fee", "Taxes & fees", "ٹیکس اور فیس", 90),
    ("owner_drawing", "Owner drawing", "مالک نے نکالے", 95),
    ("other", "Other", "دیگر", 999),
]


def seed_categories(db: Session) -> int:
    have = {
        c
        for c in db.scalars(
            select(ExpenseCategory.key).where(ExpenseCategory.shop_id.is_(None))
        ).all()
    }
    added = 0
    for key, name, name_ur, order in DEFAULT_CATEGORIES:
        if key not in have:
            db.add(
                ExpenseCategory(shop_id=None, key=key, name=name, name_ur=name_ur, sort_order=order)
            )
            added += 1
    db.commit()
    return added


def list_categories(db: Session, shop_id: uuid.UUID) -> list[dict]:
    rows = db.scalars(
        select(ExpenseCategory)
        .where(
            or_(ExpenseCategory.shop_id.is_(None), ExpenseCategory.shop_id == shop_id),
            ExpenseCategory.is_active.is_(True),
        )
        .order_by(ExpenseCategory.sort_order, ExpenseCategory.name)
    ).all()
    return [
        {
            "id": c.id,
            "key": c.key,
            "name": c.name,
            "name_ur": c.name_ur,
            "is_global": c.shop_id is None,
        }
        for c in rows
    ]


def create_category(
    db: Session, shop_id: uuid.UUID, user_id: uuid.UUID, data: CategoryCreate
) -> dict:
    key = "".join(ch if ch.isalnum() else "_" for ch in data.name.strip().lower())[:40] or "custom"
    exists = db.scalar(
        select(ExpenseCategory.id).where(
            or_(ExpenseCategory.shop_id.is_(None), ExpenseCategory.shop_id == shop_id),
            or_(
                func.lower(ExpenseCategory.name) == data.name.strip().lower(),
                ExpenseCategory.key == key,
            ),
        )
    )
    if exists:
        raise Conflict(code="category_exists")
    c = ExpenseCategory(shop_id=shop_id, key=key, name=data.name.strip(), name_ur=data.name_ur)
    db.add(c)
    db.flush()
    record_audit(
        db,
        shop_id=shop_id,
        user_id=user_id,
        entity="expense_category",
        entity_id=c.id,
        action="create",
        after={"name": c.name},
    )
    db.commit()
    return {"id": c.id, "key": c.key, "name": c.name, "name_ur": c.name_ur, "is_global": False}


def create_expense(
    db: Session, shop_id: uuid.UUID, user_id: uuid.UUID, data: ExpenseCreate
) -> Expense:
    shop = db.get(Shop, shop_id)
    cat = db.get(ExpenseCategory, data.category_id)
    if cat is None or cat.shop_id not in (None, shop_id):
        raise NotFound(code="category_not_found")
    cash = (
        db.get(CashAccount, data.cash_account_id)
        if data.cash_account_id
        else default_cash_account(db, shop_id)
    )
    if cash is None or cash.shop_id != shop_id:
        raise NotFound(code="cash_account_not_found")
    if data.party_id and (p := db.get(Party, data.party_id)) is not None and p.shop_id != shop_id:
        raise NotFound(code="party_not_found")
    if data.staff_user_id and (
        (u := db.get(User, data.staff_user_id)) is None or u.organisation_id != shop.organisation_id
    ):
        raise NotFound(code="user_not_found")
    if not belongs(shop_id, data.receipt_path):
        raise ValidationFailed(code="file_not_found")
    amount = money(data.amount)
    exp = Expense(
        shop_id=shop_id,
        no=next_number(db, shop, "EXP", "next_expense_no"),
        category_id=cat.id,
        category_key=cat.key,
        amount=amount,
        cash_account_id=cash.id,
        date=data.date or dt.date.today(),
        party_id=data.party_id,
        staff_user_id=data.staff_user_id,
        description=data.description,
        receipt_path=data.receipt_path,
        notes=data.notes,
        created_by=user_id,
    )
    db.add(exp)
    db.flush()
    posting = Posting(
        document_type="expense",
        document_id=exp.id,
        memo=f"{exp.no} {cat.name}{(' · ' + data.description) if data.description else ''}",
    )
    posting.debit(acc.expense_account(cat.key), amount, memo=data.description or cat.name).credit(
        acc.cash_account(cash.id), amount, memo=cat.name
    )
    group = post(db, shop_id, user_id, posting)
    exp.ledger_group_id = group.id
    record_audit(
        db,
        shop_id=shop_id,
        user_id=user_id,
        entity="expense",
        entity_id=exp.id,
        action="create",
        after={"no": exp.no, "amount": str(amount), "category": cat.key},
    )
    db.commit()
    return exp


def get_expense(db: Session, shop_id: uuid.UUID, expense_id: uuid.UUID) -> Expense:
    e = db.get(Expense, expense_id)
    if e is None or e.shop_id != shop_id:
        raise NotFound(code="expense_not_found")
    return e


def list_expenses(
    db: Session, shop_id: uuid.UUID, *, date_from, date_to, category_id, limit
) -> list[Expense]:
    stmt = select(Expense).where(Expense.shop_id == shop_id)
    if date_from:
        stmt = stmt.where(Expense.date >= date_from)
    if date_to:
        stmt = stmt.where(Expense.date <= date_to)
    if category_id:
        stmt = stmt.where(Expense.category_id == category_id)
    return list(
        db.scalars(stmt.order_by(Expense.date.desc(), Expense.created_at.desc()).limit(limit)).all()
    )


def to_out(db: Session, e: Expense) -> dict:
    cat = db.get(ExpenseCategory, e.category_id)
    party = db.get(Party, e.party_id) if e.party_id else None
    staff = db.get(User, e.staff_user_id) if e.staff_user_id else None
    return {
        **{c.name: getattr(e, c.name) for c in Expense.__table__.columns},
        "category_name": cat.name if cat else None,
        "party_name": party.name if party else None,
        "staff_name": staff.name if staff else None,
    }


def void_expense(
    db: Session, shop_id: uuid.UUID, ctx, expense_id: uuid.UUID, reason: str
) -> Expense:
    if not ctx.can(Cap.VOID):
        raise Forbidden()
    e = get_expense(db, shop_id, expense_id)
    if e.status == "voided":
        raise Conflict(code="already_voided")
    if e.ledger_group_id:
        reverse(db, shop_id, ctx.id, e.ledger_group_id, f"Void {e.no}: {reason}")
    e.status = "voided"
    e.void_reason = reason
    e.updated_at = utcnow()
    record_audit(
        db,
        shop_id=shop_id,
        user_id=ctx.id,
        entity="expense",
        entity_id=e.id,
        action="void",
        after={"reason": reason},
    )
    db.commit()
    return e


# ---- day close ----------------------------------------------------------------------------


def _day_figures(
    db: Session, shop_id: uuid.UUID, account: CashAccount, day: dt.date
) -> tuple[Decimal, Decimal, Decimal, Decimal]:
    before = (
        db.scalar(
            select(func.coalesce(func.sum(LedgerEntry.debit - LedgerEntry.credit), 0)).where(
                LedgerEntry.shop_id == shop_id,
                LedgerEntry.cash_account_id == account.id,
                func.date(LedgerEntry.at) < day,
            )
        )
        or 0
    )
    opening = money(account.opening_balance + before)
    cash_in = money(
        db.scalar(
            select(func.coalesce(func.sum(LedgerEntry.debit), 0)).where(
                LedgerEntry.shop_id == shop_id,
                LedgerEntry.cash_account_id == account.id,
                func.date(LedgerEntry.at) == day,
            )
        )
        or 0
    )
    cash_out = money(
        db.scalar(
            select(func.coalesce(func.sum(LedgerEntry.credit), 0)).where(
                LedgerEntry.shop_id == shop_id,
                LedgerEntry.cash_account_id == account.id,
                func.date(LedgerEntry.at) == day,
            )
        )
        or 0
    )
    return opening, cash_in, cash_out, money(opening + cash_in - cash_out)


def _account(db: Session, shop_id: uuid.UUID, cash_account_id: uuid.UUID | None) -> CashAccount:
    cash = (
        db.get(CashAccount, cash_account_id)
        if cash_account_id
        else default_cash_account(db, shop_id)
    )
    if cash is None or cash.shop_id != shop_id:
        raise NotFound(code="cash_account_not_found")
    return cash


def day_preview(
    db: Session, shop_id: uuid.UUID, cash_account_id: uuid.UUID | None, day: dt.date | None
) -> dict:
    account = _account(db, shop_id, cash_account_id)
    day = day or dt.date.today()
    opening, cash_in, cash_out, expected = _day_figures(db, shop_id, account, day)
    closed = (
        db.scalar(
            select(DayClose.id).where(
                DayClose.shop_id == shop_id,
                DayClose.cash_account_id == account.id,
                DayClose.date == day,
            )
        )
        is not None
    )
    return {
        "cash_account_id": account.id,
        "date": day,
        "opening": opening,
        "cash_in": cash_in,
        "cash_out": cash_out,
        "expected": expected,
        "closed": closed,
    }


def close_day(db: Session, shop_id: uuid.UUID, user_id: uuid.UUID, data: DayCloseIn) -> DayClose:
    account = _account(db, shop_id, data.cash_account_id)
    day = data.date or dt.date.today()
    if db.scalar(
        select(DayClose.id).where(
            DayClose.shop_id == shop_id,
            DayClose.cash_account_id == account.id,
            DayClose.date == day,
        )
    ):
        raise Conflict(
            code="day_already_closed",
            message_en="This day is already closed",
            message_ur="یہ دن پہلے ہی بند ہو چکا ہے",
        )
    opening, cash_in, cash_out, expected = _day_figures(db, shop_id, account, day)
    counted = money(data.counted)
    row = DayClose(
        shop_id=shop_id,
        cash_account_id=account.id,
        date=day,
        opening=opening,
        cash_in=cash_in,
        cash_out=cash_out,
        expected=expected,
        counted=counted,
        difference=money(counted - expected),
        notes=data.notes,
        closed_by=user_id,
    )
    db.add(row)
    db.flush()
    record_audit(
        db,
        shop_id=shop_id,
        user_id=user_id,
        entity="day_close",
        entity_id=row.id,
        action="create",
        after={"date": day.isoformat(), "expected": str(expected), "counted": str(counted)},
    )
    db.commit()
    return row


def list_day_closes(db: Session, shop_id: uuid.UUID, limit: int) -> list[DayClose]:
    return list(
        db.scalars(
            select(DayClose)
            .where(DayClose.shop_id == shop_id)
            .order_by(DayClose.date.desc())
            .limit(limit)
        ).all()
    )


__all__ = ["ZERO"]


# ---- edit / delete ------------------------------------------------------------------------


def _own_category(db: Session, shop_id: uuid.UUID, category_id: uuid.UUID) -> ExpenseCategory:
    c = db.get(ExpenseCategory, category_id)
    if c is None or (c.shop_id is not None and c.shop_id != shop_id) or not c.is_active:
        raise NotFound(code="category_not_found")
    if c.shop_id is None:
        raise Forbidden(
            code="category_builtin",
            message_en="Built-in categories cannot be changed",
            message_ur="پہلے سے موجود قسم تبدیل نہیں ہو سکتی",
        )
    return c


def update_category(
    db: Session, shop_id: uuid.UUID, user_id: uuid.UUID, category_id: uuid.UUID, name: str
) -> dict:
    c = _own_category(db, shop_id, category_id)
    clash = db.scalar(
        select(ExpenseCategory.id).where(
            or_(ExpenseCategory.shop_id.is_(None), ExpenseCategory.shop_id == shop_id),
            func.lower(ExpenseCategory.name) == name.strip().lower(),
            ExpenseCategory.id != c.id,
        )
    )
    if clash:
        raise Conflict(code="category_exists")
    before = c.name
    c.name, c.name_ur = name.strip(), None
    record_audit(
        db,
        shop_id=shop_id,
        user_id=user_id,
        entity="expense_category",
        entity_id=c.id,
        action="update",
        before={"name": before},
        after={"name": c.name},
    )
    db.commit()
    return {"id": c.id, "key": c.key, "name": c.name, "name_ur": c.name_ur, "is_global": False}


def delete_category(
    db: Session, shop_id: uuid.UUID, user_id: uuid.UUID, category_id: uuid.UUID
) -> str:
    from app.db.refs import count_references

    c = _own_category(db, shop_id, category_id)
    used = count_references(db, "expense_categories", c.id)
    action = "archive" if used else "delete"
    record_audit(
        db,
        shop_id=shop_id,
        user_id=user_id,
        entity="expense_category",
        entity_id=c.id,
        action=action,
        before={"name": c.name},
    )
    if used:
        c.is_active = False
    else:
        db.delete(c)
    db.commit()
    return action


def edit_expense(
    db: Session, shop_id: uuid.UUID, ctx, expense_id: uuid.UUID, data: ExpenseCreate
) -> Expense:
    """Correct an expense: a new expense replaces the old one, the old one is voided (ledger reversed)."""
    if not ctx.can(Cap.VOID):
        raise Forbidden()
    old = get_expense(db, shop_id, expense_id)
    if old.status == "voided":
        raise Conflict(code="already_voided")
    new = create_expense(db, shop_id, ctx.id, data)
    void_expense(db, shop_id, ctx, old.id, f"Edited, replaced by {new.no}")
    return new
