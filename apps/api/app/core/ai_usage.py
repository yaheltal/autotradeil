"""AI usage tracking and rate limiting."""
from datetime import datetime, timezone, timedelta
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import Dealer

AI_MONTHLY_LIMIT = 100

async def check_and_increment_ai_usage(dealer: Dealer, db: AsyncSession) -> None:
    now = datetime.now(tz=timezone.utc)

    if dealer.ai_usage_reset_at is None or dealer.ai_usage_reset_at <= now:
        dealer.ai_calls_this_month = 0
        next_month = (now.replace(day=1) + timedelta(days=32)).replace(day=1)
        dealer.ai_usage_reset_at = next_month

    if dealer.ai_calls_this_month >= AI_MONTHLY_LIMIT:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"חרגת ממכסת השימוש החודשית ({AI_MONTHLY_LIMIT} קריאות)",
        )

    dealer.ai_calls_this_month += 1
    await db.flush()
