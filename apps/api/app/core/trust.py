"""Dealer trust score + tier recalculation (Phase 4.2).

Called after any event that changes deal/offer counts:
    - offer created  → +offers_sent for buyer, +offers_received for seller
    - deal confirmed → +deals_completed for both sides
    - deal cancelled → +deals_cancelled

Scoring (rule of thumb, easy to tune later):
    +10 per completed deal
    +2  per offer sent
    +1  per offer received
    -5  per cancelled deal
    +5  per month as member  (capped at 50)

Tier is derived from `deals_completed`:
    platinum ≥ 50
    gold     ≥ 20
    silver   ≥ 5
    bronze   otherwise
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Dealer


def _tier_for(deals_completed: int) -> str:
    if deals_completed >= 50:
        return "platinum"
    if deals_completed >= 20:
        return "gold"
    if deals_completed >= 5:
        return "silver"
    return "bronze"


async def recalculate_trust_score(dealer_id: uuid.UUID, db: AsyncSession) -> None:
    """Recompute `trust_score` + `tier` for a dealer. Caller owns commit."""
    dealer = (
        await db.execute(select(Dealer).where(Dealer.id == dealer_id))
    ).scalar_one_or_none()
    if dealer is None:
        return

    now = datetime.now(tz=timezone.utc)
    member_since = dealer.member_since
    # member_since is TIMESTAMPTZ; guard for naive just in case.
    if member_since.tzinfo is None:
        member_since = member_since.replace(tzinfo=timezone.utc)
    months = max(0, (now - member_since).days // 30)
    longevity_bonus = min(50, months * 5)

    score = (
        dealer.deals_completed * 10
        + dealer.offers_sent * 2
        + dealer.offers_received * 1
        - dealer.deals_cancelled * 5
        + longevity_bonus
    )
    score = max(0, score)

    # `trust_score` is stored as Numeric(5,2) — values ≤ 99.99 are safe.
    # The historic column was 0-100, and our formula can exceed 100
    # for very active dealers; cap to 99.99 until we migrate the type.
    capped = min(score, 9999) / 100 if score >= 100 else score
    # Simpler: just cap at 100.
    capped = min(score, 100)

    from decimal import Decimal

    dealer.trust_score = Decimal(str(capped))
    dealer.tier = _tier_for(dealer.deals_completed)
    await db.flush()
