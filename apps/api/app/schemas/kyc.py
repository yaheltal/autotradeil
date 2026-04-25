"""Phase 6.6 — Smart KYC signup schemas."""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field


class KYCExtractResponse(BaseModel):
    """Response from POST /security/kyc/extract.

    All fields are optional — Claude returns null for anything it can't
    read with confidence. The frontend uses these to pre-fill the signup
    form; the dealer always confirms/edits before submit.
    """

    first_name: str | None = None
    last_name: str | None = None
    id_number: str | None = None
    birth_date: date | None = None
    license_number: str | None = None
    license_until: date | None = None
    city: str | None = None
    confidence: Literal["high", "medium", "low"] = "low"
    warnings: list[str] = Field(default_factory=list)
