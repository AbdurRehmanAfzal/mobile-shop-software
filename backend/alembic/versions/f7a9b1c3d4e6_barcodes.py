"""barcodes (owner addendum 4, 2026-10-31): a barcode per phone and per accessory SKU, its type,
a manufacturer code; the shop's barcode settings and sequence

Revision ID: f7a9b1c3d4e6
Revises: e6f8a0b2c3d5
Create Date: 2026-10-31 21:00:00

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = 'f7a9b1c3d4e6'
down_revision: str | None = 'e6f8a0b2c3d5'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table('devices', schema=None) as batch_op:
        batch_op.add_column(sa.Column('barcode', sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column('barcode_type', sa.String(length=12), nullable=True))
        batch_op.add_column(sa.Column('manufacturer_code', sa.String(length=64), nullable=True))
        batch_op.create_index('ix_devices_barcode', ['barcode'], unique=False)
        batch_op.create_index('ix_devices_manufacturer_code', ['manufacturer_code'], unique=False)
        batch_op.create_unique_constraint('uq_devices_shop_barcode', ['shop_id', 'barcode'])
    with op.batch_alter_table('accessories', schema=None) as batch_op:
        batch_op.add_column(sa.Column('barcode', sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column('barcode_type', sa.String(length=12), nullable=True))
        batch_op.add_column(sa.Column('manufacturer_code', sa.String(length=64), nullable=True))
        batch_op.create_index('ix_accessories_barcode', ['barcode'], unique=False)
        batch_op.create_index('ix_accessories_manufacturer_code', ['manufacturer_code'], unique=False)
    with op.batch_alter_table('shops', schema=None) as batch_op:
        batch_op.add_column(sa.Column('barcode_prefs', sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column('barcode_seq', sa.Integer(), server_default='0', nullable=False))


def downgrade() -> None:
    with op.batch_alter_table('shops', schema=None) as batch_op:
        batch_op.drop_column('barcode_seq')
        batch_op.drop_column('barcode_prefs')
    with op.batch_alter_table('accessories', schema=None) as batch_op:
        batch_op.drop_index('ix_accessories_manufacturer_code')
        batch_op.drop_index('ix_accessories_barcode')
        batch_op.drop_column('manufacturer_code')
        batch_op.drop_column('barcode_type')
        batch_op.drop_column('barcode')
    with op.batch_alter_table('devices', schema=None) as batch_op:
        batch_op.drop_constraint('uq_devices_shop_barcode', type_='unique')
        batch_op.drop_index('ix_devices_manufacturer_code')
        batch_op.drop_index('ix_devices_barcode')
        batch_op.drop_column('manufacturer_code')
        batch_op.drop_column('barcode_type')
        batch_op.drop_column('barcode')
