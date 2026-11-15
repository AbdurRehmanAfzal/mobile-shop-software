"""merge duplicate global brands / models / storages / colours (owner 2026-11-15, ADR-089)

The server starts with two workers; on the very first start both ran the catalogue seed at once and
each inserted the whole global list, so every brand showed twice ("Apple, Apple") and a shop's
phones were split between the two (Apple 98 + Apple 15 on the stock summary).

For every set of global rows with the same name this keeps one row (the one with the most phones,
then the oldest) and moves everything that points at the others onto it — phones, models, the
shop's spec sheets, accessory "fits" lists — and only then removes the now-empty duplicate. No phone,
bill, ledger row or event is touched other than the catalogue id on the phone. A unique index then
makes a second global row with the same name impossible.

Revision ID: c1e3a5b7d9f2
Revises: b8d0f2a4c6e9
"""

import json
import uuid
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "c1e3a5b7d9f2"
down_revision: str | None = "b8d0f2a4c6e9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _js(bind, name: str) -> str:
    """A JSON value bound as text: Postgres needs the cast, SQLite keeps the text."""
    return f"CAST(:{name} AS JSON)" if bind.dialect.name == "postgresql" else f":{name}"


def _u(v) -> uuid.UUID:
    return v if isinstance(v, uuid.UUID) else uuid.UUID(str(v))


def _plan(
    bind, table: str, group_cols: str, ref_col: str, ref_table: str = "devices"
) -> list[tuple[object, list[object]]]:
    """[(keeper_id, [duplicate ids])] for global rows of `table` grouped by `group_cols`."""
    rows = bind.execute(
        sa.text(
            f"SELECT t.id, {group_cols}, "
            f"(SELECT COUNT(*) FROM {ref_table} d WHERE d.{ref_col} = t.id) AS n "
            f"FROM {table} t WHERE t.shop_id IS NULL"
        )
    ).all()
    groups: dict[object, list] = {}
    for r in rows:
        groups.setdefault(tuple(r[1:-1]), []).append(r)
    out = []
    for members in groups.values():
        if len(members) < 2:
            continue
        # the most phones first, then a stable order (the id) so a re-run picks the same keeper
        members.sort(key=lambda r: (-int(r.n or 0), str(_u(r.id))))
        out.append((members[0].id, [m.id for m in members[1:]]))
    return out


def upgrade() -> None:
    merge(op.get_bind())
    _unique_indexes()


