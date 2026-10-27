import datetime as dt
import uuid
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel

Kind = Literal["sale", "purchase", "sale_return", "purchase_return", "repair"]
State = Literal["paid", "due", "open", "returned", "void"]


class DocumentRow(BaseModel):
    kind: Kind
    id: uuid.UUID
    no: str
    date: dt.date
    party_id: uuid.UUID | None
    party_name: str | None
    party_phone: str | None
    items: str | None  # "Samsung Galaxy A54 · Nokia 105 +1"
    total: Decimal
    paid: Decimal  # for returns: money handed back
    due: Decimal  # sales/repairs: still to get; purchases: still to pay
    state: State
    ref_id: uuid.UUID | None  # returns: the original sale / purchase
    ref_no: str | None
    created_by_name: str | None


class DocumentList(BaseModel):
    rows: list[DocumentRow]
    to_get: Decimal
    to_give: Decimal
