"""Import every model module here so Alembic and `Base.metadata` see all tables."""

from app.db.base import Base  # noqa: F401
from app.modules.audit import models as _audit_models  # noqa: F401
from app.modules.auth import models as _auth_models  # noqa: F401
from app.modules.catalogue import models as _catalogue_models  # noqa: F401
from app.modules.devices import models as _devices_models  # noqa: F401
from app.modules.ledger import models as _ledger_models  # noqa: F401
from app.modules.loans import models as _loans_models  # noqa: F401
from app.modules.parties import models as _parties_models  # noqa: F401
from app.modules.payments import models as _payments_models  # noqa: F401
from app.modules.purchases import models as _purchases_models  # noqa: F401
from app.modules.returns import models as _returns_models  # noqa: F401
from app.modules.sales import models as _sales_models  # noqa: F401
from app.modules.verification import models as _verification_models  # noqa: F401
