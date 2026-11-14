"""login sessions (owner 2026-11-14, ADR-074)

Additive: one new table; nothing existing changes.

Revision ID: a9c1e3f5b7d9
Revises: e7a9c1d3f5b8
"""

import sqlalchemy as sa

from alembic import op

revision: str = "a9c1e3f5b7d9"
down_revision: str | None = "e7a9c1d3f5b8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "login_sessions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("organisation_id", sa.Uuid(), nullable=False),
        sa.Column(
            "user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("method", sa.String(12), nullable=False),
        sa.Column("ip", sa.String(64)),
        sa.Column("user_agent", sa.String(300)),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True)),
        sa.Column("ended_by", sa.Uuid()),
        sa.Column("end_reason", sa.String(20)),
    )
    op.create_index("ix_login_sessions_organisation_id", "login_sessions", ["organisation_id"])
    op.create_index("ix_login_sessions_user_id", "login_sessions", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_login_sessions_user_id", "login_sessions")
    op.drop_index("ix_login_sessions_organisation_id", "login_sessions")
    op.drop_table("login_sessions")
