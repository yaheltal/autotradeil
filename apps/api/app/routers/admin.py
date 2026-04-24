"""Admin-only endpoints for dealer management."""

from __future__ import annotations

import math
import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import log_admin_action
from app.core.auth import require_admin
from app.core.email import send_dealer_rejected, send_dealer_verified
from app.core.events import emit_event
from app.core.impersonation import (
    IMPERSONATION_TTL_SECONDS,
    create_impersonation_token,
    decode_impersonation_token,
)
from app.core.logging import get_logger
from app.database import get_db
from app.models import AuditLog, Dealer, User
from app.schemas.admin import (
    AdminStatsResponse,
    AuditLogItem,
    AuditLogResponse,
    DealerListItem,
    DealerListResponse,
    ImpersonationResponse,
    RejectDealerRequest,
)

logger = get_logger(__name__)
router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


async def _get_dealer_or_404(
    dealer_id: uuid.UUID,
    db: AsyncSession,
) -> tuple[Dealer, User]:
    result = await db.execute(
        select(Dealer, User)
        .join(User, User.id == Dealer.user_id)
        .where(Dealer.id == dealer_id)
    )
    row = result.first()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Dealer not found"
        )
    return row.Dealer, row.User


def _to_list_item(dealer: Dealer, user: User) -> DealerListItem:
    return DealerListItem(
        id=dealer.id,
        user_id=dealer.user_id,
        email=user.email,
        business_name=dealer.business_name,
        business_id=dealer.business_id,
        contact_name=dealer.contact_name,
        city=dealer.city,
        phone=dealer.phone,
        lot_size=dealer.lot_size,
        verified=dealer.verified,
        rejection_reason=dealer.rejection_reason,
        tier=dealer.tier,
        trust_score=int(dealer.trust_score),
        created_at=dealer.created_at,
        verified_at=dealer.verified_at,
        rejected_at=dealer.rejected_at,
    )


@router.get("/dealers", response_model=DealerListResponse)
async def list_dealers(
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
    status_filter: str | None = Query(None, alias="status"),
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
) -> DealerListResponse:
    """List dealers with optional status filter + business/email/contact search."""
    base_q = select(Dealer, User).join(User, User.id == Dealer.user_id)
    count_q = (
        select(func.count())
        .select_from(Dealer)
        .join(User, User.id == Dealer.user_id)
    )

    if status_filter == "pending":
        base_q = base_q.where(Dealer.verified.is_(False), Dealer.rejected_at.is_(None))
        count_q = count_q.where(Dealer.verified.is_(False), Dealer.rejected_at.is_(None))
    elif status_filter == "verified":
        base_q = base_q.where(Dealer.verified.is_(True))
        count_q = count_q.where(Dealer.verified.is_(True))
    elif status_filter == "rejected":
        base_q = base_q.where(Dealer.rejected_at.is_not(None))
        count_q = count_q.where(Dealer.rejected_at.is_not(None))

    if search:
        like = f"%{search}%"
        cond = or_(
            Dealer.business_name.ilike(like),
            User.email.ilike(like),
            Dealer.contact_name.ilike(like),
        )
        base_q = base_q.where(cond)
        count_q = count_q.where(cond)

    total = (await db.execute(count_q)).scalar_one()

    base_q = (
        base_q.order_by(Dealer.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    rows = (await db.execute(base_q)).all()

    items = [_to_list_item(row.Dealer, row.User) for row in rows]
    pages = math.ceil(total / per_page) if total > 0 else 1

    return DealerListResponse(
        items=items, total=total, page=page, pages=pages, per_page=per_page
    )


@router.get("/dealers/{dealer_id}", response_model=DealerListItem)
async def get_dealer(
    dealer_id: uuid.UUID,
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> DealerListItem:
    dealer, user = await _get_dealer_or_404(dealer_id, db)
    return _to_list_item(dealer, user)


@router.post("/dealers/{dealer_id}/verify")
async def verify_dealer(
    dealer_id: uuid.UUID,
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, object]:
    dealer, user = await _get_dealer_or_404(dealer_id, db)

    if dealer.verified:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Dealer already verified"
        )
    if dealer.rejected_at is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot verify a rejected dealer — clear rejection first",
        )

    now = datetime.now(timezone.utc)
    dealer.verified = True
    dealer.verified_at = now
    dealer.verified_by = admin.id

    await log_admin_action(
        db,
        actor_user_id=admin.id,
        action="dealer.verify",
        target_type="dealer",
        target_id=dealer.id,
        metadata={"business_name": dealer.business_name, "email": user.email},
    )
    await emit_event(
        db,
        event_type="dealer.verified",
        aggregate_type="dealer",
        aggregate_id=dealer.id,
        payload={
            "business_name": dealer.business_name,
            "verified_by": str(admin.id),
        },
        actor_user_id=admin.id,
    )

    await db.commit()

    email_ok = await send_dealer_verified(
        to_email=user.email,
        business_name=dealer.business_name,
    )
    logger.info("dealer.verify dealer_id=%s email_sent=%s", dealer_id, email_ok)

    return {"ok": True, "dealer_id": str(dealer_id), "email_sent": email_ok}


@router.post("/dealers/{dealer_id}/reject")
async def reject_dealer(
    dealer_id: uuid.UUID,
    body: RejectDealerRequest,
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, object]:
    dealer, user = await _get_dealer_or_404(dealer_id, db)

    if dealer.rejected_at is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Dealer already rejected"
        )

    now = datetime.now(timezone.utc)
    dealer.verified = False
    dealer.verified_at = None
    dealer.verified_by = None
    dealer.rejection_reason = body.reason
    dealer.rejected_at = now
    dealer.rejected_by = admin.id

    await log_admin_action(
        db,
        actor_user_id=admin.id,
        action="dealer.reject",
        target_type="dealer",
        target_id=dealer.id,
        metadata={"reason": body.reason, "email": user.email},
    )
    await emit_event(
        db,
        event_type="dealer.rejected",
        aggregate_type="dealer",
        aggregate_id=dealer.id,
        payload={"reason": body.reason, "rejected_by": str(admin.id)},
        actor_user_id=admin.id,
    )

    await db.commit()

    email_ok = await send_dealer_rejected(
        to_email=user.email,
        business_name=dealer.business_name,
        reason=body.reason,
    )
    logger.info("dealer.reject dealer_id=%s email_sent=%s", dealer_id, email_ok)

    return {"ok": True, "dealer_id": str(dealer_id), "email_sent": email_ok}


