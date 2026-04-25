from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class DealerListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    email: str
    business_name: str
    business_id: str
    contact_name: str
    city: str
    phone: str
    lot_size: int
    verified: bool
    rejection_reason: str | None
    tier: str
    trust_score: int
    created_at: datetime
    verified_at: datetime | None
    rejected_at: datetime | None
    # Phase 4.4 additions for the expanded admin dealers table
    deals_completed: int = 0
    kyc_status: str = "pending"
    kyc_rejected_reason: str | None = None
    member_since: datetime | None = None
    suspended_at: datetime | None = None
    # Phase 6.8.7 — personal identity (extracted at signup; admin-only).
    first_name: str | None = None
    last_name: str | None = None
    id_number: str | None = None
    birth_date: date | None = None
    license_number: str | None = None
    license_until: date | None = None
    # Phase 6.8.7 — signed KYC URLs (10-min TTL). Detail endpoint populates,
    # list endpoint leaves null to keep responses small.
    id_card_front_url: str | None = None
    id_card_back_url: str | None = None
    dealer_license_url: str | None = None


class DealerListResponse(BaseModel):
    items: list[DealerListItem]
    total: int
    page: int
    pages: int
    per_page: int


class VerifyDealerRequest(BaseModel):
    """No body fields — included for API symmetry / future extension."""


class RejectDealerRequest(BaseModel):
    reason: str = Field(min_length=10, max_length=500)


class AdminStatsResponse(BaseModel):
    total_dealers: int
    pending: int
    verified: int
    rejected: int
    new_this_week: int
    verified_this_week: int
    avg_hours_to_verify: float | None


class AuditLogItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    actor_email: str | None
    action: str
    target_type: str | None
    target_id: uuid.UUID | None
    ip_address: str | None
    extra: dict[str, Any] | None
    created_at: datetime


class AuditLogResponse(BaseModel):
    items: list[AuditLogItem]
    total: int


class ImpersonationResponse(BaseModel):
    impersonation_token: str
    dealer_id: uuid.UUID
    business_name: str
    expires_in_seconds: int
