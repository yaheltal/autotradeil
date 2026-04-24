import uuid

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models._mixins import TimestampMixin, UUIDPrimaryKey
from app.models.base import Base


class Offer(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "offers"

    inventory_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("inventory.id", ondelete="CASCADE"),
        nullable=False,
    )
    buyer_dealer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("dealers.id", ondelete="CASCADE"),
        nullable=False,
    )
    seller_dealer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("dealers.id", ondelete="CASCADE"),
        nullable=False,
    )
    offered_price: Mapped[int] = mapped_column(Integer, nullable=False)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="pending",
        server_default="pending",
    )
    counter_price: Mapped[int | None] = mapped_column(Integer, nullable=True)
    counter_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (
        CheckConstraint("offered_price > 0", name="offers_offered_price_pos"),
        CheckConstraint(
            "counter_price IS NULL OR counter_price > 0",
            name="offers_counter_price_pos",
        ),
        CheckConstraint(
            "status IN ('pending', 'accepted', 'rejected', 'countered', 'cancelled')",
            name="offers_status_check",
        ),
        CheckConstraint(
            "buyer_dealer_id <> seller_dealer_id", name="offers_different_dealers"
        ),
        Index("idx_offers_inventory_id", "inventory_id"),
        Index("idx_offers_buyer", "buyer_dealer_id"),
        Index("idx_offers_seller", "seller_dealer_id"),
        Index("idx_offers_status", "status"),
    )
