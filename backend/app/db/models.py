"""Import every model module here so Alembic and `Base.metadata` see all tables."""

from app.core import idempotency as _idempotency  # noqa: F401
from app.db.base import Base  # noqa: F401
from app.modules.accessories import models as _accessories_models  # noqa: F401
from app.modules.admin import access as _admin_access  # noqa: F401
from app.modules.admin import fees as _admin_fees  # noqa: F401
from app.modules.audit import models as _audit_models  # noqa: F401
from app.modules.auth import models as _auth_models  # noqa: F401
from app.modules.catalogue import models as _catalogue_models  # noqa: F401
from app.modules.devices import models as _devices_models  # noqa: F401
from app.modules.exchanges import models as _exchanges_models  # noqa: F401
from app.modules.expenses import models as _expenses_models  # noqa: F401
from app.modules.fingerprint import models as _fingerprint_models  # noqa: F401
from app.modules.ledger import models as _ledger_models  # noqa: F401
from app.modules.loans import models as _loans_models  # noqa: F401
from app.modules.notifications import models as _notifications_models  # noqa: F401
from app.modules.parties import models as _parties_models  # noqa: F401
from app.modules.payments import models as _payments_models  # noqa: F401
from app.modules.paymode import models as _paymode_models  # noqa: F401
from app.modules.purchases import models as _purchases_models  # noqa: F401
from app.modules.repairs import models as _repairs_models  # noqa: F401
from app.modules.returns import models as _returns_models  # noqa: F401
from app.modules.sales import models as _sales_models  # noqa: F401
from app.modules.verification import models as _verification_models  # noqa: F401
