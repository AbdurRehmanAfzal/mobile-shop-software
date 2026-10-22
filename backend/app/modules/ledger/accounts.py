"""Account keys used in ledger entries (docs/04-DATA-MODEL.md → Ledger).

System accounts are plain strings; party and cash accounts carry an id suffix.
Debit increases assets/expenses, credit increases income/liabilities/equity.
Party balance = Σ(debit − credit) on `party:<id>`  → positive = party owes the shop.
"""

import uuid
from enum import StrEnum


class SysAccount(StrEnum):
    SALES = "sales"  # income
    PURCHASES = "purchases"  # expense-like (used only for accessory/non-inventory purchases)
    INVENTORY = "inventory"  # asset: devices + accessories at cost
    COGS = "cogs"  # cost of goods sold
    DISCOUNTS = "discounts"  # contra-income
    TAX_PAYABLE = "tax_payable"  # liability
    REPAIR_INCOME = "repair_income"
    OTHER_INCOME = "other_income"
    EXPENSE = "expense"  # prefix: expense:<category>
    EQUITY = "equity"  # opening balances / owner capital
    SUSPENSE = "suspense"  # unallocated money, must be cleared


def party_account(party_id: uuid.UUID) -> str:
    return f"party:{party_id}"


def cash_account(cash_account_id: uuid.UUID) -> str:
    return f"cash:{cash_account_id}"


def expense_account(category: str) -> str:
    return f"{SysAccount.EXPENSE}:{category.strip().lower()}"


def is_party(account: str) -> bool:
    return account.startswith("party:")


def is_cash(account: str) -> bool:
    return account.startswith("cash:")


def id_of(account: str) -> uuid.UUID:
    return uuid.UUID(account.split(":", 1)[1])
