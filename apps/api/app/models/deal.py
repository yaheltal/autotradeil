"""Deal — closed B2B transaction.

Phase 4.2 restructured this from a user-scoped generic-deal shape to a
dealer-scoped marketplace shape. One `deals` row is created the moment
BOTH buyer and seller have confirmed a marketplace offer.
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models._mixins import UUIDPrimaryKey
from app.models.base import Base


class Deal(UUIDPrimaryKey, Base):
    __tablename__ = "deals"

    offer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("offers.id", ondelete="CASCADE"),
        nullable=False,
    )
    inventory_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("inventory.id"),
        nullable=False,
    )
    seller_dealer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("dealers.id"),
        nullable=False,
    )
    buyer_dealer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("dealers.id"),
        nullable=False,
    )
    final_price: Mapped[int] = mapped_column(Integer, nullable=False)
    confirmed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Digital agreement signatures — captured when each side ticks
    # the "אני מסכים לתנאי השימוש" checkbox in the confirm-deal
    # dialog. Stored alongside the IP that submitted the request as
    # weak proof-of-consent. Both sides MUST sign before the deal
    # row is created (enforced in /confirm-deal). Pre-A.3 deals will
    # have NULL here, hence nullable.
    buyer_agreement_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    buyer_agreement_ip: Mapped[str | None] = mapped_column(String(45), nullable=True)
    seller_agreement_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    seller_agreement_ip: Mapped[str | None] = mapped_column(String(45), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    __table_args__ = (
        CheckConstraint("final_price >= 0", name="deals_final_price_nonneg"),
        CheckConstraint(
            "buyer_dealer_id <> seller_dealer_id",
            name="deals_different_dealers",
        ),
        Index("idx_deals_buyer", "buyer_dealer_id"),
        Index("idx_deals_seller", "seller_dealer_id"),
        Index("idx_deals_inventory_id", "inventory_id"),
        Index("idx_deals_created_at", text("created_at DESC")),
    )
