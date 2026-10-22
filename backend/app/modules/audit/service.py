import uuid

from sqlalchemy.orm import Session

from app.modules.audit.models import AuditLog


def record_audit(
    db: Session,
    *,
    shop_id: uuid.UUID,
    user_id: uuid.UUID | None,
    entity: str,
    entity_id: uuid.UUID | None,
    action: str,
    before: dict | None = None,
    after: dict | None = None,
) -> AuditLog:
    """Add an audit row to the current transaction (caller commits)."""
    row = AuditLog(
        shop_id=shop_id,
        user_id=user_id,
        entity=entity,
        entity_id=entity_id,
        action=action,
        before=before,
        after=after,
    )
    db.add(row)
    return row
