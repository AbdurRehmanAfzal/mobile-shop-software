"""tablets and smart watches as full devices (owner addendum 6, 2026-10-31): grade, RAM, warranty by,
spec sheet and lock checks on devices; model number + global specs on models; the shop's model
library (model_specs); shop device settings. Additive, reversible, resumable.

Revision ID: b9c1d3e5f7a9
Revises: a8b0c2d4e6f8
Create Date: 2026-10-31 23:50:00

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = 'b9c1d3e5f7a9'
down_revision: str | None = 'a8b0c2d4e6f8'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _cols(table: str) -> set[str]:
    return {c["name"] for c in sa.inspect(op.get_bind()).get_columns(table)}


def _has_table(name: str) -> bool:
    return name in sa.inspect(op.get_bind()).get_table_names()


def _add(batch_op, have: set[str], col: sa.Column) -> None:
    if col.name not in have:
        batch_op.add_column(col)


def upgrade() -> None:
    have = _cols('devices')
    with op.batch_alter_table('devices', schema=None) as batch_op:
        _add(batch_op, have, sa.Column('grade', sa.String(length=20), nullable=True))
        _add(batch_op, have, sa.Column('ram_gb', sa.Integer(), nullable=True))
        _add(batch_op, have, sa.Column('warranty_by', sa.String(length=10), nullable=True))
        _add(batch_op, have, sa.Column('specs', sa.JSON(), nullable=True))
        _add(batch_op, have, sa.Column('lock_checks', sa.JSON(), nullable=True))
        _add(batch_op, have, sa.Column('lock_checked_at', sa.DateTime(timezone=True), nullable=True))
        _add(batch_op, have, sa.Column('lock_checked_by', sa.Uuid(), nullable=True))
        if 'lock_checked_by' not in have:
            batch_op.create_foreign_key('fk_devices_lock_checked_by_users', 'users', ['lock_checked_by'], ['id'], ondelete='SET NULL')
    have = _cols('models')
    with op.batch_alter_table('models', schema=None) as batch_op:
        _add(batch_op, have, sa.Column('model_number', sa.String(length=40), nullable=True))
        _add(batch_op, have, sa.Column('specs', sa.JSON(), nullable=True))
    if not _has_table('model_specs'):
        op.create_table(
            'model_specs',
            sa.Column('id', sa.Uuid(), nullable=False),
            sa.Column('shop_id', sa.Uuid(), nullable=False),
            sa.Column('model_id', sa.Uuid(), nullable=False),
            sa.Column('model_number', sa.String(length=40), nullable=True),
            sa.Column('specs', sa.JSON(), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(['model_id'], ['models.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['shop_id'], ['shops.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('shop_id', 'model_id', name='uq_model_specs_shop_model'),
        )
        op.create_index('ix_model_specs_shop_id', 'model_specs', ['shop_id'], unique=False)
        op.create_index('ix_model_specs_model_id', 'model_specs', ['model_id'], unique=False)
    have = _cols('shops')
    with op.batch_alter_table('shops', schema=None) as batch_op:
        _add(batch_op, have, sa.Column('device_prefs', sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('shops', schema=None) as batch_op:
        batch_op.drop_column('device_prefs')
    op.drop_table('model_specs')
    with op.batch_alter_table('models', schema=None) as batch_op:
        batch_op.drop_column('specs')
        batch_op.drop_column('model_number')
    with op.batch_alter_table('devices', schema=None) as batch_op:
        batch_op.drop_constraint('fk_devices_lock_checked_by_users', type_='foreignkey')
        for c in ('lock_checked_by', 'lock_checked_at', 'lock_checks', 'specs', 'warranty_by', 'ram_gb', 'grade'):
            batch_op.drop_column(c)
