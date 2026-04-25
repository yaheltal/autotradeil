from datetime import datetime
from typing import Literal

from sqlalchemy import Boolean, CheckConstraint, DateTime, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models._mixins import TimestampMixin, UUIDPrimaryKey
from app.models.base import Base

UserType = Literal["consumer", "dealer", "admin"]


class User(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    user_type: Mapped[str] = mapped_column(Text, nullable=False)
    verified: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    # Phase 6.6.x — phone for OTP login. Works for any user type, not just
    # dealers (admins now have OTP login too). UNIQUE only when set, via
    # the partial index `uq_users_phone`.
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)

    # OTP login state — moved from dealers row so admins can OTP-login too.
    otp_code_hash: Mapped[str | None] = mapped_column(Text, nullable=True)
    otp_method: Mapped[str | None] = mapped_column(Text, nullable=True)
    otp_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    __table_args__ = (
        CheckConstraint(
            "user_type IN ('consumer', 'dealer', 'admin')",
            name="users_user_type_check",
        ),
        Index("idx_users_email", "email"),
        Index("idx_users_user_type", "user_type"),
    )