@router.get("/stats", response_model=AdminStatsResponse)
async def get_stats(
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AdminStatsResponse:
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)

    async def _count(where_clauses) -> int:
        q = select(func.count()).select_from(Dealer)
        for c in where_clauses:
            q = q.where(c)
        return (await db.execute(q)).scalar_one()

    total = await _count([])
    pending = await _count([Dealer.verified.is_(False), Dealer.rejected_at.is_(None)])
    verified = await _count([Dealer.verified.is_(True)])
    rejected = await _count([Dealer.rejected_at.is_not(None)])
    new_this_week = await _count([Dealer.created_at >= week_ago])
    verified_this_week = await _count(
        [Dealer.verified.is_(True), Dealer.verified_at >= week_ago]
    )

    avg_result = await db.execute(
        select(
            func.avg(
                (
                    func.extract("epoch", Dealer.verified_at)
                    - func.extract("epoch", Dealer.created_at)
                )
                / 3600.0
            )
        )
        .select_from(Dealer)
        .where(Dealer.verified.is_(True))
    )
    avg_hours = avg_result.scalar()

    return AdminStatsResponse(
        total_dealers=total,
        pending=pending,
        verified=verified,
        rejected=rejected,
        new_this_week=new_this_week,
        verified_this_week=verified_this_week,
        avg_hours_to_verify=float(avg_hours) if avg_hours is not None else None,
    )


@router.post("/impersonate/end")
async def impersonate_end(
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, bool]:
    """Record the end of an impersonation session. Token expiry is client-side.

    NOTE: Must be registered BEFORE `/impersonate/{dealer_id}` — otherwise
    FastAPI routes POST /impersonate/end to the UUID param handler and
    returns 422 on the literal string "end".
    """
    await log_admin_action(
        db,
        actor_user_id=admin.id,
        action="dealer.impersonate.end",
    )
    await db.commit()
    return {"ok": True}


@router.get("/impersonate/verify")
async def impersonate_verify(
    admin: Annotated[User, Depends(require_admin)],
    token: str = Query(..., min_length=1),
) -> dict[str, object]:
    """Decode + validate an impersonation token. Admin-only."""
    payload = decode_impersonation_token(token)
    return {
        "valid": True,
        "admin_id": payload["sub"],
        "dealer_id": payload["act_as"],
        "expires_at": payload["exp"],
    }


@router.post(
    "/impersonate/{dealer_id}",
    response_model=ImpersonationResponse,
)
async def impersonate_dealer(
    dealer_id: uuid.UUID,
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ImpersonationResponse:
    """Issue a 1-hour impersonation token so the admin can act as the dealer."""
    dealer, _user = await _get_dealer_or_404(dealer_id, db)

    if not dealer.verified:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot impersonate an unverified dealer",
        )

    token = create_impersonation_token(admin.id, dealer.id)

    await log_admin_action(
        db,
        actor_user_id=admin.id,
        action="dealer.impersonate.start",
        target_type="dealer",
        target_id=dealer.id,
        impersonated_dealer_id=dealer.id,
        metadata={"business_name": dealer.business_name},
    )
    await emit_event(
        db,
        event_type="admin.impersonation.started",
        aggregate_type="dealer",
        aggregate_id=dealer.id,
        payload={"admin_id": str(admin.id), "business_name": dealer.business_name},
        actor_user_id=admin.id,
    )

    await db.commit()

    return ImpersonationResponse(
        impersonation_token=token,
        dealer_id=dealer.id,
        business_name=dealer.business_name,
        expires_in_seconds=IMPERSONATION_TTL_SECONDS,
    )


@router.get("/audit-log", response_model=AuditLogResponse)
async def get_audit_log(
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
) -> AuditLogResponse:
    total = (await db.execute(select(func.count()).select_from(AuditLog))).scalar_one()

    result = await db.execute(
        select(AuditLog, User)
        .outerjoin(User, User.id == AuditLog.actor_user_id)
        .order_by(AuditLog.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    rows = result.all()

    items = [
        AuditLogItem(
            id=row.AuditLog.id,
            actor_email=row.User.email if row.User else None,
            action=row.AuditLog.action,
            target_type=row.AuditLog.target_type,
            target_id=row.AuditLog.target_id,
            ip_address=str(row.AuditLog.ip_address) if row.AuditLog.ip_address else None,
            extra=row.AuditLog.extra,
            created_at=row.AuditLog.created_at,
        )
        for row in rows
    ]

    return AuditLogResponse(items=items, total=total)
