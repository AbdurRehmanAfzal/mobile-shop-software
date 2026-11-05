"""accounting corrections (ADR-048): new balanced correction groups for postings made before the
accounting audit — a typed sale item's cost taken out of stock, and money on the old `purchases`
account. Nothing is changed or removed; runs once (each correction is keyed), so it is resumable.

Revision ID: c7e9a1b3d5f8
Revises: b6d8f0a2c4e7
Create Date: 2026-11-05 12:00:00

"""

from collections.abc import Sequence

from sqlalchemy.orm import Session

from alembic import op

revision: str = "c7e9a1b3d5f8"
down_revision: str | None = "b6d8f0a2c4e7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    from app.db import models  # noqa: F401  (every table known to the session)
    from app.modules.ledger import corrections

    db = Session(bind=op.get_bind())
    print("accounting corrections:", corrections.run(db))


def downgrade() -> None:
    # corrections are ledger entries like any other; undo them with reversing entries, never by
    # deleting rows (the ledger is append-only)
    pass
