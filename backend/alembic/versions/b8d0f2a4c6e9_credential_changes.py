"""password / PIN history (owner 2026-11-15, ADR-088)

Additive: one new table; the passwords and PINs themselves are never stored, only who changed
which, when and from where.

Revision ID: b8d0f2a4c6e9
Revises: f6b8d0a2c4e7
"""

import sqlalchemy as sa

from alembic import op

revision: str = "b8d0f2a4c6e9"
down_revision: str | None = "f6b8d0a2c4e7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "credential_changes",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("organisation_id", sa.Uuid(), nullable=False),
        sa.Column(
            "user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("kind", sa.String(10), nullable=False),
        sa.Column("action", sa.String(10), nullable=False),
        sa.Column("by_user_id", sa.Uuid()),
        sa.Column("by_kind", sa.String(12), nullable=False),
        sa.Column("ip", sa.String(64)),
        sa.Column("user_agent", sa.String(300)),
        sa.Column("at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_credential_changes_organisation_id", "credential_changes", ["organisation_id"]
    )
    op.create_index("ix_credential_changes_user_id", "credential_changes", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_credential_changes_user_id", "credential_changes")
    op.drop_index("ix_credential_changes_organisation_id", "credential_changes")
    op.drop_table("credential_changes")
