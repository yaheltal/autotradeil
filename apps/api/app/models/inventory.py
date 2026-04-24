import uuid
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models._mixins import TimestampMixin, UUIDPrimaryKey
from app.models.base import Base


class Inventory(UUIDPrimaryKey, TimestampMixin, Base):
    """Dealer inventory — one row per listed vehicle.

    Phase 3.1 restructured this table from a JSONB `vehicle_details` blob +
    dual pricing (`price_dealer` / `price_retail`) to a flat column shape
    with a single asking `price`. The dual-pricing split is deferred to a
    later phase when B2B-only pricing becomes necessary.
    """

    __tablename__ = "inventory"

    dealer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("dealers.id", ondelete="CASCADE"),
        nullable=False,
    )

    # ---- core identity ----
    make: Mapped[str] = mapped_column(String(100), nullable=False)
    model: Mapped[str] = mapped_column(String(100), nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    mileage: Mapped[int] = mapped_column(Integer, nullable=False)
    price: Mapped[int] = mapped_column(Integer, nullable=False)

    # ---- optional spec ----
    color: Mapped[str | None] = mapped_column(String(50), nullable=True)
    transmission: Mapped[str | None] = mapped_column(String(20), nullable=True)
    fuel_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    engine_volume: Mapped[Decimal | None] = mapped_column(
        Numeric(3, 1), nullable=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ---- lifecycle ----
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="active",
        server_default="active",
    )

    __table_args__ = (
        CheckConstraint(
            "year >= 1900 AND year <= 2030",
            name="inventory_year_range",
        ),
        CheckConstraint("mileage >= 0", name="inventory_mileage_nonneg"),
        CheckConstraint("price >= 0", name="inventory_price_nonneg"),
        CheckConstraint(
            "transmission IS NULL OR transmission IN ('automatic', 'manual')",
            name="inventory_transmission_enum",
        ),
        CheckConstraint(
            "fuel_type IS NULL OR fuel_type IN ('petrol', 'diesel', 'electric', 'hybrid')",
            name="inventory_fuel_type_enum",
        ),
        CheckConstraint(
            "engine_volume IS NULL OR (engine_volume >= 0.5 AND engine_volume <= 9.9)",
            name="inventory_engine_volume_range",
        ),
        CheckConstraint(
            "status IN ('active', 'sold', 'hidden')",
            name="inventory_status_check",
        ),
        Index("idx_inventory_dealer_id", "dealer_id"),
        Index("idx_inventory_status", "status"),
    )
