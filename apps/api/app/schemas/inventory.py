from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


_OWNERSHIP_PATTERN = "^(private|dealer|leasing|rental|government)$"


class InventoryItemCreate(BaseModel):
    make: str = Field(min_length=1, max_length=100)
    model: str = Field(min_length=1, max_length=100)
    year: int = Field(ge=1900, le=2030)
    mileage: int = Field(ge=0)
    price: int = Field(ge=0)
    color: str | None = Field(default=None, max_length=50)
    transmission: str | None = Field(default=None, pattern="^(automatic|manual)$")
    fuel_type: str | None = Field(
        default=None, pattern="^(petrol|diesel|electric|hybrid)$"
    )
    engine_volume: Decimal | None = Field(default=None, ge=Decimal("0.5"), le=Decimal("9.9"))
    # Wave 2 — notes split. public_notes surfaces on the marketplace
    # detail view; private_notes is owner-only and is never returned
    # to non-owners.
    public_notes: str | None = Field(default=None, max_length=2000)
    private_notes: str | None = Field(default=None, max_length=2000)
    purchase_cost: int | None = Field(default=None, ge=0)
    warranty_type: str | None = Field(
        default=None, pattern="^(manufacturer|dealer|extended|none)$"
    )
    warranty_until: date | None = Field(default=None)
    # Ownership history — both nullable so legacy / partial uploads
    # don't break. UI presents the two as a single combined dropdown.
    hand: int | None = Field(default=None, ge=1, le=4)
    ownership_type: str | None = Field(default=None, pattern=_OWNERSHIP_PATTERN)


class InventoryItemUpdate(BaseModel):
    make: str | None = Field(default=None, min_length=1, max_length=100)
    model: str | None = Field(default=None, min_length=1, max_length=100)
    year: int | None = Field(default=None, ge=1900, le=2030)
    mileage: int | None = Field(default=None, ge=0)
    price: int | None = Field(default=None, ge=0)
    color: str | None = Field(default=None, max_length=50)
    transmission: str | None = Field(default=None, pattern="^(automatic|manual)$")
    fuel_type: str | None = Field(
        default=None, pattern="^(petrol|diesel|electric|hybrid)$"
    )
    engine_volume: Decimal | None = Field(default=None, ge=Decimal("0.5"), le=Decimal("9.9"))
    public_notes: str | None = Field(default=None, max_length=2000)
    private_notes: str | None = Field(default=None, max_length=2000)
    # status mutation via PATCH is restricted to active|hidden|sold.
    # pending_deletion is not settable here — it must go through the
    # dedicated /request-deletion endpoint so the reason + timestamp
    # are captured and the audit trail is intact.
    status: str | None = Field(default=None, pattern="^(active|sold|hidden)$")
    is_b2b: bool | None = Field(default=None)
    b2b_price: int | None = Field(default=None, ge=0)
    visibility: str | None = Field(default=None, pattern="^(private|b2b|b2c|both)$")
    b2c_price: int | None = Field(default=None, ge=0)
    purchase_cost: int | None = Field(default=None, ge=0)
    warranty_type: str | None = Field(
        default=None, pattern="^(manufacturer|dealer|extended|none)$"
    )
    warranty_until: date | None = Field(default=None)
    hand: int | None = Field(default=None, ge=1, le=4)
    ownership_type: str | None = Field(default=None, pattern=_OWNERSHIP_PATTERN)


class InventoryItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    dealer_id: uuid.UUID
    make: str
    model: str
    year: int
    mileage: int
    price: int
    color: str | None
    transmission: str | None
    fuel_type: str | None
    engine_volume: Decimal | None
    # Wave 2 — notes split. Both fields are owner-facing here;
    # marketplace consumers see public_notes only via
    # MarketplaceVehicleDetail.
    public_notes: str | None
    private_notes: str | None
    status: str
    is_b2b: bool
    b2b_price: int | None
    visibility: str
    b2c_price: int | None
    # Wave 2 — pending-deletion workflow fields.
    pending_deletion_reason: str | None
    pending_deletion_requested_at: datetime | None
    previous_status: str | None
    purchase_cost: int | None
    sale_price: int | None
    sold_at: datetime | None
    sold_to: str | None
    warranty_type: str | None
    warranty_until: date | None
    created_at: datetime
    updated_at: datetime
    # Ownership history (יד + סוג בעלות). Surfaced everywhere so cards
    # and detail pages can show "יד 2 — פרטית" without an extra fetch.
    hand: int | None = None
    ownership_type: str | None = None
    # The lowest-position non-hidden image acts as the primary
    # thumbnail. Populated by the list endpoint via a single bulk
    # query so individual rows can render a card preview without
    # an extra round-trip per row.
    primary_image_url: str | None = None


class InventoryListResponse(BaseModel):
    items: list[InventoryItemResponse]
    total: int
    page: int
    pages: int
    per_page: int


# =============================================================================
# Phase 6.5 — sale lifecycle, stats, image visibility
# =============================================================================


class SellRequest(BaseModel):
    sale_price: int = Field(gt=0)
    purchase_cost: int | None = Field(default=None, ge=0)
    sold_to: str = Field(pattern="^(b2b|b2c|external)$")
    sold_at: datetime | None = Field(default=None)

    # Phase 6.8.4 — buyer details (optional; captured for B2C/external).
    # Required at the API level only when sold_to=b2c so we don't break
    # existing B2B closes that already carry the buyer via Deal/dealer_id.
    buyer_name: str | None = Field(default=None, max_length=120)
    buyer_id_number: str | None = Field(default=None, pattern=r"^[0-9]{9}$")
    buyer_phone: str | None = Field(default=None, max_length=30)

    # Phase 6.8.4 — optional trade-in vehicle.
    was_trade_in: bool = False
    trade_in_make: str | None = Field(default=None, max_length=100)
    trade_in_model: str | None = Field(default=None, max_length=100)
    trade_in_year: int | None = Field(default=None, ge=1900, le=2030)
    trade_in_value: int | None = Field(default=None, ge=0)
    trade_in_plate: str | None = Field(default=None, max_length=20)


class SellWarning(BaseModel):
    deal_price_mismatch: dict[str, int] | None = None


class SellResponse(BaseModel):
    inventory: InventoryItemResponse
    warnings: SellWarning | None = None


class StatsResponse(BaseModel):
    period: str
    active_count: int
    sold_count: int
    total_revenue: int
    total_profit: int
    profit_margin_pct: float
    avg_days_to_sell: int | None
    rows_missing_purchase_cost: int


class ImagePatchRequest(BaseModel):
    hidden: bool
