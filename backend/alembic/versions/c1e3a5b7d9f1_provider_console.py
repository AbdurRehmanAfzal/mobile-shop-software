"""provider console (docs/28): license keys kept with their sends / views / status; organisations'
deployment, last use, one-PC heartbeat and linked customer. Additive, resumable, reversible.

Revision ID: c1e3a5b7d9f1
Revises: b9c1d3e5f7a9
Create Date: 2026-11-01 12:00:00

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = 'c1e3a5b7d9f1'
down_revision: str | None = 'b9c1d3e5f7a9'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _cols(t: str) -> set[str]:
    return {c["name"] for c in sa.inspect(op.get_bind()).get_columns(t)}


def upgrade() -> None:
    have = _cols('organisations')
    with op.batch_alter_table('organisations', schema=None) as b:
        for col in (
            sa.Column('deployment', sa.String(length=10), server_default='cloud', nullable=False),
            sa.Column('last_active_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('install_last_seen_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('install_version', sa.String(length=40), nullable=True),
            sa.Column('license_org_id', sa.Uuid(), nullable=True),
        ):
            if col.name not in have:
                b.add_column(col)
    if 'license_keys' not in sa.inspect(op.get_bind()).get_table_names():
        op.create_table(
            'license_keys',
            sa.Column('id', sa.Uuid(), nullable=False),
            sa.Column('organisation_id', sa.Uuid(), nullable=False),
            sa.Column('shop_id', sa.Uuid(), nullable=False),
            sa.Column('nonce', sa.String(length=32), nullable=False),
            sa.Column('months', sa.Integer(), nullable=False),
            sa.Column('code', sa.Text(), nullable=False),
            sa.Column('status', sa.String(length=10), nullable=False),
            sa.Column('note', sa.String(length=200), nullable=True),
            sa.Column('issued_by', sa.Uuid(), nullable=True),
            sa.Column('issued_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('redeemed_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('redeemed_where', sa.String(length=10), nullable=True),
            sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('revoke_reason', sa.String(length=200), nullable=True),
            sa.Column('renewed_from', sa.Uuid(), nullable=True),
            sa.Column('sent_count', sa.Integer(), nullable=False),
            sa.Column('last_sent_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('last_sent_via', sa.String(length=12), nullable=True),
            sa.Column('view_token', sa.String(length=48), nullable=True),
            sa.Column('view_expires_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('view_count', sa.Integer(), nullable=False),
            sa.Column('last_viewed_at', sa.DateTime(timezone=True), nullable=True),
            sa.ForeignKeyConstraint(['organisation_id'], ['organisations.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['shop_id'], ['shops.id'], ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['issued_by'], ['users.id'], ondelete='SET NULL'),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('nonce'),
        )
        op.create_index('ix_license_keys_organisation_id', 'license_keys', ['organisation_id'])
        op.create_index('ix_license_keys_shop_id', 'license_keys', ['shop_id'])
        op.create_index('ix_license_keys_status', 'license_keys', ['status'])
        op.create_index('ix_license_keys_view_token', 'license_keys', ['view_token'], unique=True)


def downgrade() -> None:
    op.drop_table('license_keys')
    with op.batch_alter_table('organisations', schema=None) as b:
        for c in ('license_org_id', 'install_version', 'install_last_seen_at', 'last_active_at', 'deployment'):
            b.drop_column(c)
