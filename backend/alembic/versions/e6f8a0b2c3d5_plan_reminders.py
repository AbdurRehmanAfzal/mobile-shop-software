"""subscription reminders (owner addendum 3, 2026-10-31): plan start / grace / lock state on
organisations, paid_on + receipt_no on fee payments, reminder state per user, redeemed renewal codes

Revision ID: e6f8a0b2c3d5
Revises: d5e7f9a1b2c4
Create Date: 2026-10-31 17:00:00

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = 'e6f8a0b2c3d5'
down_revision: str | None = 'd5e7f9a1b2c4'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table('organisations', schema=None) as batch_op:
        batch_op.add_column(sa.Column('plan_started_at', sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column('grace_days', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('plan_status_seen', sa.String(length=10), nullable=True))
    with op.batch_alter_table('fee_payments', schema=None) as batch_op:
        batch_op.add_column(sa.Column('paid_on', sa.Date(), nullable=True))
        batch_op.add_column(sa.Column('receipt_no', sa.String(length=12), nullable=True))
    op.create_index('ix_fee_payments_receipt_no', 'fee_payments', ['receipt_no'], unique=False)
    op.create_table(
        'plan_reminder_states',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('organisation_id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('stage', sa.String(length=16), nullable=True),
        sa.Column('snoozed_until', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_shown_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('times_snoozed', sa.Integer(), nullable=False),
        sa.Column('thanked_payment_id', sa.Uuid(), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['organisation_id'], ['organisations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', name='uq_plan_reminder_user'),
    )
    op.create_index('ix_plan_reminder_states_organisation_id', 'plan_reminder_states', ['organisation_id'], unique=False)
    op.create_table(
        'plan_renewal_codes',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('organisation_id', sa.Uuid(), nullable=False),
        sa.Column('nonce', sa.String(length=32), nullable=False),
        sa.Column('months', sa.Integer(), nullable=False),
        sa.Column('redeemed_by', sa.Uuid(), nullable=True),
        sa.Column('redeemed_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['organisation_id'], ['organisations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['redeemed_by'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('nonce'),
    )
    op.create_index('ix_plan_renewal_codes_organisation_id', 'plan_renewal_codes', ['organisation_id'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_plan_renewal_codes_organisation_id', table_name='plan_renewal_codes')
    op.drop_table('plan_renewal_codes')
    op.drop_index('ix_plan_reminder_states_organisation_id', table_name='plan_reminder_states')
    op.drop_table('plan_reminder_states')
    op.drop_index('ix_fee_payments_receipt_no', table_name='fee_payments')
    with op.batch_alter_table('fee_payments', schema=None) as batch_op:
        batch_op.drop_column('receipt_no')
        batch_op.drop_column('paid_on')
    with op.batch_alter_table('organisations', schema=None) as batch_op:
        batch_op.drop_column('plan_status_seen')
        batch_op.drop_column('grace_days')
        batch_op.drop_column('plan_started_at')
