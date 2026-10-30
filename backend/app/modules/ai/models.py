"""AI usage per shop per day (owner 2026-10-30): a daily cap keeps the API bill predictable."""

import datetime as dt

from sqlalchemy import Date, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, ShopScoped, UUIDPk


class AiUsage(UUIDPk, ShopScoped, Base):
    __tablename__ = "ai_usage"
    __table_args__ = (UniqueConstraint("shop_id", "day", name="uq_ai_usage_day"),)

    day: Mapped[dt.date] = mapped_column(Date, nullable=False, index=True)
    calls: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    input_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
