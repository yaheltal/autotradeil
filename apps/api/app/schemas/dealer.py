from __future__ import annotations

import re
import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class DealerSignupRequest(BaseModel):
    email: EmailStr
    # bcrypt caps at 72 bytes — Supabase enforces this too.
    password: str = Field(min_length=8, max_length=72)
    business_name: str = Field(min_length=2, max_length=120)
    # Israeli ח.פ / ע.מ — exactly 9 digits.
    business_id: str = Field(min_length=9, max_length=9)
    license_number: str = Field(min_length=3, max_length=50)
    phone: str = Field(min_length=9, max_length=15)
    city: str = Field(min_length=2, max_length=80)
    lot_size: int = Field(ge=1, le=1000)
    contact_name: str = Field(min_length=2, max_length=120)

    @field_validator("business_id")
    @classmethod
    def validate_business_id(cls, v: str) -> str:
        if not v.isdigit():
            raise ValueError("business_id must be 9 digits")
        return v

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        # Israeli mobile: 0 5X-XXXXXXX (10 digits) or +972-5X-XXXXXXX.
        cleaned = re.sub(r"[\s\-\(\)]", "", v)
        if not re.match(r"^(\+972|0)5\d{8}$", cleaned):
            raise ValueError("phone must be a valid Israeli mobile")
        return cleaned


class DealerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    business_name: str
    business_id: str
    license_number: str
    phone: str
    city: str
    lot_size: int
    contact_name: str
    verified: bool
    verified_at: datetime | None
    rejection_reason: str | None
    rejected_at: datetime | None
    tier: str
    # trust_score is NUMERIC(5,2) in the DB; expose as Decimal so we don't
    # lose the fractional part on responses.
    trust_score: Decimal
    created_at: datetime


class SignupResponse(BaseModel):
    message: str
    dealer_id: uuid.UUID
    user_id: uuid.UUID
    status: str  # "pending_verification"
