"""Predefined Hebrew reason chips for admin suspend/archive actions.

Phase 6.7. Admins pick from these on the SuspendWithReasonDialog and
ArchiveDealerDialog instead of retyping the common cases. New entries
can be added via POST /api/v1/admin/suspension-reasons.
"""

from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models._mixins import UUIDPrimaryKey
from app.models.base import Base


class SuspensionReasonTemplate(UUIDPrimaryKey, Base):
    __tablename__ = "suspension_reason_templates"

    text_he: Mapped[str] = mapped_column(String(200), nullable=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="true"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        CheckConstraint(
            "kind IN ('suspend', 'archive')",
            name="suspension_reason_templates_kind_check",
        ),
    )
