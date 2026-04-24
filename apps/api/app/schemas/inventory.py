from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


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
    notes: str | None = Field(default=None, max_length=2000)


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
    notes: str | None = Field(default=None, max_length=2000)
    status: str | None = Field(default=None, pattern="^(active|sold|hidden)$")


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
    notes: str | None
    status: str
    created_at: datetime
    updated_at: datetime


class InventoryListResponse(BaseModel):
    items: list[InventoryItemResponse]
    total: int
    page: int
    pages: int
    per_page: int
