"""Import every model module here so Alembic and `Base.metadata` see all tables."""

from app.db.base import Base  # noqa: F401
from app.modules.audit import models as _audit_models  # noqa: F401
from app.modules.auth import models as _auth_models  # noqa: F401
from app.modules.catalogue import models as _catalogue_models  # noqa: F401
