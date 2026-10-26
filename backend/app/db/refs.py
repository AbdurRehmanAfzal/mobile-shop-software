"""Count rows that point at a given row through any foreign key.

Used by "delete" endpoints: a row nothing refers to is deleted for real; a row with history is
archived instead (is_active = False), so old documents, statements and device history stay intact.
Some references are ON DELETE SET NULL (e.g. device events -> party), so we must not rely on the
database refusing the delete.
"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.base import Base


def count_references(db: Session, table: str, row_id: uuid.UUID) -> int:
    total = 0
    for t in Base.metadata.sorted_tables:
        for fk in t.foreign_keys:
            if fk.column.table.name == table and fk.column.name == "id" and t.name != table:
                total += (
                    db.scalar(select(func.count()).select_from(t).where(fk.parent == row_id)) or 0
                )
    return total


def user_name(db: Session, user_id: uuid.UUID | None) -> str | None:
    """Name of the staff member (owner, manager, salesman...) who made a document."""
    if user_id is None:
        return None
    from app.modules.auth.models import User

    u = db.get(User, user_id)
    return u.name if u else None
