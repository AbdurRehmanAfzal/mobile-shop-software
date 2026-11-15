"""login security: trusted devices, login rules, the device on a login (owner 2026-11-15, ADR-080)

Additive: one new table and two nullable columns; nothing existing changes. Both rules start off.

Revision ID: d4f6a8c0e2b5
Revises: c8e2a4f6b0d1
"""

import sqlalchemy as sa

from alembic import op

revision: str = "d4f6a8c0e2b5"
down_revision: str | None = "c8e2a4f6b0d1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "trusted_devices",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("organisation_id", sa.Uuid(), nullable=False),
        sa.Column(
            "user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("key_hash", sa.String(64), nullable=False),
        sa.Column("label", sa.String(120)),
        sa.Column("user_agent", sa.String(300)),
        sa.Column("ip", sa.String(64)),
        sa.Column("status", sa.String(10), nullable=False),
        sa.Column("requested_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("decided_at", sa.DateTime(timezone=True)),
        sa.Column("decided_by", sa.Uuid()),
        sa.Column("last_used_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_trusted_devices_organisation_id", "trusted_devices", ["organisation_id"])
    op.create_index("ix_trusted_devices_user_id", "trusted_devices", ["user_id"])
    op.create_index("ix_trusted_devices_key_hash", "trusted_devices", ["key_hash"])
    op.add_column("organisations", sa.Column("login_rules", sa.JSON(), nullable=True))
    op.add_column("login_sessions", sa.Column("device_id", sa.Uuid(), nullable=True))


def downgrade() -> None:
    op.drop_column("login_sessions", "device_id")
    op.drop_column("organisations", "login_rules")
    op.drop_index("ix_trusted_devices_key_hash", "trusted_devices")
    op.drop_index("ix_trusted_devices_user_id", "trusted_devices")
    op.drop_index("ix_trusted_devices_organisation_id", "trusted_devices")
    op.drop_table("trusted_devices")
