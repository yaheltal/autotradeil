"""Diagnostic endpoints to verify the auth middleware wiring.

These are NOT intended as production surfaces. They exist so the team
can validate JWT verification, user lookup, and admin gating without
the full signup / dealer flow.
"""

from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.auth import CurrentUser, require_admin, require_verified_dealer
from app.models import Dealer, User

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.get("/whoami")
async def whoami(user: CurrentUser) -> dict[str, object]:
    return {
        "id": str(user.id),
        "email": user.email,
        "user_type": user.user_type,
        "verified": user.verified,
    }


@router.get("/admin-only")
async def admin_only(
    user: Annotated[User, Depends(require_admin)],
) -> dict[str, object]:
    return {"ok": True, "admin_id": str(user.id)}


@router.get("/dealer-only")
async def dealer_only(
    ud: Annotated[tuple[User, Dealer], Depends(require_verified_dealer)],
) -> dict[str, object]:
    _, dealer = ud
    return {
        "ok": True,
        "dealer_id": str(dealer.id),
        "business_name": dealer.business_name,
    }


@router.get("/test/send-email")
async def test_send_email() -> dict[str, object]:
    """Dev-only: send both template emails to the admin address."""
    from app.core.email import send_dealer_rejected, send_dealer_verified

    ok1 = await send_dealer_verified(
        to_email="talyahel4@gmail.com",
        business_name="אוטו טסט בע״מ",
    )
    ok2 = await send_dealer_rejected(
        to_email="talyahel4@gmail.com",
        business_name="אוטו טסט בע״מ",
        reason="רישיון סחר ברכב לא תקף",
    )
    return {"verified_sent": ok1, "rejected_sent": ok2}
