from typing import Literal

from sqlalchemy import Boolean, CheckConstraint, Index, Text
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

    __table_args__ = (
        CheckConstraint(
            "user_type IN ('consumer', 'dealer', 'admin')",
            name="users_user_type_check",
        ),
        Index("idx_users_email", "email"),
        Index("idx_users_user_type", "user_type"),
    )
