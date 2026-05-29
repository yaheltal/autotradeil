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
from app.models import AuditLog, Dealer, Inventory, SystemSettings, User
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


def _to_list_item(
    dealer: Dealer,
    user: User,
    *,
    include_personal: bool = False,
    kyc_signed_urls: dict[str, str | None] | None = None,
) -> DealerListItem:
    """Map a (Dealer, User) row to the admin list/detail DTO.

    `include_personal=True` adds first/last name, id_number, birth_date,
    license_number, license_until. Admin-only by definition (this fn is
    only called from /api/v1/admin/* routes), but keeping the flag makes
    intent explicit and lets the list endpoint omit personal data to keep
    table responses small.

    `kyc_signed_urls` should be the dict returned by `_kyc_urls_for(...)`
    when the caller wants signed photo URLs in the response.
    """
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
        deals_completed=dealer.deals_completed or 0,
        kyc_status=dealer.kyc_status,
        kyc_rejected_reason=dealer.kyc_rejected_reason,
        member_since=dealer.member_since,
        suspended_at=dealer.suspended_at,
        first_name=user.first_name if include_personal else None,
        last_name=user.last_name if include_personal else None,
        id_number=user.id_number if include_personal else None,
        birth_date=user.birth_date if include_personal else None,
        license_number=dealer.license_number if include_personal else None,
        license_until=dealer.license_until if include_personal else None,
        id_card_front_url=(
            kyc_signed_urls.get("id_front") if kyc_signed_urls else None
        ),
        id_card_back_url=(
            kyc_signed_urls.get("id_back") if kyc_signed_urls else None
        ),
        dealer_license_url=(
            kyc_signed_urls.get("dealer_license") if kyc_signed_urls else None
        ),
    )


async def _kyc_urls_for(dealer: Dealer) -> dict[str, str | None]:
    """Mint fresh signed URLs for a dealer's three KYC documents."""
    from app.routers.security import _signed_kyc_url

    return {
        "id_front": await _signed_kyc_url(dealer.id_card_front_url, dealer.id, "id_front"),
        "id_back": await _signed_kyc_url(dealer.id_card_back_url, dealer.id, "id_back"),
        "dealer_license": await _signed_kyc_url(
            dealer.dealer_license_url, dealer.id, "dealer_license"
        ),
    }


