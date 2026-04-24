from __future__ import annotations

import uuid
from datetime import datetime
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
