"""business profile (docs/30): legal name, tagline, business type, registration, province, email,
website, social, opening hours, owner name / CNIC, FBR POS ID, bank details, terms, currency label,
print choices. Additive, resumable, reversible.

Revision ID: d2f4b6c8e0a2
Revises: c1e3a5b7d9f1
Create Date: 2026-11-01 16:00:00

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = 'd2f4b6c8e0a2'
down_revision: str | None = 'c1e3a5b7d9f1'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

COLS = [
    ('legal_name', sa.String(length=200)), ('tagline', sa.String(length=120)), ('tagline_ur', sa.String(length=120)),
    ('business_type', sa.String(length=20)), ('registration_no', sa.String(length=40)), ('established_year', sa.Integer()),
    ('province', sa.String(length=20)), ('email', sa.String(length=120)), ('website', sa.String(length=160)),
    ('social', sa.JSON()), ('opening_hours', sa.String(length=120)), ('owner_name', sa.String(length=120)),
    ('owner_cnic', sa.String(length=15)), ('fbr_pos_id', sa.String(length=40)), ('bank_details', sa.JSON()),
    ('terms', sa.Text()), ('terms_ur', sa.Text()), ('currency', sa.JSON()), ('print_prefs', sa.JSON()),
]


def upgrade() -> None:
    have = {c["name"] for c in sa.inspect(op.get_bind()).get_columns('shops')}
    with op.batch_alter_table('shops', schema=None) as b:
        for name, typ in COLS:
            if name not in have:
                b.add_column(sa.Column(name, typ, nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('shops', schema=None) as b:
        for name, _ in reversed(COLS):
            b.drop_column(name)