@router.get("/dealers", response_model=DealerListResponse)
async def list_dealers(
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
    status_filter: str | None = Query(None, alias="status"),
    search: str | None = Query(None),
    tier: str | None = Query(None, pattern="^(bronze|silver|gold|platinum)$"),
    kyc_status: str | None = Query(
        None, pattern="^(pending|submitted|approved|rejected)$"
    ),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
) -> DealerListResponse:
    """List dealers with optional status / tier / KYC filters + search."""
    base_q = select(Dealer, User).join(User, User.id == Dealer.user_id)
    count_q = (
        select(func.count())
        .select_from(Dealer)
        .join(User, User.id == Dealer.user_id)
    )

    # Phase 6.7 — by default exclude archived dealers from the main list.
    # The /admin/dealers/archived endpoint surfaces them separately.
    base_q = base_q.where(Dealer.archived_at.is_(None))
    count_q = count_q.where(Dealer.archived_at.is_(None))

    if status_filter == "pending":
        base_q = base_q.where(Dealer.verified.is_(False), Dealer.rejected_at.is_(None))
        count_q = count_q.where(Dealer.verified.is_(False), Dealer.rejected_at.is_(None))
    elif status_filter == "verified":
        base_q = base_q.where(Dealer.verified.is_(True))
        count_q = count_q.where(Dealer.verified.is_(True))
    elif status_filter == "rejected":
        base_q = base_q.where(Dealer.rejected_at.is_not(None))
        count_q = count_q.where(Dealer.rejected_at.is_not(None))

    if tier:
        base_q = base_q.where(Dealer.tier == tier)
        count_q = count_q.where(Dealer.tier == tier)

    if kyc_status:
        base_q = base_q.where(Dealer.kyc_status == kyc_status)
        count_q = count_q.where(Dealer.kyc_status == kyc_status)

    if search:
        like = f"%{search}%"
        cond = or_(
            Dealer.business_name.ilike(like),
            User.email.ilike(like),
            Dealer.contact_name.ilike(like),
            Dealer.city.ilike(like),
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


@router.get("/dealers/archived", response_model=DealerListResponse)
async def list_archived_dealers(
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
) -> DealerListResponse:
    """List dealers that have been archived (soft-deleted). Phase 6.7."""
    count_q = (
        select(func.count())
        .select_from(Dealer)
        .join(User, User.id == Dealer.user_id)
        .where(Dealer.archived_at.is_not(None))
    )
    total = (await db.execute(count_q)).scalar_one()

    base_q = (
        select(Dealer, User)
        .join(User, User.id == Dealer.user_id)
        .where(Dealer.archived_at.is_not(None))
        .order_by(Dealer.archived_at.desc())
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
    kyc_urls = await _kyc_urls_for(dealer)
    return _to_list_item(
        dealer, user, include_personal=True, kyc_signed_urls=kyc_urls
    )


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

    # Phase 6.8.5 — also notify by SMS so the dealer doesn't have to
    # check email. Best-effort; email is the authoritative channel.
    sms_ok = False
    if dealer.phone:
        from app.core.sms import send_sms

        login_url = "https://autotradeil.com/login"
        sms_msg = (
            f"AutoTradeIL: שלום {dealer.business_name}, חשבון הסוחר שלך אושר! "
            f"להתחברות: {login_url}"
        )
        try:
            sms_ok = await send_sms(to_phone=dealer.phone, message=sms_msg)
        except Exception as exc:  # noqa: BLE001
            logger.warning("dealer verify sms failed: %s", exc)

    logger.info(
        "dealer.verify dealer_id=%s email_sent=%s sms_sent=%s",
        dealer_id,
        email_ok,
        sms_ok,
    )

    return {
        "ok": True,
        "dealer_id": str(dealer_id),
        "email_sent": email_ok,
        "sms_sent": sms_ok,
    }


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


# ==========================================================================
# Wave 2 — admin deletion-request inbox
#
# Dealers open requests via /api/v1/inventory/{id}/request-deletion, which
# sets status='pending_deletion'. From the admin side we:
#   GET  /inventory/pending-deletion         — FIFO list of open requests
#   POST /inventory/{id}/approve-deletion    — hard delete + Cloudinary cleanup
#   POST /inventory/{id}/reject-deletion     — revert to previous_status
#
# The GET MUST register before /inventory/{inventory_id} below — FastAPI
# matches in declaration order and would otherwise try to parse the literal
# "pending-deletion" as a UUID, 422'ing.
# ==========================================================================


from pydantic import BaseModel as _PenDelBM  # noqa: E402


class _RejectDeletionBody(_PenDelBM):
    reason: str


@router.get("/inventory/pending-deletion")
async def admin_list_pending_deletion(
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, object]:
    """Every inventory row currently in pending_deletion, ordered by
    request time ascending — oldest request appears first so the
    admin queue is FIFO."""
    rows = (
        await db.execute(
            select(Inventory, Dealer, User)
            .join(Dealer, Dealer.id == Inventory.dealer_id)
            .join(User, User.id == Dealer.user_id)
            .where(Inventory.status == "pending_deletion")
            .order_by(Inventory.pending_deletion_requested_at.asc().nullslast())
        )
    ).all()

    items = [
        {
            "id": str(inv.id),
            "make": inv.make,
            "model": inv.model,
            "year": inv.year,
            "previous_status": inv.previous_status,
            "pending_deletion_reason": inv.pending_deletion_reason,
            "pending_deletion_requested_at": (
                inv.pending_deletion_requested_at.isoformat()
                if inv.pending_deletion_requested_at
                else None
            ),
            "dealer": {
                "id": str(dealer.id),
                "business_name": dealer.business_name,
                "city": dealer.city,
                "phone": dealer.phone,
                "email": dealer_user.email,
            },
        }
        for inv, dealer, dealer_user in rows
    ]
    return {"items": items, "total": len(items)}


@router.post("/inventory/{inventory_id}/approve-deletion")
async def admin_approve_deletion(
    inventory_id: uuid.UUID,
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, object]:
    """Hard-delete a row that's been queued for deletion.

    Cascades: offers (CASCADE), inventory_images (CASCADE),
    inventory_views (CASCADE). deals references inventory_id without
    CASCADE — so a row that ever closed a deal cannot be hard-deleted;
    that's intentional for the audit chain. Such requests will fail at
    the DB level and the admin should reject the request instead.

    Cloudinary blobs are best-effort cleaned up after the DB commit so
    CDN failures don't roll back the deletion.
    """
    from app.core.cloudinary_client import delete_vehicle_image as _del_img
    from app.models import InventoryImage as _InventoryImage

    item = (
        await db.execute(select(Inventory).where(Inventory.id == inventory_id))
    ).scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=404, detail="רכב לא נמצא")
    if item.status != "pending_deletion":
        raise HTTPException(
            status_code=409, detail="הרכב אינו בסטטוס בקשת מחיקה"
        )

    # Snapshot the image public_ids BEFORE the cascade fires so the
    # CDN cleanup loop below has something to call.
    image_rows = (
        await db.execute(
            select(_InventoryImage).where(
                _InventoryImage.inventory_id == inventory_id
            )
        )
    ).scalars().all()
    public_ids = [img.public_id for img in image_rows if img.public_id]

    dealer_id = item.dealer_id
    dealer_reason = item.pending_deletion_reason

    await emit_event(
        db,
        event_type="inventory.deletion.approved",
        aggregate_type="inventory",
        aggregate_id=inventory_id,
        payload={
            "dealer_id": str(dealer_id),
            "reason": dealer_reason,
            "image_count": len(public_ids),
        },
        actor_user_id=admin.id,
    )
    await log_admin_action(
        db,
        actor_user_id=admin.id,
        action="admin.inventory.deletion.approved",
        target_type="inventory",
        target_id=inventory_id,
        metadata={"dealer_id": str(dealer_id), "reason": dealer_reason},
    )

    await db.delete(item)
    await db.commit()

    failed_cleanups = 0
    for public_id in public_ids:
        try:
            await _del_img(public_id)
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "cloudinary cleanup failed inventory=%s public_id=%s err=%s",
                inventory_id,
                public_id,
                exc,
            )
            failed_cleanups += 1

    return {
        "ok": True,
        "id": str(inventory_id),
        "images_cleaned": len(public_ids) - failed_cleanups,
        "images_failed": failed_cleanups,
    }


