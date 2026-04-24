"""Inventory view tracking (Phase 4.3).

One row per marketplace vehicle-detail view. `viewer_dealer_id` is NULL
for anonymous / B2C views. `source` is one of:
    - 'marketplace' : B2B dealer browsing
    - 'b2c'         : future public B2C site
    - 'direct'      : followed a shared link / notification
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models._mixins import UUIDPrimaryKey
from app.models.base import Base


class InventoryView(UUIDPrimaryKey, Base):
    __tablename__ = "inventory_views"

    inventory_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("inventory.id", ondelete="CASCADE"),
        nullable=False,
    )
    viewer_dealer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("dealers.id", ondelete="SET NULL"),
        nullable=True,
    )
    viewed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    source: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="marketplace",
        server_default="marketplace",
    )

    __table_args__ = (
        CheckConstraint(
            "source IN ('marketplace', 'b2c', 'direct')",
            name="inventory_views_source_check",
        ),
        Index("idx_inventory_views_inventory", "inventory_id"),
        Index("idx_inventory_views_dealer", "viewer_dealer_id"),
        Index("idx_inventory_views_viewed_at", text("viewed_at DESC")),
    )