def merge(bind) -> None:
    """Fold every duplicate global row into one (also used by the test)."""
    tables = set(sa.inspect(bind).get_table_names())

    # 1. brands: phones and models move to the keeper
    for keep, dups in _plan(bind, "brands", "lower(t.name)", "brand_id"):
        for d in dups:
            p = {"k": keep, "d": d}
            bind.execute(sa.text("UPDATE devices SET brand_id = :k WHERE brand_id = :d"), p)
            bind.execute(sa.text("UPDATE models SET brand_id = :k WHERE brand_id = :d"), p)
            bind.execute(
                sa.text(
                    "UPDATE brands SET is_active = (is_active OR "
                    "(SELECT is_active FROM brands WHERE id = :d)) WHERE id = :k"
                ),
                p,
            )
            bind.execute(sa.text("DELETE FROM brands WHERE id = :d"), p)

    # 2. models (now under one brand): phones, spec sheets and accessory links move to the keeper
    remap: dict[uuid.UUID, uuid.UUID] = {}
    for keep, dups in _plan(bind, "models", "t.brand_id, lower(t.name)", "model_id"):
        for d in dups:
            p = {"k": keep, "d": d}
            bind.execute(sa.text("UPDATE devices SET model_id = :k WHERE model_id = :d"), p)
            if "model_specs" in tables:
                specs = bind.execute(
                    sa.text("SELECT id, shop_id FROM model_specs WHERE model_id = :d"), p
                ).all()
                for s in specs:
                    has = bind.execute(
                        sa.text("SELECT id FROM model_specs WHERE model_id = :k AND shop_id = :s"),
                        {"k": keep, "s": s.shop_id},
                    ).first()
                    if has is None:
                        bind.execute(
                            sa.text("UPDATE model_specs SET model_id = :k WHERE id = :i"),
                            {"k": keep, "i": s.id},
                        )
                    else:
                        _merge_spec(bind, has.id, s.id)
            bind.execute(
                sa.text(
                    "UPDATE models SET is_active = (is_active OR "
                    "(SELECT is_active FROM models WHERE id = :d)) WHERE id = :k"
                ),
                p,
            )
            bind.execute(sa.text("DELETE FROM models WHERE id = :d"), p)
            remap[_u(d)] = _u(keep)

    if remap and "accessories" in tables:
        rows = bind.execute(
            sa.text(
                "SELECT id, compatible_model_ids FROM accessories "
                "WHERE compatible_model_ids IS NOT NULL"
            )
        ).all()
        for r in rows:
            ids = r.compatible_model_ids
            if isinstance(ids, str):
                ids = json.loads(ids)
            if not ids:
                continue
            new, seen, changed = [], set(), False
            for x in ids:
                try:
                    ux = uuid.UUID(str(x))
                except ValueError:
                    new.append(x)
                    continue
                if ux in remap:
                    ux, changed = remap[ux], True
                if ux in seen:
                    changed = True
                    continue
                seen.add(ux)
                new.append(str(ux))
            if changed:
                bind.execute(
                    sa.text(
                        f"UPDATE accessories SET compatible_model_ids = {_js(bind, 'v')} WHERE id = :i"
                    ),
                    {"v": json.dumps(new), "i": r.id},
                )

    # 3. storages and colours: phones move to the keeper
    for table, col in (("storages", "storage_id"), ("colours", "colour_id")):
        for keep, dups in _plan(bind, table, "lower(t.name)", col):
            for d in dups:
                p = {"k": keep, "d": d}
                bind.execute(sa.text(f"UPDATE devices SET {col} = :k WHERE {col} = :d"), p)
                bind.execute(sa.text(f"DELETE FROM {table} WHERE id = :d"), p)

    # 4. expense categories (seeded the same way): expenses move to the keeper. The ledger account
    #    is named by the key, not the row, so no ledger row changes.
    if "expense_categories" in tables:
        for keep, dups in _plan(bind, "expense_categories", "t.key", "category_id", "expenses"):
            for d in dups:
                p = {"k": keep, "d": d}
                bind.execute(
                    sa.text("UPDATE expenses SET category_id = :k WHERE category_id = :d"), p
                )
                bind.execute(sa.text("DELETE FROM expense_categories WHERE id = :d"), p)


def _unique_indexes() -> None:
    """Never again: one global row per name."""
    where = sa.text("shop_id IS NULL")
    for table in ("brands", "storages", "colours"):
        op.create_index(
            f"uq_{table}_global_name",
            table,
            [sa.text("lower(name)")],
            unique=True,
            postgresql_where=where,
            sqlite_where=where,
        )
    op.create_index(
        "uq_models_global_name",
        "models",
        ["brand_id", sa.text("lower(name)")],
        unique=True,
        postgresql_where=where,
        sqlite_where=where,
    )
    op.create_index(
        "uq_expense_categories_global_key",
        "expense_categories",
        ["key"],
        unique=True,
        postgresql_where=where,
        sqlite_where=where,
    )


def _merge_spec(bind, keep_id, dup_id) -> None:
    """Both models had a spec sheet for the same shop: keep the keeper's values, add what only the
    duplicate had, then drop the duplicate's sheet."""
    k = bind.execute(
        sa.text("SELECT model_number, specs FROM model_specs WHERE id = :i"), {"i": keep_id}
    ).first()
    d = bind.execute(
        sa.text("SELECT model_number, specs FROM model_specs WHERE id = :i"), {"i": dup_id}
    ).first()

    def load(v):
        if isinstance(v, str):
            try:
                return json.loads(v) or {}
            except ValueError:
                return {}
        return v or {}

    merged = {**load(d.specs), **{a: b for a, b in load(k.specs).items() if b not in (None, "")}}
    bind.execute(
        sa.text(
            f"UPDATE model_specs SET specs = {_js(bind, 's')}, model_number = :m WHERE id = :i"
        ),
        {"s": json.dumps(merged), "m": k.model_number or d.model_number, "i": keep_id},
    )
    bind.execute(sa.text("DELETE FROM model_specs WHERE id = :i"), {"i": dup_id})


def downgrade() -> None:
    for name, table in (
        ("uq_expense_categories_global_key", "expense_categories"),
        ("uq_models_global_name", "models"),
        ("uq_colours_global_name", "colours"),
        ("uq_storages_global_name", "storages"),
        ("uq_brands_global_name", "brands"),
    ):
        op.drop_index(name, table_name=table)
