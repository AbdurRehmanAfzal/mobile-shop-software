"""owner decisions 2026-10-31: due dates on bills, remittance fee / status, daily stock snapshots

Revision ID: c4d6e8f0a1b3
Revises: b3c5d7e9f1a2
Create Date: 2026-10-31 05:30:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c4d6e8f0a1b3'
down_revision: Union[str, None] = 'b3c5d7e9f1a2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('invoices', schema=None) as batch_op:
        batch_op.add_column(sa.Column('due_date', sa.Date(), nullable=True))
    with op.batch_alter_table('purchases', schema=None) as batch_op:
        batch_op.add_column(sa.Column('due_date', sa.Date(), nullable=True))
    with op.batch_alter_table('payment_details', schema=None) as batch_op:
        batch_op.add_column(sa.Column('fee', sa.Numeric(precision=14, scale=2), nullable=True))
        batch_op.add_column(sa.Column('status', sa.String(length=12), nullable=True))
    op.create_table(
        'stock_snapshots',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('shop_id', sa.Uuid(), nullable=False),
        sa.Column('day', sa.Date(), nullable=False),
        sa.Column('count', sa.Integer(), nullable=False),
        sa.Column('cost_value', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('asking_value', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('taken_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['shop_id'], ['shops.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('shop_id', 'day', name='uq_stock_snapshots_shop_day'),
    )
    op.create_index('ix_stock_snapshots_shop_id', 'stock_snapshots', ['shop_id'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_stock_snapshots_shop_id', table_name='stock_snapshots')
    op.drop_table('stock_snapshots')
    with op.batch_alter_table('payment_details', schema=None) as batch_op:
        batch_op.drop_column('status')
        batch_op.drop_column('fee')
    with op.batch_alter_table('purchases', schema=None) as batch_op:
        batch_op.drop_column('due_date')
    with op.batch_alter_table('invoices', schema=None) as batch_op:
        batch_op.drop_column('due_date')
