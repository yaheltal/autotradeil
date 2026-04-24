"""Dealer-facing endpoints (non-admin)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import CurrentUser
from app.database import get_db
from app.models import Dealer
from app.schemas.dealer import DealerResponse

router = APIRouter(prefix="/api/v1/dealers", tags=["dealers"])


@router.get("/me", response_model=DealerResponse)
async def get_my_dealer_profile(
    user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Dealer:
    """Return the dealer profile for the currently authenticated user.

    Admins have no dealer profile — they get 404.
    """
    result = await db.execute(select(Dealer).where(Dealer.user_id == user.id))
    dealer = result.scalar_one_or_none()
    if dealer is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No dealer profile for this user",
        )
    return dealer
