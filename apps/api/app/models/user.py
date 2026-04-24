from typing import Literal

from sqlalchemy import Boolean, CheckConstraint, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base
from app.models._mixins import TimestampMixin, UUIDPrimaryKey

UserType = Literal["consumer", "dealer", "admin"]


class User(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    user_type: Mapped[str] = mapped_column(String, nullable=False)
    verified: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )

    __table_args__ = (
        CheckConstraint(
            "user_type IN ('consumer', 'dealer', 'admin')",
            name="users_user_type_check",
        ),
    )
