"""bulk Excel imports (owner 2026-10-31, docs/18): one row per uploaded file

Revision ID: d5e7f9a1b2c4
Revises: c4d6e8f0a1b3
Create Date: 2026-10-31 12:00:00

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = 'd5e7f9a1b2c4'
down_revision: str | None = 'c4d6e8f0a1b3'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'bulk_imports',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('shop_id', sa.Uuid(), nullable=False),
        sa.Column('kind', sa.String(length=20), nullable=False),
        sa.Column('file_name', sa.String(length=200), nullable=True),
        sa.Column('file_sha256', sa.String(length=64), nullable=False),
        sa.Column('rows_total', sa.Integer(), nullable=False),
        sa.Column('rows_ok', sa.Integer(), nullable=False),
        sa.Column('rows_failed', sa.Integer(), nullable=False),
        sa.Column('rows_skipped', sa.Integer(), nullable=False),
        sa.Column('summary', sa.JSON(), nullable=True),
        sa.Column('created_by', sa.Uuid(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['shop_id'], ['shops.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_bulk_imports_shop_id', 'bulk_imports', ['shop_id'], unique=False)
    op.create_index('ix_bulk_imports_file_sha256', 'bulk_imports', ['file_sha256'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_bulk_imports_file_sha256', table_name='bulk_imports')
    op.drop_index('ix_bulk_imports_shop_id', table_name='bulk_imports')
    op.drop_table('bulk_imports')
