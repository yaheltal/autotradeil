"""Admin action audit log helper.

Usage:
    await log_admin_action(
        db,
        actor_user_id=admin.id,
        action="dealer.verify",
        target_type="dealer",
        target_id=dealer.id,
        metadata={"reason": "manual review"},
        request=request,  # optional — populates ip_address / user_agent
    )
    await db.commit()

Caller commits. This helper only adds + flushes.

Resolution order for `ip_address` / `user_agent`:
    1. explicit kwargs (`ip_address=`, `user_agent=`) if provided
    2. `metadata` dict keys `"ip"` / `"user_agent"` (backwards compat
       with the earlier helper that folded them into `extra`)
    3. `request.client.host` / `request.headers["User-Agent"]` if
       `request` is provided

Any `"ip"` / `"user_agent"` keys consumed from `metadata` are removed
before writing to the `extra` JSONB column to avoid duplication.

The DB column holding the `metadata` dict is named `extra` (SQLAlchemy
reserves `metadata` on DeclarativeBase). The kwarg name is `metadata`
for DX.
"""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models import AuditLog

logger = get_logger(__name__)


async def log_admin_action(
    db: AsyncSession,
    actor_user_id: uuid.UUID,
    action: str,
    target_type: str | None = None,
    target_id: uuid.UUID | None = None,
    impersonated_dealer_id: uuid.UUID | None = None,
    metadata: dict[str, Any] | None = None,
    request: Request | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> AuditLog:
    extra: dict[str, Any] = dict(metadata or {})

    # Back-compat: pull ip/user_agent out of extra if that's where the
    # caller put them, so they land in their typed columns instead.
    if ip_address is None:
        ip_address = extra.pop("ip", None) or extra.pop("ip_address", None)
    else:
        extra.pop("ip", None)
        extra.pop("ip_address", None)

    if user_agent is None:
        user_agent = extra.pop("user_agent", None)
    else:
        extra.pop("user_agent", None)

    # Last-resort: derive from the request object.
    if request is not None:
        if ip_address is None and request.client is not None:
            ip_address = request.client.host
        if user_agent is None:
            user_agent = request.headers.get("User-Agent")

    entry = AuditLog(
        actor_user_id=actor_user_id,
        impersonated_dealer_id=impersonated_dealer_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        ip_address=ip_address,
        user_agent=user_agent,
        extra=extra or None,
    )
    db.add(entry)
    await db.flush()
    logger.info(
        "admin action actor=%s action=%s target=%s:%s id=%s",
        actor_user_id,
        action,
        target_type,
        target_id,
        entry.id,
    )
    return entry
