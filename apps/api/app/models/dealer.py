import uuid
from decimal import Decimal

from sqlalchemy import CheckConstraint, ForeignKey, Index, Numeric, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models._mixins import TimestampMixin, UUIDPrimaryKey
from app.models.base import Base


class Dealer(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "dealers"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    business_name: Mapped[str] = mapped_column(Text, nullable=False)
    license_num: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    trust_score: Mapped[Decimal] = mapped_column(
        Numeric(5, 2),
        nullable=False,
        default=Decimal("0.00"),
        server_default="0.00",
    )
    tier: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        default="bronze",
        server_default="bronze",
    )

    __table_args__ = (
        CheckConstraint(
            "trust_score >= 0 AND trust_score <= 100",
            name="dealers_trust_score_range",
        ),
        CheckConstraint(
            "tier IN ('bronze', 'silver', 'gold', 'platinum')",
            name="dealers_tier_check",
        ),
        Index("idx_dealers_user_id", "user_id"),
        Index("idx_dealers_tier", "tier"),
        Index("idx_dealers_trust_score", text("trust_score DESC")),
    )
