import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base
from app.models._mixins import TimestampMixin, UUIDPrimaryKey


class Offer(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "offers"

    inventory_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("inventory.id", ondelete="CASCADE"),
        nullable=False,
    )
    from_dealer: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("dealers.id"),
        nullable=False,
    )
    to_dealer: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("dealers.id"),
        nullable=False,
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    status: Mapped[str] = mapped_column(
        String,
        nullable=False,
        default="pending",
        server_default="pending",
    )
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    __table_args__ = (
        CheckConstraint("amount >= 0", name="offers_amount_nonneg"),
        CheckConstraint("from_dealer <> to_dealer", name="offers_different_dealers"),
        CheckConstraint(
            "status IN ('pending', 'accepted', 'rejected', 'countered', 'expired', 'withdrawn')",
            name="offers_status_check",
        ),
    )
