"""Dealer-facing endpoints (non-admin)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import CurrentUser, require_verified_dealer
from app.core.cloudinary_client import upload_dealer_logo
from app.core.events import emit_event
from app.database import get_db
from app.models import Dealer, User
from app.schemas.dealer import DealerProfileUpdate, DealerResponse

router = APIRouter(prefix="/api/v1/dealers", tags=["dealers"])

LOGO_MAX_BYTES = 5 * 1024 * 1024  # 5 MB
LOGO_ALLOWED_MIME = frozenset({"image/jpeg", "image/jpg", "image/png", "image/webp"})


@router.get("/me", response_model=DealerResponse)
async def get_my_dealer_profile(
    user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Dealer:
    """Return the dealer profile for the currently authenticated user."""
    result = await db.execute(select(Dealer).where(Dealer.user_id == user.id))
    dealer = result.scalar_one_or_none()
    if dealer is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No dealer profile for this user",
        )
    return dealer


@router.patch("/me", response_model=DealerResponse)
async def update_my_dealer_profile(
    payload: DealerProfileUpdate,
    ud: Annotated[tuple[User, Dealer], Depends(require_verified_dealer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Dealer:
    """Free update of dealer-editable fields (Phase 4.4).

    `business_name`, `city`, `phone`, `description`, and 3 notification
    preferences are dealer-owned. business_id, license_number, contact_name
    require an admin operation and are NOT changeable here.
    """
    user, dealer = ud
    data = payload.model_dump(exclude_unset=True)
    changed: dict[str, object] = {}
    for k, v in data.items():
        if getattr(dealer, k, None) != v:
            changed[k] = v
            setattr(dealer, k, v)

    if changed:
        await emit_event(
            db,
            event_type="dealer.profile.updated",
            aggregate_type="dealer",
            aggregate_id=dealer.id,
            payload={"changes": list(changed.keys())},
            actor_user_id=user.id,
        )

    await db.commit()
    await db.refresh(dealer)
    return dealer


@router.post("/me/logo", response_model=DealerResponse)
async def upload_my_logo(
    ud: Annotated[tuple[User, Dealer], Depends(require_verified_dealer)],
    db: Annotated[AsyncSession, Depends(get_db)],
    file: UploadFile = File(...),
) -> Dealer:
    """Upload (or replace) the dealer's business logo. Cloudinary, public URL."""
    user, dealer = ud
    if file.content_type not in LOGO_ALLOWED_MIME:
        raise HTTPException(
            status_code=400, detail="סוג קובץ לא נתמך (JPEG/PNG/WebP בלבד)"
        )
    contents = await file.read()
    if len(contents) > LOGO_MAX_BYTES:
        raise HTTPException(status_code=400, detail="הקובץ גדול מדי (מקסימום 5MB)")

    result = await upload_dealer_logo(
        file_bytes=contents,
        dealer_id=str(dealer.id),
        content_type=file.content_type,
    )
    dealer.logo_url = result["url"]

    await emit_event(
        db,
        event_type="dealer.logo.uploaded",
        aggregate_type="dealer",
        aggregate_id=dealer.id,
        payload={},
        actor_user_id=user.id,
    )
    await db.commit()
    await db.refresh(dealer)
    return dealer
