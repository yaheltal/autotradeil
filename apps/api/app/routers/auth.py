"""OAuth callback / status endpoints.

After a user completes Supabase OAuth (Google, Apple, etc.), Supabase
issues a normal access_token. The frontend then calls this endpoint to
discover whether the now-authenticated user is already a registered
dealer or whether they need to complete the signup form.

Why a dedicated endpoint instead of `/whoami` + `/dealers/me`?
  * `/whoami` 404s when the public.users row hasn't been created yet
    (the on_auth_user_created trigger runs in DB after the auth row,
    so there is a small race window on first OAuth sign-in).
  * `/dealers/me` requires `require_verified_dealer`, which 403s for
    pending dealers — masking the new-user case.

This endpoint is permissive: it accepts any valid Supabase JWT and
returns a clean classification:
  - `existing_user: true`  → caller is a registered dealer (verified or
                              pending). Frontend routes to /dashboard
                              or /signup/dealer/pending.
  - `existing_user: false` → caller has no dealer row. Frontend routes
                              to /signup/dealer?oauth=true and pre-fills
                              the form from the returned profile fields.

The Google profile fields (full_name, avatar_url) come from the JWT's
user_metadata claim that Supabase populates automatically on OAuth.
"""

from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import _decode_supabase_jwt, _extract_bearer
from app.core.logging import get_logger
from app.database import get_db
from app.models import Dealer, User

logger = get_logger(__name__)

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


class OAuthCheckResponse(BaseModel):
    existing_user: bool
    # Populated only when existing_user=True
    dealer_id: str | None = None
    business_name: str | None = None
    verified: bool | None = None
    rejected_at: str | None = None
    # Populated only when existing_user=False — pre-fill data for /signup/dealer
    email: str | None = None
    full_name: str | None = None
    avatar_url: str | None = None


@router.post("/oauth/check", response_model=OAuthCheckResponse)
async def oauth_check(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OAuthCheckResponse:
    """Classify the current Supabase-authenticated caller as existing
    dealer or new OAuth user. Used by the /auth/callback page."""
    token = _extract_bearer(request)
    payload = _decode_supabase_jwt(token)

    sub = payload.get("sub")
    try:
        user_id = uuid.UUID(str(sub))
    except (TypeError, ValueError):
        # Malformed token — let the frontend redirect to /login with an error
        return OAuthCheckResponse(existing_user=False)

    # Look for a dealer profile owned by this auth user.
    dealer = (
        await db.execute(select(Dealer).where(Dealer.user_id == user_id))
    ).scalar_one_or_none()

    if dealer is not None:
        return OAuthCheckResponse(
            existing_user=True,
            dealer_id=str(dealer.id),
            business_name=dealer.business_name,
            verified=dealer.verified,
            rejected_at=dealer.rejected_at.isoformat() if dealer.rejected_at else None,
        )

    # New user — pull the OAuth profile fields out of the token's
    # user_metadata claim. Supabase populates this from Google's
    # /userinfo response on first sign-in.
    metadata = payload.get("user_metadata") or {}
    email = payload.get("email") or metadata.get("email")
    full_name = (
        metadata.get("full_name")
        or metadata.get("name")
        or " ".join(filter(None, [metadata.get("given_name"), metadata.get("family_name")])).strip()
        or None
    )
    avatar_url = metadata.get("avatar_url") or metadata.get("picture")

    # Best-effort: confirm the public.users row exists (the trigger
    # should have run by now). Don't 404 if missing — the user just
    # needs to finish signup.
    user = await db.get(User, user_id)
    if user is None:
        logger.info("oauth_check: user row missing for sub=%s — trigger lag", user_id)

    return OAuthCheckResponse(
        existing_user=False,
        email=email,
        full_name=full_name,
        avatar_url=avatar_url,
    )
