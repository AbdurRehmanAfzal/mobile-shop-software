"""job_runs: the night report and reminders go out once per shop and day

Revision ID: f1b6d2e8a9c3
Revises: e5a8c3d1f7b4
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "f1b6d2e8a9c3"
down_revision: str | None = "e5a8c3d1f7b4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "job_runs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("shop_id", sa.Uuid(), nullable=False),
        sa.Column("job", sa.String(length=30), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("ran_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("result", sa.String(length=200), nullable=True),
        sa.ForeignKeyConstraint(["shop_id"], ["shops.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("shop_id", "job", "day", name="uq_job_runs"),
    )


def downgrade() -> None:
    op.drop_table("job_runs")