@router.post("/inventory/{inventory_id}/reject-deletion")
async def admin_reject_deletion(
    inventory_id: uuid.UUID,
    body: _RejectDeletionBody,
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, object]:
    """Reject a deletion request. Row reverts to previous_status
    (active or hidden) and the dealer's pending_deletion_* fields are
    cleared. The admin's rejection reason is captured in the event log
    so it can be surfaced to the dealer."""
    rejection_reason = (body.reason or "").strip()
    if not rejection_reason:
        raise HTTPException(
            status_code=400, detail="חובה להזין סיבה לדחייה"
        )

    item = (
        await db.execute(select(Inventory).where(Inventory.id == inventory_id))
    ).scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=404, detail="רכב לא נמצא")
    if item.status != "pending_deletion":
        raise HTTPException(
            status_code=409, detail="הרכב אינו בסטטוס בקשת מחיקה"
        )

    restore_to = (
        item.previous_status
        if item.previous_status in ("active", "hidden")
        else "active"
    )
    dealer_id = item.dealer_id
    dealer_reason = item.pending_deletion_reason

    item.status = restore_to
    item.previous_status = None
    item.pending_deletion_reason = None
    item.pending_deletion_requested_at = None

    await emit_event(
        db,
        event_type="inventory.deletion.rejected",
        aggregate_type="inventory",
        aggregate_id=inventory_id,
        payload={
            "dealer_id": str(dealer_id),
            "dealer_reason": dealer_reason,
            "admin_reason": rejection_reason[:2000],
            "restored_to": restore_to,
        },
        actor_user_id=admin.id,
    )
    await log_admin_action(
        db,
        actor_user_id=admin.id,
        action="admin.inventory.deletion.rejected",
        target_type="inventory",
        target_id=inventory_id,
        metadata={
            "dealer_id": str(dealer_id),
            "admin_reason": rejection_reason[:2000],
            "restored_to": restore_to,
        },
    )
    await db.commit()
    await db.refresh(item)

    return {
        "id": str(item.id),
        "status": item.status,
        "previous_status": None,
    }


# ==========================================================================
# Phase 4.3 — admin inventory: ALL vehicles from ALL dealers
# ==========================================================================


@router.get("/inventory/{inventory_id}")
async def admin_get_inventory_item(
    inventory_id: uuid.UUID,
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, object]:
    """Admin view of a single vehicle: every column on the row + the
    owning dealer's identity + every image (including hidden ones,
    since admins audit content the dealer hides). Buyer + trade-in
    columns from the P6.8.4 migration are surfaced when present.

    Path is registered BEFORE /inventory (the list route below) so
    FastAPI routes /inventory/{uuid} here instead of treating "{uuid}"
    as a query param to the list."""
    from app.models import InventoryImage

    row = (
        await db.execute(
            select(Inventory, Dealer, User)
            .join(Dealer, Dealer.id == Inventory.dealer_id)
            .join(User, User.id == Dealer.user_id)
            .where(Inventory.id == inventory_id)
        )
    ).first()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="רכב לא נמצא"
        )
    inv, dealer, dealer_user = row

    images = (
        (
            await db.execute(
                select(InventoryImage)
                .where(InventoryImage.inventory_id == inventory_id)
                .order_by(InventoryImage.position)
            )
        )
        .scalars()
        .all()
    )

    # Forensic trail — record that this admin viewed this specific row.
    # Browsing one dealer's full vehicle detail (including purchase_cost,
    # buyer PII, notes) is the highest-privilege admin read; capturing
    # it lets us audit competitor-data harvesting after the fact
    # (security audit 2026-05-29, finding #6).
    await log_admin_action(
        db,
        actor_user_id=admin.id,
        action="admin.inventory.read",
        target_type="inventory",
        target_id=inventory_id,
    )
    await db.commit()

    return {
        "id": str(inv.id),
        "make": inv.make,
        "model": inv.model,
        "year": inv.year,
        "mileage": inv.mileage,
        "color": inv.color,
        "transmission": inv.transmission,
        "fuel_type": inv.fuel_type,
        "engine_volume": str(inv.engine_volume) if inv.engine_volume is not None else None,
        # Wave 2 — notes split. Admins see both halves.
        "public_notes": inv.public_notes,
        "private_notes": inv.private_notes,
        "plate_number": getattr(inv, "plate_number", None),
        # Pricing
        "price": inv.price,
        "b2b_price": inv.b2b_price,
        "b2c_price": inv.b2c_price,
        "purchase_cost": inv.purchase_cost,
        # Lifecycle (Wave 2 retired paused_until)
        "status": inv.status,
        "visibility": inv.visibility,
        "pending_deletion_reason": inv.pending_deletion_reason,
        "pending_deletion_requested_at": (
            inv.pending_deletion_requested_at.isoformat()
            if inv.pending_deletion_requested_at
            else None
        ),
        "previous_status": inv.previous_status,
        "created_at": inv.created_at.isoformat(),
        "updated_at": inv.updated_at.isoformat(),
        # Sale closure (P6.5)
        "sale_price": inv.sale_price,
        "sold_at": inv.sold_at.isoformat() if inv.sold_at else None,
        "sold_to": inv.sold_to,
        "warranty_type": inv.warranty_type,
        "warranty_until": inv.warranty_until.isoformat() if inv.warranty_until else None,
        # Buyer + trade-in (P6.8.4)
        "buyer_name": inv.buyer_name,
        "buyer_id_number": inv.buyer_id_number,
        "buyer_phone": inv.buyer_phone,
        "was_trade_in": inv.was_trade_in,
        "trade_in_make": inv.trade_in_make,
        "trade_in_model": inv.trade_in_model,
        "trade_in_year": inv.trade_in_year,
        "trade_in_value": inv.trade_in_value,
        "trade_in_plate": inv.trade_in_plate,
        # Owning dealer
        "dealer": {
            "id": str(dealer.id),
            "business_name": dealer.business_name,
            "city": dealer.city,
            "phone": dealer.phone,
            "email": dealer_user.email,
            "tier": dealer.tier,
            "trust_score": int(dealer.trust_score or 0),
            "verified": dealer.verified,
            "suspended_at": dealer.suspended_at.isoformat() if dealer.suspended_at else None,
        },
        # Images — admin sees hidden ones too with the flag
        "images": [
            {
                "id": str(img.id),
                "url": img.url,
                "position": img.position,
                "hidden": img.hidden,
            }
            for img in images
        ],
    }


