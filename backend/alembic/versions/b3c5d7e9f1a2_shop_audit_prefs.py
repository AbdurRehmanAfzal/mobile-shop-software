"""shop audit: per-shop thresholds (age bands, high value, low margin, performance, bypass)

Revision ID: b3c5d7e9f1a2
Revises: a2b4c6d8e0f1
Create Date: 2026-10-31 02:10:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b3c5d7e9f1a2'
down_revision: Union[str, None] = 'a2b4c6d8e0f1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('shops', schema=None) as batch_op:
        batch_op.add_column(sa.Column('audit_prefs', sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('shops', schema=None) as batch_op:
        batch_op.drop_column('audit_prefs')
