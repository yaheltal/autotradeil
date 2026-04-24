import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    Text,
    text,
)
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

    # ---- verification audit ----
    verified: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default="false",
    )
    verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    verified_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # ---- rejection audit ----
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    rejected_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    rejected_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
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
        CheckConstraint(
            "(rejection_reason IS NULL) = (rejected_at IS NULL) "
            "AND (rejected_at IS NULL) = (rejected_by IS NULL)",
            name="ck_dealers_rejection_consistency",
        ),
        CheckConstraint(
            "(verified = false AND verified_at IS NULL AND verified_by IS NULL) "
            "OR (verified = true AND verified_at IS NOT NULL "
            "AND verified_by IS NOT NULL)",
            name="ck_dealers_verification_consistency",
        ),
        Index("idx_dealers_user_id", "user_id"),
        Index("idx_dealers_tier", "tier"),
        Index("idx_dealers_trust_score", text("trust_score DESC")),
        Index(
            "idx_dealers_verified_status",
            "verified",
            postgresql_where=text("verified = false"),
        ),
        Index("idx_dealers_created_at", text("created_at DESC")),
        Index(
            "idx_dealers_business_name_trgm",
            "business_name",
            postgresql_using="gin",
            postgresql_ops={"business_name": "gin_trgm_ops"},
        ),
    )