@router.get("/inventory")
async def admin_list_inventory(
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
    dealer_id: uuid.UUID | None = Query(default=None),
    visibility: str | None = Query(
        default=None, pattern="^(private|b2b|b2c|both)$"
    ),
    status_filter: str | None = Query(
        default=None, alias="status", pattern="^(active|sold|hidden)$"
    ),
    make: str | None = Query(default=None, max_length=100),
    model: str | None = Query(default=None, max_length=100),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
) -> dict[str, object]:
    """Admin sees ALL inventory from ALL dealers — every status, every
    visibility, including paused rows. Scoped by filters below."""
    conds = []
    if dealer_id:
        conds.append(Inventory.dealer_id == dealer_id)
    if visibility:
        conds.append(Inventory.visibility == visibility)
    if status_filter:
        conds.append(Inventory.status == status_filter)
    if make:
        conds.append(Inventory.make == make)
    if model:
        conds.append(Inventory.model == model)

    total = (
        await db.execute(
            select(func.count()).select_from(Inventory).where(*conds)
        )
    ).scalar_one()

    rows = (
        await db.execute(
            select(Inventory, Dealer)
            .join(Dealer, Dealer.id == Inventory.dealer_id)
            .where(*conds)
            .order_by(Inventory.created_at.desc())
            .offset((page - 1) * per_page)
            .limit(per_page)
        )
    ).all()

    # Bulk-fetch primary thumbnails so the admin card list can show
    # previews without N+1 queries.
    from app.routers.marketplace import _primary_images_bulk

    primary_images = await _primary_images_bulk([inv.id for inv, _ in rows], db)

    items = [
        {
            "id": str(inv.id),
            "make": inv.make,
            "model": inv.model,
            "year": inv.year,
            "price": inv.price,
            "b2b_price": inv.b2b_price,
            "b2c_price": inv.b2c_price,
            "visibility": inv.visibility,
            "status": inv.status,
            "dealer_id": str(dealer.id),
            "dealer_business_name": dealer.business_name,
            "dealer_city": dealer.city,
            "created_at": inv.created_at.isoformat(),
            "primary_image_url": primary_images.get(inv.id),
        }
        for inv, dealer in rows
    ]

    pages = math.ceil(total / per_page) if total > 0 else 1

    # Forensic trail — record the list query with its filters so we can
    # see *which slice* of inventory the admin browsed, not just that
    # they hit the route. target_id is null because the call returned
    # many rows, not one (security audit 2026-05-29, finding #6).
    list_filters: dict[str, object] = {}
    if dealer_id is not None:
        list_filters["dealer_id"] = str(dealer_id)
    if visibility is not None:
        list_filters["visibility"] = visibility
    if status_filter is not None:
        list_filters["status"] = status_filter
    if make is not None:
        list_filters["make"] = make
    if model is not None:
        list_filters["model"] = model
    list_filters["page"] = page
    list_filters["result_count"] = int(total)
    await log_admin_action(
        db,
        actor_user_id=admin.id,
        action="admin.inventory.read",
        target_type="inventory",
        target_id=None,
        metadata={"filters": list_filters},
    )
    await db.commit()

    return {
        "items": items,
        "total": total,
        "page": page,
        "pages": pages,
        "per_page": per_page,
    }


