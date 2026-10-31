"""Device enums and the status state machine (FR-DEV-03, FR-DEV-04).

A device's `status` is a projection of its event log. Only `apply_event()` in the service may
change it, and only through the transitions listed here.
"""

from enum import StrEnum


class DeviceCondition(StrEnum):
    BOX_PACK = "box_pack"
    OPEN_BOX = "open_box"
    USED = "used"
    PATCHED = "patched"


class PtaStatus(StrEnum):
    PTA_APPROVED = "pta_approved"
    NON_PTA = "non_pta"
    JV = "jv"
    UNKNOWN = "unknown"


class VerificationStatus(StrEnum):
    NOT_REQUIRED = "not_required"  # box-pack from a supplier
    PENDING = "pending"
    CLEAR = "clear"
    FLAGGED = "flagged"


class DeviceStatus(StrEnum):
    IN_STOCK = "in_stock"
    ON_LOAN = "on_loan"  # amanat with another shop
    WITH_CUSTOMER_FOR_APPROVAL = "with_customer_for_approval"
    SOLD = "sold"
    IN_REPAIR = "in_repair"
    FAULTY = "faulty"
    RETURNED_TO_SUPPLIER = "returned_to_supplier"


class EventType(StrEnum):
    PURCHASED = "purchased"
    VERIFIED = "verified"
    LOANED_OUT = "loaned_out"
    LOAN_RETURNED = "loan_returned"
    APPROVAL_OUT = "approval_out"
    APPROVAL_RETURNED = "approval_returned"
    SOLD = "sold"
    SALE_RETURNED = "sale_returned"
    SENT_TO_REPAIR = "sent_to_repair"
    REPAIR_RETURNED = "repair_returned"
    MARKED_FAULTY = "marked_faulty"
    FAULTY_CLEARED = "faulty_cleared"
    RETURNED_TO_SUPPLIER = "returned_to_supplier"
    PRICE_CHANGED = "price_changed"
    NOTE = "note"
    # owner addendum 4: the barcode on the timeline (backfill) and every label print
    BARCODE_ASSIGNED = "barcode_assigned"
    LABEL_PRINTED = "label_printed"


# Events that move money and therefore may only be raised by document modules (purchase, sale,
# loan settlement, returns), never through the generic events endpoint.
MONEY_EVENTS = frozenset(
    {EventType.PURCHASED, EventType.SOLD, EventType.SALE_RETURNED, EventType.RETURNED_TO_SUPPLIER}
)

# Events that never change status.
NEUTRAL_EVENTS = frozenset(
    {
        EventType.VERIFIED,
        EventType.PRICE_CHANGED,
        EventType.NOTE,
        EventType.BARCODE_ASSIGNED,
        EventType.LABEL_PRINTED,
    }
)

S = DeviceStatus
E = EventType

TRANSITIONS: dict[tuple[DeviceStatus | None, EventType], DeviceStatus] = {
    (None, E.PURCHASED): S.IN_STOCK,
    (S.SOLD, E.PURCHASED): S.IN_STOCK,  # bought back → new cycle
    (S.RETURNED_TO_SUPPLIER, E.PURCHASED): S.IN_STOCK,
    (S.IN_STOCK, E.LOANED_OUT): S.ON_LOAN,
    (S.ON_LOAN, E.LOAN_RETURNED): S.IN_STOCK,
    (S.ON_LOAN, E.SOLD): S.SOLD,  # loan settled as a sale to that shop
    (S.IN_STOCK, E.APPROVAL_OUT): S.WITH_CUSTOMER_FOR_APPROVAL,
    (S.WITH_CUSTOMER_FOR_APPROVAL, E.APPROVAL_RETURNED): S.IN_STOCK,
    (S.WITH_CUSTOMER_FOR_APPROVAL, E.SOLD): S.SOLD,
    (S.IN_STOCK, E.SOLD): S.SOLD,
    (S.SOLD, E.SALE_RETURNED): S.IN_STOCK,
    (S.IN_STOCK, E.SENT_TO_REPAIR): S.IN_REPAIR,
    (S.FAULTY, E.SENT_TO_REPAIR): S.IN_REPAIR,
    (S.IN_REPAIR, E.REPAIR_RETURNED): S.IN_STOCK,
    (S.IN_STOCK, E.MARKED_FAULTY): S.FAULTY,
    (S.IN_REPAIR, E.MARKED_FAULTY): S.FAULTY,
    (S.FAULTY, E.FAULTY_CLEARED): S.IN_STOCK,
    (S.IN_STOCK, E.RETURNED_TO_SUPPLIER): S.RETURNED_TO_SUPPLIER,
    (S.FAULTY, E.RETURNED_TO_SUPPLIER): S.RETURNED_TO_SUPPLIER,
}


def next_status(current: DeviceStatus | None, event: EventType) -> DeviceStatus | None:
    """Return the new status, the same status for neutral events, or None if not allowed."""
    if event in NEUTRAL_EVENTS:
        return current
    return TRANSITIONS.get((current, event))
