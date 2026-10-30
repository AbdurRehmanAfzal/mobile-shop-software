"""shop audit: date and cash-account indexes for period reports

Revision ID: a2b4c6d8e0f1
Revises: f1a3c5e7b9d2
Create Date: 2026-10-30 21:40:00

"""
from typing import Sequence, Union

from alembic import op


revision: str = 'a2b4c6d8e0f1'
down_revision: Union[str, None] = 'f1a3c5e7b9d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


INDEXES = [
    ("ix_invoices_shop_date", "invoices", ["shop_id", "date"]),
    ("ix_purchases_shop_date", "purchases", ["shop_id", "date"]),
    ("ix_payments_shop_date", "payments", ["shop_id", "date"]),
    ("ix_expenses_shop_date", "expenses", ["shop_id", "date"]),
    ("ix_returns_shop_date", "returns", ["shop_id", "date"]),
    ("ix_ledger_entries_cash_at", "ledger_entries", ["shop_id", "cash_account_id", "at"]),
    ("ix_audit_log_shop_at", "audit_log", ["shop_id", "at"]),
]


def upgrade() -> None:
    for name, table, cols in INDEXES:
        op.create_index(name, table, cols, unique=False)


def downgrade() -> None:
    for name, table, _cols in reversed(INDEXES):
        op.drop_index(name, table_name=table)
