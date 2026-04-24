import uuid
from decimal import Decimal
from typing import Any

from sqlalchemy import CheckConstraint, ForeignKey, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base
from app.models._mixins import TimestampMixin, UUIDPrimaryKey


class Inventory(UUIDPrimaryKey, TimestampMixin, Base):
    __tablename__ = "inventory"

    dealer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("dealers.id", ondelete="CASCADE"),
        nullable=False,
    )
    vehicle_details: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    # B2B price — never exposed to consumers. RLS on the table enforces this;
    # the API must also never serialize this field in consumer-scoped responses.
    price_dealer: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    price_retail: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    status: Mapped[str] = mapped_column(
        String,
        nullable=False,
        default="draft",
        server_default="draft",
    )

    __table_args__ = (
        CheckConstraint("price_dealer >= 0", name="inventory_price_dealer_nonneg"),
        CheckConstraint("price_retail >= 0", name="inventory_price_retail_nonneg"),
        CheckConstraint(
            "price_retail >= price_dealer", name="inventory_retail_ge_dealer"
        ),
        CheckConstraint(
            "status IN ('draft', 'active', 'reserved', 'sold', 'archived')",
            name="inventory_status_check",
        ),
    )
