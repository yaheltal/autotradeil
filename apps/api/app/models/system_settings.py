"""System-settings singleton table (Phase 4.4).

One row, id=1, enforced by a CHECK constraint. Holds admin-editable
knobs that don't deserve their own table — site name, support email,
welcome message, subscription tiers blob.
"""

from datetime import datetime
from typing import Any

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class SystemSettings(Base):
    __tablename__ = "system_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    site_name: Mapped[str] = mapped_column(
        String(100), nullable=False, server_default="AutoTradeIL"
    )
    support_email: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        server_default="support@autotradeil.co.il",
    )
    welcome_message: Mapped[str] = mapped_column(Text, nullable=False)
    subscription_tiers: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    __table_args__ = (CheckConstraint("id = 1", name="system_settings_singleton"),)
