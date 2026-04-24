"""Domain event emission helper.

Usage:
    await emit_event(
        db,
        event_type="dealer.created",
        aggregate_type="dealer",
        aggregate_id=dealer.id,
        payload={"business_name": dealer.business_name},
        actor_user_id=current_user.id,
    )
    await db.commit()

The commit is the caller's responsibility. This function only adds to
the session and flushes, so the returned `Event` has its generated
`id` populated.

Future: after the DB insert, also push to a Redis/Celery queue so
workers can react (notifications, AI summarization, etc.). Keep the
signature unchanged — the side effect is additive.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models import Event

logger = get_logger(__name__)


async def emit_event(
    db: AsyncSession,
    event_type: str,
    aggregate_type: str,
    aggregate_id: uuid.UUID,
    payload: dict[str, Any],
    actor_user_id: uuid.UUID | None = None,
) -> Event:
    event = Event(
        event_type=event_type,
        actor_user_id=actor_user_id,
        aggregate_type=aggregate_type,
        aggregate_id=aggregate_id,
        payload=payload,
    )
    db.add(event)
    await db.flush()
    logger.info(
        "event emitted type=%s aggregate=%s:%s id=%s",
        event_type,
        aggregate_type,
        aggregate_id,
        event.id,
    )
    return event
