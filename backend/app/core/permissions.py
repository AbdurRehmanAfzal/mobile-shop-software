"""Role → capability matrix (docs/04-DATA-MODEL.md)."""

from enum import StrEnum


class Role(StrEnum):
    OWNER = "owner"
    MANAGER = "manager"
    SALESMAN = "salesman"
    TECHNICIAN = "technician"


class Cap(StrEnum):
    TRANSACT = "transact"  # sell / purchase / payments
    VIEW_COST = "view_cost"  # cost price and profit
    VOID = "void"  # reverse / void documents
    EXPENSES = "expenses"
    REPAIR_CREATE = "repair_create"
    REPAIR_WORK = "repair_work"
    MANAGE_STAFF = "manage_staff"
    MANAGE_SETTINGS = "manage_settings"
    CATALOGUE_EDIT = "catalogue_edit"  # rename / delete shop-own brands, models, storages, colours
    REPORTS_ALL = "reports_all"
    REPORTS_OWN = "reports_own"
    VERIFY_OVERRIDE = "verify_override"


_MATRIX: dict[Role, frozenset[Cap]] = {
    Role.OWNER: frozenset(Cap),
    Role.MANAGER: frozenset(
        {
            Cap.TRANSACT,
            Cap.VIEW_COST,
            Cap.VOID,
            Cap.EXPENSES,
            Cap.REPAIR_CREATE,
            Cap.REPAIR_WORK,
            Cap.REPORTS_ALL,
            Cap.REPORTS_OWN,
            Cap.CATALOGUE_EDIT,
        }
    ),
    Role.SALESMAN: frozenset({Cap.TRANSACT, Cap.REPAIR_CREATE, Cap.REPORTS_OWN}),
    Role.TECHNICIAN: frozenset({Cap.REPAIR_WORK, Cap.REPORTS_OWN}),
}


def role_has(role: Role | str, cap: Cap) -> bool:
    return cap in _MATRIX[Role(role)]
