import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models._mixins import UUIDPrimaryKey
from app.models.base import Base


class Deal(UUIDPrimaryKey, Base):
    __tablename__ = "deals"

    inventory_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("inventory.id"),
        nullable=False,
    )
    seller: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
    )
    buyer: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=False,
    )
    deal_type: Mapped[str] = mapped_column(Text, nullable=False)
    final_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    closed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    __table_args__ = (
        CheckConstraint("final_price >= 0", name="deals_final_price_nonneg"),
        CheckConstraint("seller <> buyer", name="deals_different_parties"),
        CheckConstraint(
            "deal_type IN ('b2b', 'b2c')",
            name="deals_deal_type_check",
        ),
        Index("idx_deals_inventory_id", "inventory_id"),
        Index("idx_deals_seller", "seller"),
        Index("idx_deals_buyer", "buyer"),
        Index("idx_deals_deal_type", "deal_type"),
        Index("idx_deals_closed_at", text("closed_at DESC")),
    )
