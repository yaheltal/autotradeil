import uuid
from decimal import Decimal

from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
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

    # ---- B2B marketplace (Phase 4.1) ----
    is_b2b: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default="false",
    )
    b2b_price: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # ---- Phase 4.3: visibility + B2C + pause ----
    visibility: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="private",
        server_default="private",
    )
    b2c_price: Mapped[int | None] = mapped_column(Integer, nullable=True)
    paused_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    pause_reason: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # ---- Phase 6.5: sale lifecycle ----
    purchase_cost: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sale_price: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sold_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    sold_to: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # ---- Phase 6.5: warranty (optional) ----
    warranty_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    warranty_until: Mapped[date | None] = mapped_column(Date, nullable=True)

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
        CheckConstraint(
            "b2b_price IS NULL OR b2b_price >= 0",
            name="inventory_b2b_price_nonneg",
        ),
        CheckConstraint(
            "visibility IN ('private', 'b2b', 'b2c', 'both')",
            name="inventory_visibility_check",
        ),
        CheckConstraint(
            "b2c_price IS NULL OR b2c_price >= 0",
            name="inventory_b2c_price_nonneg",
        ),
        CheckConstraint(
            "purchase_cost IS NULL OR purchase_cost >= 0",
            name="inventory_purchase_cost_nonneg",
        ),
        CheckConstraint(
            "sale_price IS NULL OR sale_price >= 0",
            name="inventory_sale_price_nonneg",
        ),
        CheckConstraint(
            "sold_to IS NULL OR sold_to IN ('b2b', 'b2c', 'external')",
            name="inventory_sold_to_check",
        ),
        CheckConstraint(
            "warranty_type IS NULL OR warranty_type IN ('manufacturer', 'dealer', 'extended', 'none')",
            name="inventory_warranty_type_check",
        ),
        Index("idx_inventory_dealer_id", "dealer_id"),
        Index("idx_inventory_status", "status"),
        Index("idx_inventory_sold_at", "sold_at"),
    )
