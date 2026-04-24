"""Pydantic schemas for the B2B marketplace (Phase 4.1).

Marketplace search returns a trimmed vehicle shape with seller dealer
basics — enough to render a results card — while the vehicle detail
endpoint returns the full inventory row + images + seller contact.

Offers have 5 states: pending, accepted, rejected, countered, cancelled.
Status transitions are enforced in the router:

    pending -> accepted | rejected | countered | cancelled
    countered -> accepted | rejected | countered | cancelled
    (terminal) accepted, rejected, cancelled cannot transition further
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


# =============================================================================
# Search
# =============================================================================


class VehicleSearchResult(BaseModel):
    """A single marketplace card — trimmed vehicle + seller basics."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    make: str
    model: str
    year: int
    mileage: int
    price: int
    b2b_price: int | None
    color: str | None
    transmission: str | None
    fuel_type: str | None
    engine_volume: Decimal | None
    seller_dealer_id: uuid.UUID
    seller_business_name: str
    seller_city: str | None
    seller_tier: str
    primary_image_url: str | None
    created_at: datetime


class VehicleSearchResponse(BaseModel):
    items: list[VehicleSearchResult]
    total: int
    page: int
    pages: int
    per_page: int


# =============================================================================
# Vehicle detail (marketplace perspective)
# =============================================================================


class MarketplaceSellerInfo(BaseModel):
    """Seller info surfaced to buyers. Phone/email only when authenticated
    dealer is looking at a listing that is B2B-published."""

    id: uuid.UUID
    business_name: str
    contact_name: str | None
    city: str | None
    phone: str | None
    email: str | None
    tier: str
    deals_completed: int


class MarketplaceVehicleImage(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    url: str
    position: int


class MarketplaceVehicleDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    make: str
    model: str
    year: int
    mileage: int
    price: int
    b2b_price: int | None
    color: str | None
    transmission: str | None
    fuel_type: str | None
    engine_volume: Decimal | None
    notes: str | None
    status: str
    created_at: datetime
    seller: MarketplaceSellerInfo
    images: list[MarketplaceVehicleImage]


# =============================================================================
# Offers
# =============================================================================


class OfferCreate(BaseModel):
    offered_price: int = Field(gt=0)
    message: str | None = Field(default=None, max_length=2000)


class CounterOfferCreate(BaseModel):
    counter_price: int = Field(gt=0)
    counter_message: str | None = Field(default=None, max_length=2000)


class OfferVehicleSummary(BaseModel):
    """Light vehicle payload embedded in offer list rows."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    make: str
    model: str
    year: int
    primary_image_url: str | None


class OfferDealerSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    business_name: str
    city: str | None
    tier: str


class OfferResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    inventory_id: uuid.UUID
    buyer_dealer_id: uuid.UUID
    seller_dealer_id: uuid.UUID
    offered_price: int
    message: str | None
    status: str
    counter_price: int | None
    counter_message: str | None
    created_at: datetime
    updated_at: datetime
    vehicle: OfferVehicleSummary
    buyer: OfferDealerSummary
    seller: OfferDealerSummary


class OfferListResponse(BaseModel):
    items: list[OfferResponse]
    total: int
    page: int
    pages: int
    per_page: int


# =============================================================================
# Notifications
# =============================================================================


class NotificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    type: str
    title: str
    body: str
    data: dict[str, Any] | None
    read_at: datetime | None
    created_at: datetime


class NotificationListResponse(BaseModel):
    items: list[NotificationResponse]
    unread_count: int


# =============================================================================
# Deals (Phase 4.2 — post-acceptance double-confirmation)
# =============================================================================


class DealResponse(BaseModel):
    """A closed B2B deal row, enriched with vehicle + counterparty basics."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    offer_id: uuid.UUID
    inventory_id: uuid.UUID
    buyer_dealer_id: uuid.UUID
    seller_dealer_id: uuid.UUID
    final_price: int
    confirmed_at: datetime | None
    created_at: datetime
    vehicle: OfferVehicleSummary
    buyer: OfferDealerSummary
    seller: OfferDealerSummary


class DealListResponse(BaseModel):
    items: list[DealResponse]
    total: int


class DealerPublicProfile(BaseModel):
    """Public-safe view of a dealer. No phone/email/business_id leaked."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    business_name: str
    city: str | None
    tier: str
    trust_score: int
    deals_completed: int
    member_since: datetime
