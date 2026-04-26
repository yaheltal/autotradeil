import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models._mixins import UUIDPrimaryKey
from app.models.base import Base


class PushSubscription(UUIDPrimaryKey, Base):
    """Web Push subscription for a user device.

    Stores the browser-issued PushSubscription JSON so a backend job
    can deliver native browser pushes via the standard Web Push
    protocol. One row per (user, endpoint) — the same user can have
    multiple devices subscribed simultaneously.
    """

    __tablename__ = "push_subscriptions"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    # Browser endpoint URL (FCM / WNS / Mozilla autopush). Unique per
    # user — if the same browser re-subscribes we update in place.
    endpoint: Mapped[str] = mapped_column(Text, nullable=False)
    p256dh: Mapped[str] = mapped_column(Text, nullable=False)
    auth: Mapped[str] = mapped_column(Text, nullable=False)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        UniqueConstraint("user_id", "endpoint", name="uq_push_user_endpoint"),
        Index("idx_push_user_id", "user_id"),
    )