# ==========================================================================
# Phase 4.4 — system settings, dealer suspension, admin promotion, reset
# ==========================================================================

from pydantic import BaseModel as _BM, EmailStr as _EmailStr  # noqa: E402


async def _get_settings(db: AsyncSession) -> SystemSettings:
    s = (await db.execute(select(SystemSettings).where(SystemSettings.id == 1))).scalar_one_or_none()
    if s is None:
        # Defensive — migration seeds the row, but a fresh dev DB might not.
        s = SystemSettings(
            id=1,
            site_name="AutoTradeIL",
            support_email="support@autotradeil.co.il",
            welcome_message="ברוכים הבאים ל-AutoTradeIL",
        )
        db.add(s)
        await db.flush()
    return s


@router.get("/settings")
async def get_settings(
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, object]:
    s = await _get_settings(db)
    return {
        "site_name": s.site_name,
        "support_email": s.support_email,
        "welcome_message": s.welcome_message,
        "subscription_tiers": s.subscription_tiers,
        "updated_at": s.updated_at.isoformat() if s.updated_at else None,
    }


class _SettingsUpdate(_BM):
    site_name: str | None = None
    support_email: _EmailStr | None = None
    welcome_message: str | None = None
    subscription_tiers: dict[str, object] | None = None


@router.patch("/settings")
async def update_settings(
    body: _SettingsUpdate,
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, object]:
    s = await _get_settings(db)
    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(s, k, v)
    await emit_event(
        db,
        event_type="admin.settings.updated",
        aggregate_type="system",
        aggregate_id=uuid.UUID("00000000-0000-0000-0000-000000000000"),
        payload={"changes": list(data.keys())},
        actor_user_id=admin.id,
    )
    await db.commit()
    await db.refresh(s)
    return {
        "site_name": s.site_name,
        "support_email": s.support_email,
        "welcome_message": s.welcome_message,
        "subscription_tiers": s.subscription_tiers,
    }


# ----- Admin list / promote -----


@router.get("/admins")
async def list_admins(
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[dict[str, object]]:
    rows = (
        await db.execute(
            select(User)
            .where(User.user_type == "admin")
            .order_by(User.email)
        )
    ).scalars().all()
    return [
        {"id": str(u.id), "email": u.email, "created_at": u.created_at.isoformat()}
        for u in rows
    ]


class _PromoteAdminBody(_BM):
    email: _EmailStr


@router.post("/admins")
async def promote_admin(
    body: _PromoteAdminBody,
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, str]:
    """Flip an EXISTING user's user_type to 'admin'. Does not create a user."""
    user = (
        await db.execute(select(User).where(User.email == body.email))
    ).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="משתמש לא נמצא")
    if user.user_type == "admin":
        raise HTTPException(status_code=400, detail="המשתמש כבר מנהל")
    user.user_type = "admin"
    await emit_event(
        db,
        event_type="admin.promoted",
        aggregate_type="user",
        aggregate_id=user.id,
        payload={"email": user.email},
        actor_user_id=admin.id,
    )
    await db.commit()
    return {"id": str(user.id), "email": user.email}


# ----- Suspend dealer -----


class _SuspendBody(_BM):
    reason: str | None = None
    silent: bool = False
    admin_password: str


class _UnsuspendBody(_BM):
    admin_password: str


class _ArchiveBody(_BM):
    reason: str
    admin_password: str


class _UnarchiveBody(_BM):
    admin_password: str


class _SuspensionReasonOut(_BM):
    id: uuid.UUID
    text_he: str
    kind: str
    active: bool


class _CreateSuspensionReasonBody(_BM):
    text_he: str
    kind: str  # 'suspend' | 'archive'


async def _verify_admin_password(admin: User, password: str) -> None:
    """Re-authenticate the admin via Supabase password grant. Raises 401
    on bad password. The admin's email is the lookup key."""
    import httpx

    from app.core.config import settings as _s

    if not password:
        raise HTTPException(status_code=401, detail="סיסמת מנהל חסרה")
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            f"{_s.supabase_url}/auth/v1/token?grant_type=password",
            headers={
                "apikey": _s.supabase_publishable_key or _s.supabase_secret_key,
                "Content-Type": "application/json",
            },
            json={"email": admin.email, "password": password},
        )
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="סיסמת מנהל שגויה")


