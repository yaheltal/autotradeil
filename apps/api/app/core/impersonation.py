"""Short-lived admin-as-dealer impersonation tokens.

An admin exchanges their Supabase JWT for an impersonation token scoped
to a specific dealer. The impersonation token is HS256-signed with
`settings.impersonation_secret` (separate from Supabase's JWT secret so
a leak of one doesn't compromise the other) and carries:

    sub     : admin user UUID (the actor)
    act_as  : dealer UUID being impersonated
    iat     : issued at
    exp     : expiration (1 hour after iat)
    type    : "impersonation"

Clients include it as a Bearer token in place of the admin's own token.
Backend endpoints that accept impersonation MUST:
    1. Decode with `decode_impersonation_token` to retrieve admin_id + dealer_id
    2. Write an audit_log row describing the action taken under impersonation

Never accept an impersonation token on the `/api/v1/admin/*` surface — those
require a real admin JWT.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import jwt as pyjwt
from fastapi import HTTPException, status

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

IMPERSONATION_TTL_SECONDS = 3600  # 1 hour
IMPERSONATION_ALGORITHM = "HS256"
IMPERSONATION_TOKEN_TYPE = "impersonation"


class ImpersonationError(HTTPException):
    def __init__(self, detail: str, status_code: int = status.HTTP_401_UNAUTHORIZED):
        super().__init__(
            status_code=status_code,
            detail=detail,
            headers={"WWW-Authenticate": "Bearer"},
        )


def _require_secret() -> str:
    if not settings.impersonation_secret:
        raise ImpersonationError(
            "Server not configured: IMPERSONATION_SECRET is missing",
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
    return settings.impersonation_secret


def create_impersonation_token(
    admin_id: uuid.UUID,
    dealer_id: uuid.UUID,
) -> str:
    """Issue a 1-hour HS256 token letting the admin act as the given dealer."""
    secret = _require_secret()
    now = datetime.now(timezone.utc)
    payload: dict[str, object] = {
        "sub": str(admin_id),
        "act_as": str(dealer_id),
        "type": IMPERSONATION_TOKEN_TYPE,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=IMPERSONATION_TTL_SECONDS)).timestamp()),
    }
    return pyjwt.encode(payload, secret, algorithm=IMPERSONATION_ALGORITHM)


def decode_impersonation_token(token: str) -> dict:
    """Validate an impersonation token. Returns the decoded payload.

    Raises ImpersonationError(401) on: missing/invalid signature,
    expiration, wrong type claim, or malformed sub/act_as.
    """
    secret = _require_secret()
    try:
        payload = pyjwt.decode(
            token,
            secret,
            algorithms=[IMPERSONATION_ALGORITHM],
            options={"require": ["exp", "sub", "iat"]},
        )
    except pyjwt.ExpiredSignatureError:
        raise ImpersonationError("Impersonation token has expired")
    except pyjwt.InvalidTokenError as exc:
        logger.info("impersonation token rejected: %s", exc)
        raise ImpersonationError("Invalid impersonation token")

    if payload.get("type") != IMPERSONATION_TOKEN_TYPE:
        raise ImpersonationError("Not an impersonation token")

    # Defence-in-depth: make sure sub / act_as are actual UUIDs so callers
    # don't hand dirty strings downstream.
    try:
        uuid.UUID(str(payload.get("sub")))
        uuid.UUID(str(payload.get("act_as")))
    except (TypeError, ValueError):
        raise ImpersonationError("Malformed impersonation token claims")

    return payload
