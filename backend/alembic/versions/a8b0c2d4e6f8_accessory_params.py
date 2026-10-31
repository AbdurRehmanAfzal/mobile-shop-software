"""accessory parameters (owner addendum 5, 2026-10-31): the product card on accessories, purchase
batches (cost history, FIFO), price history, supplier SKUs; units / freight / supplier bill no on
purchases; warranty end on invoice lines; wholesale customers; the shop's item settings

Revision ID: a8b0c2d4e6f8
Revises: f7a9b1c3d4e6
Create Date: 2026-10-31 23:30:00

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = 'a8b0c2d4e6f8'
down_revision: str | None = 'f7a9b1c3d4e6'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

NUM = sa.Numeric(14, 2)


def _insp():
    return sa.inspect(op.get_bind())


def _cols(table: str) -> set[str]:
    return {c["name"] for c in _insp().get_columns(table)}


def _has_table(name: str) -> bool:
    return name in _insp().get_table_names()


def _idx(table: str) -> set[str]:
    return {i["name"] for i in _insp().get_indexes(table)}


def _add(batch_op, table: str, have: set[str], col: sa.Column) -> None:
    if col.name not in have:
        batch_op.add_column(col)


def upgrade() -> None:
    have = _cols('accessories')
    with op.batch_alter_table('accessories', schema=None) as batch_op:
        _add(batch_op, 'accessories', have, sa.Column('brand', sa.String(length=80), nullable=True))
        _add(batch_op, 'accessories', have, sa.Column('compatible', sa.String(length=200), nullable=True))
        _add(batch_op, 'accessories', have, sa.Column('compatible_model_ids', sa.JSON(), nullable=True))
        _add(batch_op, 'accessories', have, sa.Column('grade', sa.String(length=20), server_default='unspecified', nullable=False))
        _add(batch_op, 'accessories', have, sa.Column('color', sa.String(length=40), nullable=True))
        _add(batch_op, 'accessories', have, sa.Column('size', sa.String(length=40), nullable=True))
        _add(batch_op, 'accessories', have, sa.Column('capacity', sa.String(length=40), nullable=True))
        _add(batch_op, 'accessories', have, sa.Column('connector', sa.String(length=40), nullable=True))
        _add(batch_op, 'accessories', have, sa.Column('wattage', sa.String(length=20), nullable=True))
        _add(batch_op, 'accessories', have, sa.Column('warranty_days', sa.Integer(), server_default='0', nullable=False))
        _add(batch_op, 'accessories', have, sa.Column('warranty_terms', sa.String(length=300), nullable=True))
        _add(batch_op, 'accessories', have, sa.Column('warranty_by', sa.String(length=10), nullable=True))
        _add(batch_op, 'accessories', have, sa.Column('unit', sa.String(length=12), server_default='piece', nullable=False))
        _add(batch_op, 'accessories', have, sa.Column('pack_units', sa.JSON(), nullable=True))
        _add(batch_op, 'accessories', have, sa.Column('wholesale_price', NUM, nullable=True))
        _add(batch_op, 'accessories', have, sa.Column('min_price', NUM, nullable=True))
        _add(batch_op, 'accessories', have, sa.Column('promo_price', NUM, nullable=True))
        _add(batch_op, 'accessories', have, sa.Column('promo_from', sa.Date(), nullable=True))
        _add(batch_op, 'accessories', have, sa.Column('promo_to', sa.Date(), nullable=True))
        _add(batch_op, 'accessories', have, sa.Column('pricing_mode', sa.String(length=8), server_default='fixed', nullable=False))
        _add(batch_op, 'accessories', have, sa.Column('markup_pct', NUM, nullable=True))
        _add(batch_op, 'accessories', have, sa.Column('tax_rate', NUM, nullable=True))
        _add(batch_op, 'accessories', have, sa.Column('tax_inclusive', sa.Boolean(), nullable=True))
        _add(batch_op, 'accessories', have, sa.Column('max_stock', sa.Integer(), nullable=True))
        _add(batch_op, 'accessories', have, sa.Column('location', sa.String(length=60), nullable=True))
        _add(batch_op, 'accessories', have, sa.Column('show_in_sale', sa.Boolean(), server_default='1', nullable=False))
        _add(batch_op, 'accessories', have, sa.Column('image_path', sa.String(length=500), nullable=True))
        _add(batch_op, 'accessories', have, sa.Column('description', sa.Text(), nullable=True))
        if 'ix_accessories_brand' not in _idx('accessories'):
            batch_op.create_index('ix_accessories_brand', ['brand'], unique=False)

    if not _has_table('accessory_batches'):
      op.create_table(
        'accessory_batches',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('shop_id', sa.Uuid(), nullable=False),
        sa.Column('accessory_id', sa.Uuid(), nullable=False),
        sa.Column('source', sa.String(length=12), nullable=False),
        sa.Column('document_type', sa.String(length=30), nullable=True),
        sa.Column('document_id', sa.Uuid(), nullable=True),
        sa.Column('party_id', sa.Uuid(), nullable=True),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('qty_in', sa.Integer(), nullable=False),
        sa.Column('qty_left', sa.Integer(), nullable=False),
        sa.Column('unit_cost', NUM, nullable=False),
        sa.Column('pack_unit', sa.String(length=12), nullable=True),
        sa.Column('pack_qty', sa.Integer(), nullable=True),
        sa.Column('batch_ref', sa.String(length=40), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['accessory_id'], ['accessories.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['party_id'], ['parties.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['shop_id'], ['shops.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    if 'ix_accessory_batches_shop_id' not in _idx('accessory_batches'):
        op.create_index('ix_accessory_batches_shop_id', 'accessory_batches', ['shop_id'], unique=False)
    if 'ix_accessory_batches_accessory_id' not in _idx('accessory_batches'):
        op.create_index('ix_accessory_batches_accessory_id', 'accessory_batches', ['accessory_id'], unique=False)

    if not _has_table('accessory_price_changes'):
      op.create_table(
        'accessory_price_changes',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('shop_id', sa.Uuid(), nullable=False),
        sa.Column('accessory_id', sa.Uuid(), nullable=False),
        sa.Column('field', sa.String(length=20), nullable=False),
        sa.Column('old_value', NUM, nullable=True),
        sa.Column('new_value', NUM, nullable=True),
        sa.Column('source', sa.String(length=12), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=True),
        sa.Column('at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['accessory_id'], ['accessories.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['shop_id'], ['shops.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    if 'ix_accessory_price_changes_shop_id' not in _idx('accessory_price_changes'):
        op.create_index('ix_accessory_price_changes_shop_id', 'accessory_price_changes', ['shop_id'], unique=False)
    if 'ix_accessory_price_changes_accessory_id' not in _idx('accessory_price_changes'):
        op.create_index('ix_accessory_price_changes_accessory_id', 'accessory_price_changes', ['accessory_id'], unique=False)

    if not _has_table('accessory_supplier_skus'):
      op.create_table(
        'accessory_supplier_skus',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('shop_id', sa.Uuid(), nullable=False),
        sa.Column('accessory_id', sa.Uuid(), nullable=False),
        sa.Column('party_id', sa.Uuid(), nullable=True),
        sa.Column('sku', sa.String(length=60), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['accessory_id'], ['accessories.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['party_id'], ['parties.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['shop_id'], ['shops.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    if 'ix_accessory_supplier_skus_shop_id' not in _idx('accessory_supplier_skus'):
        op.create_index('ix_accessory_supplier_skus_shop_id', 'accessory_supplier_skus', ['shop_id'], unique=False)
    if 'ix_accessory_supplier_skus_accessory_id' not in _idx('accessory_supplier_skus'):
        op.create_index('ix_accessory_supplier_skus_accessory_id', 'accessory_supplier_skus', ['accessory_id'], unique=False)
    if 'ix_accessory_supplier_skus_party_id' not in _idx('accessory_supplier_skus'):
        op.create_index('ix_accessory_supplier_skus_party_id', 'accessory_supplier_skus', ['party_id'], unique=False)
    if 'ix_accessory_supplier_skus_sku' not in _idx('accessory_supplier_skus'):
        op.create_index('ix_accessory_supplier_skus_sku', 'accessory_supplier_skus', ['sku'], unique=False)

    have = _cols('purchases')
    with op.batch_alter_table('purchases', schema=None) as batch_op:
        _add(batch_op, 'purchases', have, sa.Column('supplier_invoice_no', sa.String(length=40), nullable=True))
        _add(batch_op, 'purchases', have, sa.Column('extra_costs', NUM, server_default='0', nullable=False))
        _add(batch_op, 'purchases', have, sa.Column('extra_costs_note', sa.String(length=120), nullable=True))
    have = _cols('purchase_lines')
    with op.batch_alter_table('purchase_lines', schema=None) as batch_op:
        _add(batch_op, 'purchase_lines', have, sa.Column('pack_unit', sa.String(length=12), nullable=True))
        _add(batch_op, 'purchase_lines', have, sa.Column('pack_qty', sa.Integer(), nullable=True))
        _add(batch_op, 'purchase_lines', have, sa.Column('extra_cost_share', NUM, server_default='0', nullable=False))
        _add(batch_op, 'purchase_lines', have, sa.Column('batch_ref', sa.String(length=40), nullable=True))
    have = _cols('invoice_lines')
    with op.batch_alter_table('invoice_lines', schema=None) as batch_op:
        _add(batch_op, 'invoice_lines', have, sa.Column('warranty_until', sa.Date(), nullable=True))
    have = _cols('parties')
    with op.batch_alter_table('parties', schema=None) as batch_op:
        _add(batch_op, 'parties', have, sa.Column('wholesale', sa.Boolean(), server_default='0', nullable=False))
    have = _cols('shops')
    with op.batch_alter_table('shops', schema=None) as batch_op:
        _add(batch_op, 'shops', have, sa.Column('item_prefs', sa.JSON(), nullable=True))

    # backfill (docs/24 §D): one "Opening stock" batch per item that has stock, at its current
    # average cost, dated at its first movement. Idempotent: items with a batch are skipped.
    conn = op.get_bind()
    rows = conn.execute(sa.text(
        "SELECT a.id, a.shop_id, a.qty, a.avg_cost, "
        "(SELECT MIN(m.at) FROM accessory_movements m WHERE m.accessory_id = a.id) AS first_at "
        "FROM accessories a WHERE a.qty > 0 AND NOT EXISTS "
        "(SELECT 1 FROM accessory_batches b WHERE b.accessory_id = a.id)"
    )).fetchall()
    import datetime as dt
    import uuid

    now = dt.datetime.now(dt.UTC)
    pg = conn.dialect.name == "postgresql"
    # SQLite keeps Uuid columns as 32-hex strings and naive datetimes; Postgres has native types
    new_id = (lambda: str(uuid.uuid4())) if pg else (lambda: uuid.uuid4().hex)
    created = now if pg else now.replace(tzinfo=None).strftime("%Y-%m-%d %H:%M:%S.%f")
    for aid, shop_id, qty, avg_cost, first_at in rows:
        day = now.date()
        if first_at:
            try:
                day = (first_at if isinstance(first_at, dt.datetime) else dt.datetime.fromisoformat(str(first_at))).date()
            except ValueError:
                pass
        conn.execute(
            sa.text(
                "INSERT INTO accessory_batches (id, shop_id, accessory_id, source, document_type, document_id, "
                "party_id, date, qty_in, qty_left, unit_cost, pack_unit, pack_qty, batch_ref, created_at) VALUES "
                "(:id, :shop_id, :aid, 'opening', 'opening_stock', :aid, NULL, :day, :qty, :qty, :cost, NULL, NULL, "
                "'Opening stock', :now)"
            ),
            {"id": new_id(), "shop_id": shop_id, "aid": aid, "day": day if pg else day.isoformat(), "qty": qty, "cost": avg_cost or 0, "now": created},
        )


def downgrade() -> None:
    with op.batch_alter_table('shops', schema=None) as batch_op:
        batch_op.drop_column('item_prefs')
    with op.batch_alter_table('parties', schema=None) as batch_op:
        batch_op.drop_column('wholesale')
    with op.batch_alter_table('invoice_lines', schema=None) as batch_op:
        batch_op.drop_column('warranty_until')
    with op.batch_alter_table('purchase_lines', schema=None) as batch_op:
        for c in ('batch_ref', 'extra_cost_share', 'pack_qty', 'pack_unit'):
            batch_op.drop_column(c)
    with op.batch_alter_table('purchases', schema=None) as batch_op:
        for c in ('extra_costs_note', 'extra_costs', 'supplier_invoice_no'):
            batch_op.drop_column(c)
    op.drop_table('accessory_supplier_skus')
    op.drop_table('accessory_price_changes')
    op.drop_table('accessory_batches')
    with op.batch_alter_table('accessories', schema=None) as batch_op:
        batch_op.drop_index('ix_accessories_brand')
        for c in (
            'description', 'image_path', 'show_in_sale', 'location', 'max_stock', 'tax_inclusive', 'tax_rate',
            'markup_pct', 'pricing_mode', 'promo_to', 'promo_from', 'promo_price', 'min_price', 'wholesale_price',
            'pack_units', 'unit', 'warranty_by', 'warranty_terms', 'warranty_days', 'wattage', 'connector',
            'capacity', 'size', 'color', 'grade', 'compatible_model_ids', 'compatible', 'brand',
        ):
            batch_op.drop_column(c)