@router.post("/dealers/{dealer_id}/suspend")
async def suspend_dealer(
    dealer_id: uuid.UUID,
    body: _SuspendBody,
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, object]:
    """Suspend a dealer. Requires admin password re-auth.

    Two modes:
    * `silent=false` (default): records the reason, sends a notification
      email to the dealer ("החשבון שלך הושעה — סיבה: ___"), and
      `require_verified_dealer` returns 403 with that reason on every
      authenticated request.
    * `silent=true`: no reason, no email, `require_verified_dealer`
      returns 503 "שירות לא זמין" (the dealer doesn't get a clear
      explanation — used during investigation).
    """
    await _verify_admin_password(admin, body.admin_password)

    if not body.silent and not (body.reason and body.reason.strip()):
        raise HTTPException(
            status_code=400, detail="חובה להזין סיבה כשההשעיה אינה שקטה"
        )

    dealer = (
        await db.execute(select(Dealer).where(Dealer.id == dealer_id))
    ).scalar_one_or_none()
    if dealer is None:
        raise HTTPException(status_code=404, detail="סוחר לא נמצא")
    if dealer.suspended_at is not None:
        raise HTTPException(status_code=409, detail="הסוחר כבר מושעה")
    if dealer.archived_at is not None:
        raise HTTPException(status_code=409, detail="הסוחר נמצא בארכיון")

    dealer.suspended_at = datetime.now(tz=timezone.utc)
    dealer.suspended_by = admin.id
    dealer.suspended_reason = (
        body.reason.strip()[:200] if body.reason and not body.silent else None
    )
    dealer.suspension_silent = body.silent

    email_sent = False
    if not body.silent:
        # Best-effort notification — the suspension is real even if the
        # email layer is down.
        from app.core.email import send_suspension_notice

        user = (
            await db.execute(select(User).where(User.id == dealer.user_id))
        ).scalar_one_or_none()
        if user is not None:
            try:
                email_sent = await send_suspension_notice(
                    to_email=user.email,
                    business_name=dealer.business_name,
                    reason=dealer.suspended_reason or "",
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning("suspension email failed dealer=%s: %s", dealer.id, exc)

    await emit_event(
        db,
        event_type=(
            "dealer.suspended.silent" if body.silent else "dealer.suspended.with_reason"
        ),
        aggregate_type="dealer",
        aggregate_id=dealer.id,
        payload={"reason": dealer.suspended_reason, "silent": body.silent},
        actor_user_id=admin.id,
    )
    await db.commit()
    return {
        "id": str(dealer.id),
        "suspended_at": dealer.suspended_at.isoformat(),
        "silent": body.silent,
        "email_sent": email_sent,
    }


@router.post("/dealers/{dealer_id}/unsuspend")
async def unsuspend_dealer(
    dealer_id: uuid.UUID,
    body: _UnsuspendBody,
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, str]:
    await _verify_admin_password(admin, body.admin_password)

    dealer = (
        await db.execute(select(Dealer).where(Dealer.id == dealer_id))
    ).scalar_one_or_none()
    if dealer is None:
        raise HTTPException(status_code=404, detail="סוחר לא נמצא")
    dealer.suspended_at = None
    dealer.suspended_reason = None
    dealer.suspended_by = None
    dealer.suspension_silent = False
    await emit_event(
        db,
        event_type="dealer.unsuspended",
        aggregate_type="dealer",
        aggregate_id=dealer.id,
        payload={},
        actor_user_id=admin.id,
    )
    await db.commit()
    return {"id": str(dealer.id)}


@router.post("/dealers/{dealer_id}/archive")
async def archive_dealer(
    dealer_id: uuid.UUID,
    body: _ArchiveBody,
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, object]:
    """Soft-delete a dealer: keeps history, frees the email so they can
    re-register. Requires admin password re-auth + a reason. Calls the
    Supabase admin API to delete the auth user."""
    import httpx

    from app.core.config import settings as _s

    await _verify_admin_password(admin, body.admin_password)
    if not body.reason or not body.reason.strip():
        raise HTTPException(status_code=400, detail="חובה להזין סיבה")

    dealer = (
        await db.execute(select(Dealer).where(Dealer.id == dealer_id))
    ).scalar_one_or_none()
    if dealer is None:
        raise HTTPException(status_code=404, detail="סוחר לא נמצא")
    if dealer.archived_at is not None:
        raise HTTPException(status_code=409, detail="הסוחר כבר בארכיון")
    if dealer.user_id == admin.id:
        raise HTTPException(
            status_code=400, detail="אדמין לא יכול לארכב את עצמו"
        )

    dealer.archived_at = datetime.now(tz=timezone.utc)
    dealer.archived_by = admin.id
    dealer.archived_reason = body.reason.strip()[:100]

    # Delete Supabase auth user so the email is free for re-signup.
    auth_deleted = False
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.delete(
                f"{_s.supabase_url}/auth/v1/admin/users/{dealer.user_id}",
                headers={
                    "apikey": _s.supabase_secret_key,
                    "Authorization": f"Bearer {_s.supabase_secret_key}",
                },
            )
        auth_deleted = r.status_code in (200, 204, 404)
    except Exception as exc:  # noqa: BLE001
        logger.warning("supabase auth delete failed dealer=%s: %s", dealer.id, exc)

    await emit_event(
        db,
        event_type="dealer.archived",
        aggregate_type="dealer",
        aggregate_id=dealer.id,
        payload={"reason": dealer.archived_reason, "auth_deleted": auth_deleted},
        actor_user_id=admin.id,
    )
    await db.commit()
    return {
        "id": str(dealer.id),
        "archived_at": dealer.archived_at.isoformat(),
        "auth_deleted": auth_deleted,
    }


@router.post("/dealers/{dealer_id}/unarchive")
async def unarchive_dealer(
    dealer_id: uuid.UUID,
    body: _UnarchiveBody,
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, str]:
    """Restore an archived dealer row. Note: the auth user was deleted on
    archive, so the dealer would need a re-invite to log in again. Out of
    scope for this endpoint — for now, restore the row only."""
    await _verify_admin_password(admin, body.admin_password)

    dealer = (
        await db.execute(select(Dealer).where(Dealer.id == dealer_id))
    ).scalar_one_or_none()
    if dealer is None:
        raise HTTPException(status_code=404, detail="סוחר לא נמצא")
    if dealer.archived_at is None:
        raise HTTPException(status_code=409, detail="הסוחר אינו בארכיון")

    dealer.archived_at = None
    dealer.archived_by = None
    dealer.archived_reason = None
    await emit_event(
        db,
        event_type="dealer.unarchived",
        aggregate_type="dealer",
        aggregate_id=dealer.id,
        payload={},
        actor_user_id=admin.id,
    )
    await db.commit()
    return {"id": str(dealer.id)}


@router.get("/suspension-reasons", response_model=list[_SuspensionReasonOut])
async def list_suspension_reasons(
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
    kind: str | None = Query(default=None, pattern="^(suspend|archive)$"),
) -> list[_SuspensionReasonOut]:
    """Predefined Hebrew reason chips. Filter by kind."""
    from app.models import SuspensionReasonTemplate

    stmt = select(SuspensionReasonTemplate).where(SuspensionReasonTemplate.active.is_(True))
    if kind:
        stmt = stmt.where(SuspensionReasonTemplate.kind == kind)
    stmt = stmt.order_by(SuspensionReasonTemplate.created_at)
    rows = (await db.execute(stmt)).scalars().all()
    return [
        _SuspensionReasonOut(
            id=r.id, text_he=r.text_he, kind=r.kind, active=r.active
        )
        for r in rows
    ]


@router.post(
    "/suspension-reasons",
    response_model=_SuspensionReasonOut,
    status_code=201,
)
async def create_suspension_reason(
    body: _CreateSuspensionReasonBody,
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> _SuspensionReasonOut:
    from app.models import SuspensionReasonTemplate

    if body.kind not in ("suspend", "archive"):
        raise HTTPException(
            status_code=400, detail="kind חייב להיות 'suspend' או 'archive'"
        )
    if not body.text_he.strip():
        raise HTTPException(status_code=400, detail="טקסט ריק")

    row = SuspensionReasonTemplate(
        text_he=body.text_he.strip()[:200], kind=body.kind, active=True
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _SuspensionReasonOut(
        id=row.id, text_he=row.text_he, kind=row.kind, active=row.active
    )


# ----- Reset dealer password (admin) -----


@router.post("/dealers/{dealer_id}/reset-password")
async def admin_reset_password(
    dealer_id: uuid.UUID,
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, str]:
    """Trigger a Supabase recovery link + send our Hebrew RTL email."""
    import httpx as _httpx

    from app.core.config import settings as _settings
    from app.core.email import send_password_reset

    dealer = (
        await db.execute(select(Dealer).where(Dealer.id == dealer_id))
    ).scalar_one_or_none()
    if dealer is None:
        raise HTTPException(status_code=404, detail="סוחר לא נמצא")

    user = (
        await db.execute(select(User).where(User.id == dealer.user_id))
    ).scalar_one()

    url = f"{_settings.supabase_url}/auth/v1/admin/generate_link"
    headers = {
        "apikey": _settings.supabase_secret_key,
        "Authorization": f"Bearer {_settings.supabase_secret_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "type": "recovery",
        "email": user.email,
        "options": {"redirect_to": "https://autotradeil.co.il/reset-password"},
    }
    try:
        async with _httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
        link = (resp.json().get("properties") or {}).get("action_link") if resp.status_code == 200 else None
    except _httpx.HTTPError:
        link = None

    if link:
        try:
            await send_password_reset(to_email=user.email, reset_link=link)
        except Exception as exc:  # noqa: BLE001
            logger.warning("admin reset password email failed: %s", exc)

    await emit_event(
        db,
        event_type="admin.dealer.reset_password",
        aggregate_type="dealer",
        aggregate_id=dealer.id,
        payload={"email": user.email},
        actor_user_id=admin.id,
    )
    await db.commit()
    return {"id": str(dealer.id), "email": user.email}



# ==========================================================================
# Transactions in progress (in_transaction state)
# ==========================================================================
#
# When two dealers confirm a deal, the vehicle's inventory.status flips
# to "in_transaction" instead of "sold". The deal sits in this admin
# escort window until support team verifies payment + paperwork. Then
# the admin POSTs /transactions/{deal_id}/complete and the vehicle
# moves to "sold" + counters bump + trust scores recalculate.


@router.get("/transactions-in-progress")
async def admin_list_transactions_in_progress(
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, object]:
    """List every deal whose vehicle is still in_transaction."""
    from app.models import Deal

    rows = (
        await db.execute(
            select(Deal, Inventory)
            .join(Inventory, Inventory.id == Deal.inventory_id)
            .where(Inventory.status == "in_transaction")
            .order_by(Deal.confirmed_at.desc().nullslast())
        )
    ).all()

    if not rows:
        return {"items": [], "total": 0}

    dealer_ids = list(
        {d.buyer_dealer_id for d, _ in rows} | {d.seller_dealer_id for d, _ in rows}
    )
    dealers = {
        d.id: d
        for d in (
            (await db.execute(select(Dealer).where(Dealer.id.in_(dealer_ids))))
            .scalars()
            .all()
        )
    }

    items: list[dict[str, object]] = []
    for deal, veh in rows:
        buyer = dealers.get(deal.buyer_dealer_id)
        seller = dealers.get(deal.seller_dealer_id)
        if buyer is None or seller is None:
            continue
        items.append(
            {
                "deal_id": str(deal.id),
                "offer_id": str(deal.offer_id),
                "inventory_id": str(veh.id),
                "final_price": deal.final_price,
                "confirmed_at": deal.confirmed_at.isoformat() if deal.confirmed_at else None,
                "vehicle": {
                    "make": veh.make,
                    "model": veh.model,
                    "year": veh.year,
                    "plate_number": getattr(veh, "plate_number", None),
                },
                "buyer": {
                    "id": str(buyer.id),
                    "business_name": buyer.business_name,
                    "city": buyer.city,
                    "tier": buyer.tier,
                    "phone": buyer.phone,
                },
                "seller": {
                    "id": str(seller.id),
                    "business_name": seller.business_name,
                    "city": seller.city,
                    "tier": seller.tier,
                    "phone": seller.phone,
                },
                # Digital agreement signatures (A.3) — surfaced so the
                # admin escort screen can show "buyer signed at X, seller
                # signed at Y" without an extra fetch.
                "agreements": {
                    "buyer_signed_at": deal.buyer_agreement_at.isoformat()
                    if deal.buyer_agreement_at
                    else None,
                    "buyer_signed_ip": deal.buyer_agreement_ip,
                    "seller_signed_at": deal.seller_agreement_at.isoformat()
                    if deal.seller_agreement_at
                    else None,
                    "seller_signed_ip": deal.seller_agreement_ip,
                },
            }
        )

    return {"items": items, "total": len(items)}


@router.post("/transactions/{deal_id}/complete")
async def admin_complete_transaction(
    deal_id: uuid.UUID,
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, object]:
    """Mark an in-flight deal as fully closed.

    - vehicle.status: in_transaction → sold
    - both dealers' deals_completed += 1
    - trust scores recalculated for both
    - audit log entry written
    - notifications fan out
    """
    from app.core.trust import recalculate_trust_score
    from app.models import Deal, Notification

    row = (
        await db.execute(
            select(Deal, Inventory)
            .join(Inventory, Inventory.id == Deal.inventory_id)
            .where(Deal.id == deal_id)
        )
    ).first()
    if row is None:
        raise HTTPException(status_code=404, detail="עסקה לא נמצאה")

    deal, vehicle = row
    if vehicle.status == "sold":
        raise HTTPException(status_code=400, detail="העסקה כבר סומנה כסגורה")
    if vehicle.status != "in_transaction":
        raise HTTPException(
            status_code=400,
            detail=f"לא ניתן לסגור עסקה בסטטוס {vehicle.status}",
        )

    buyer = (
        await db.execute(select(Dealer).where(Dealer.id == deal.buyer_dealer_id))
    ).scalar_one_or_none()
    seller = (
        await db.execute(select(Dealer).where(Dealer.id == deal.seller_dealer_id))
    ).scalar_one_or_none()
    if buyer is None or seller is None:
        raise HTTPException(status_code=500, detail="פרטי הסוחרים חסרים")

    vehicle.status = "sold"
    buyer.deals_completed = (buyer.deals_completed or 0) + 1
    seller.deals_completed = (seller.deals_completed or 0) + 1
    await db.flush()

    await recalculate_trust_score(buyer.id, db)
    await recalculate_trust_score(seller.id, db)

    veh_line = f"{vehicle.make} {vehicle.model} {vehicle.year}"
    db.add_all(
        [
            Notification(
                dealer_id=buyer.id,
                type="deal.completed",
                title=f"עסקה הושלמה: {veh_line}",
                body=f"מחיר סופי: {deal.final_price:,} ₪. תודה!",
                data={"offer_id": str(deal.offer_id), "inventory_id": str(vehicle.id)},
            ),
            Notification(
                dealer_id=seller.id,
                type="deal.completed",
                title=f"עסקה הושלמה: {veh_line}",
                body=f"מחיר סופי: {deal.final_price:,} ₪. תודה!",
                data={"offer_id": str(deal.offer_id), "inventory_id": str(vehicle.id)},
            ),
        ]
    )

    await emit_event(
        db,
        event_type="admin.transaction.completed",
        aggregate_type="deal",
        aggregate_id=deal.id,
        payload={"final_price": deal.final_price},
        actor_user_id=admin.id,
    )
    await log_admin_action(
        db,
        actor_user_id=admin.id,
        action="transaction.complete",
        target_type="deal",
        target_id=deal.id,
    )

    await db.commit()
    return {
        "deal_id": str(deal.id),
        "inventory_id": str(vehicle.id),
        "status": "sold",
    }
