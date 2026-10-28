"""fingerprint login: login_keys table and shops.fingerprint_staff

Revision ID: c3e8a1f5d9b2
Revises: b7d2f4a9c1e3
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "c3e8a1f5d9b2"
down_revision: str | None = "b7d2f4a9c1e3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "login_keys",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("kind", sa.String(length=10), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("secret_hash", sa.String(length=64), nullable=True),
        sa.Column("credential_id", sa.String(length=400), nullable=True),
        sa.Column("public_key", sa.LargeBinary(), nullable=True),
        sa.Column("sign_count", sa.Integer(), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("credential_id"),
    )
    op.create_index("ix_login_keys_user_id", "login_keys", ["user_id"])
    with op.batch_alter_table("shops") as batch:
        batch.add_column(
            sa.Column("fingerprint_staff", sa.Boolean(), nullable=False, server_default="0")
        )


def downgrade() -> None:
    with op.batch_alter_table("shops") as batch:
        batch.drop_column("fingerprint_staff")
    op.drop_index("ix_login_keys_user_id", table_name="login_keys")
    op.drop_table("login_keys")
