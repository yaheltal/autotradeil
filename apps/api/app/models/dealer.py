import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    Text,
    UniqueConstraint,
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

    # ---- business identity ----
    business_name: Mapped[str] = mapped_column(Text, nullable=False)
    business_id: Mapped[str] = mapped_column(Text, nullable=False)
    license_number: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    phone: Mapped[str] = mapped_column(Text, nullable=False)
    city: Mapped[str] = mapped_column(Text, nullable=False)
    lot_size: Mapped[int] = mapped_column(Integer, nullable=False)
    contact_name: Mapped[str] = mapped_column(Text, nullable=False)

    # ---- reputation / tier ----
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

    # ---- Phase 3.5: OTP ----
    otp_code_hash: Mapped[str | None] = mapped_column(Text, nullable=True)
    otp_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    otp_method: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        default="email",
        server_default="email",
    )
    otp_send_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    otp_send_window_start: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # ---- Phase 3.5: TOTP 2FA ----
    totp_secret: Mapped[str | None] = mapped_column(Text, nullable=True)
    totp_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )

    # ---- Phase 3.5: KYC ----
    id_card_front_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    id_card_back_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    dealer_license_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    kyc_status: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        default="pending",
        server_default="pending",
    )
    kyc_rejected_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ---- Phase 4.2: trust counters ----
    deals_completed: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    deals_cancelled: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    offers_sent: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    offers_received: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    member_since: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    )

    # ---- Phase 4.3: aggregate counters ----
    total_views: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    total_offers_value: Mapped[int] = mapped_column(
        BigInteger, nullable=False, default=0, server_default="0"
    )

    # ---- Phase 4.4: profile expansion ----
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    logo_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    suspended_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    suspended_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    notification_offers: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("true")
    )
    notification_deals: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("true")
    )
    notification_updates: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("true")
    )

    __table_args__ = (
        UniqueConstraint("business_id", name="uq_dealers_business_id"),
        CheckConstraint(
            "trust_score >= 0 AND trust_score <= 100",
            name="dealers_trust_score_range",
        ),
        CheckConstraint(
            "tier IN ('bronze', 'silver', 'gold', 'platinum')",
            name="dealers_tier_check",
        ),
        CheckConstraint(
            "business_id ~ '^[0-9]{9}$'",
            name="ck_dealers_business_id_format",
        ),
        CheckConstraint(
            "lot_size >= 1 AND lot_size <= 1000",
            name="ck_dealers_lot_size_range",
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
        Index("idx_dealers_city", "city"),
    )
