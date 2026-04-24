"""Dealer signup flow.

Creates a Supabase auth user + public.users row (via on_auth_user_created
trigger) + dealers row. All three must succeed; on any DB-side failure we
delete the auth user so we never leak orphaned identities.

Rate limited to 5 requests/hour per IP — see `app/core/rate_limit.py`.
"""

from __future__ import annotations

import asyncio
import uuid as uuid_pkg
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.events import emit_event
from app.core.logging import get_logger
from app.core.rate_limit import rate_limit
from app.database import get_db
from app.models import Dealer, User
from app.schemas.dealer import DealerSignupRequest, SignupResponse

logger = get_logger(__name__)

router = APIRouter(prefix="/api/v1/auth", tags=["signup"])

signup_rate_limit = rate_limit("5/hour", scope="signup_dealer")


async def _create_supabase_auth_user(email: str, password: str) -> str:
    """Call Supabase Admin API (service_role) to create an auth user.

    Returns the new user's UUID. The `on_auth_user_created` DB trigger
    mirrors the row into public.users with user_type='dealer', verified=false.
    """
    url = f"{settings.supabase_url}/auth/v1/admin/users"
    headers = {
        "apikey": settings.supabase_secret_key,
        "Authorization": f"Bearer {settings.supabase_secret_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "email": email,
        "password": password,
        "email_confirm": True,  # auto-confirm, skip email verification step for now
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(url, headers=headers, json=payload)

    if resp.status_code in (400, 422):
        try:
            msg = (resp.json().get("msg") or resp.json().get("message") or "").lower()
        except (ValueError, AttributeError):
            msg = ""
        if any(word in msg for word in ("already", "exists", "registered")):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email already registered",
            )
        raise HTTPException(status_code=400, detail=f"Signup failed: {resp.text}")

    if resp.status_code not in (200, 201):
        logger.error(
            "Supabase admin createUser failed: %s %s", resp.status_code, resp.text
        )
        raise HTTPException(status_code=502, detail="Auth service error")

    return resp.json()["id"]


async def _delete_supabase_auth_user(user_id: str) -> None:
    """Rollback: delete auth user if our subsequent DB writes failed."""
    url = f"{settings.supabase_url}/auth/v1/admin/users/{user_id}"
    headers = {
        "apikey": settings.supabase_secret_key,
        "Authorization": f"Bearer {settings.supabase_secret_key}",
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.delete(url, headers=headers)
    except Exception as exc:  # noqa: BLE001
        logger.error("Failed to rollback auth user %s: %s", user_id, exc)


@router.post(
    "/signup/dealer",
    response_model=SignupResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(signup_rate_limit)],
)
async def signup_dealer(
    payload: DealerSignupRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SignupResponse:
    """Create a pending dealer account. Returns 201 on success."""
    auth_user_id = await _create_supabase_auth_user(payload.email, payload.password)

    try:
        user_uuid = uuid_pkg.UUID(auth_user_id)

        # Wait for the trigger to populate public.users.
        user: User | None = None
        for _ in range(5):
            await asyncio.sleep(0.2)
            result = await db.execute(select(User).where(User.id == user_uuid))
            user = result.scalar_one_or_none()
            if user is not None:
                break
        if user is None:
            raise HTTPException(
                status_code=500,
                detail="User sync trigger did not complete in time",
            )

        dealer = Dealer(
            user_id=user_uuid,
            business_name=payload.business_name,
            business_id=payload.business_id,
            license_number=payload.license_number,
            phone=payload.phone,
            city=payload.city,
            lot_size=payload.lot_size,
            contact_name=payload.contact_name,
            verified=False,
        )
        db.add(dealer)
        await db.flush()

        await emit_event(
            db,
            event_type="dealer.registered",
            aggregate_type="dealer",
            aggregate_id=dealer.id,
            payload={
                "business_name": dealer.business_name,
                "city": dealer.city,
                "email": payload.email,
            },
            actor_user_id=user_uuid,
        )

        await db.commit()

        return SignupResponse(
            message="Registration received. You will be notified when approved.",
            dealer_id=dealer.id,
            user_id=user_uuid,
            status="pending_verification",
        )

    except HTTPException:
        await db.rollback()
        await _delete_supabase_auth_user(auth_user_id)
        raise
    except Exception as exc:
        await db.rollback()
        await _delete_supabase_auth_user(auth_user_id)
        logger.error("Dealer signup failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Registration failed, please retry")
