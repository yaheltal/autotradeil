"""Dealer inventory endpoints.

All routes require a verified dealer. Every query is scoped by
`dealer.id` in Python — the backend uses the service-role DB
connection so RLS is not the authoritative gate here.
"""

from __future__ import annotations

import math
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_verified_dealer
from app.core.cloudinary_client import delete_vehicle_image, upload_vehicle_image
from app.core.events import emit_event
from app.core.logging import get_logger
from app.database import get_db
from app.models import Dealer, Inventory, InventoryImage, User
from app.schemas.inventory import (
    ImagePatchRequest,
    InventoryItemCreate,
    InventoryItemResponse,
    InventoryItemUpdate,
    InventoryListResponse,
    SellRequest,
    SellResponse,
    SellWarning,
    StatsResponse,
)

# Image upload constraints
MAX_IMAGES_PER_VEHICLE = 10
MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10 MB
ALLOWED_IMAGE_MIME = frozenset(
    {"image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic"}
)

logger = get_logger(__name__)

router = APIRouter(prefix="/api/v1/inventory", tags=["inventory"])


async def _get_own_or_404(
    item_id: uuid.UUID,
    dealer: Dealer,
    db: AsyncSession,
) -> Inventory:
    result = await db.execute(
        select(Inventory).where(
            Inventory.id == item_id,
            Inventory.dealer_id == dealer.id,
        )
    )
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="רכב לא נמצא",
        )
    return item


async def _auto_unpause_expired(dealer_id: uuid.UUID, db: AsyncSession) -> None:
    """Flip paused-and-expired inventory rows back to active on list fetch.

    Triggered on every /inventory list call. Uses a single UPDATE with
    a predicate so we never touch rows that don't need it. Caller owns
    the commit — we only flush here.
    """
    from sqlalchemy import update

    from datetime import datetime, timezone as _tz

    now = datetime.now(tz=_tz.utc)
    await db.execute(
        update(Inventory)
        .where(
            Inventory.dealer_id == dealer_id,
            Inventory.status == "hidden",
            Inventory.paused_until.isnot(None),
            Inventory.paused_until <= now,
        )
        .values(status="active", paused_until=None, pause_reason=None)
    )
    await db.flush()


@router.get("", response_model=InventoryListResponse)
async def list_inventory(
    ud: Annotated[tuple[User, Dealer], Depends(require_verified_dealer)],
    db: Annotated[AsyncSession, Depends(get_db)],
    status_filter: str | None = Query(default=None, alias="status"),
    # Phase 6.10 — smart-search filters parsed by /api/v1/ai/parse-filters.
    # All optional; dealer-self filter on dealer_id is always applied.
    make: str | None = Query(default=None, max_length=100),
    model: str | None = Query(default=None, max_length=100),
    year_min: int | None = Query(default=None, ge=1900, le=2030),
    year_max: int | None = Query(default=None, ge=1900, le=2030),
    price_min: int | None = Query(default=None, ge=0),
    price_max: int | None = Query(default=None, ge=0),
    q: str | None = Query(default=None, max_length=200),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
) -> InventoryListResponse:
    _, dealer = ud

    # Phase 4.3: flip paused-and-expired rows back to active.
    await _auto_unpause_expired(dealer.id, db)

    base_q = select(Inventory).where(Inventory.dealer_id == dealer.id)
    count_q = (
        select(func.count()).select_from(Inventory).where(Inventory.dealer_id == dealer.id)
    )

    if status_filter in {"active", "sold", "hidden"}:
        base_q = base_q.where(Inventory.status == status_filter)
        count_q = count_q.where(Inventory.status == status_filter)

    if make:
        base_q = base_q.where(Inventory.make.ilike(f"%{make}%"))
        count_q = count_q.where(Inventory.make.ilike(f"%{make}%"))
    if model:
        base_q = base_q.where(Inventory.model.ilike(f"%{model}%"))
        count_q = count_q.where(Inventory.model.ilike(f"%{model}%"))
    if year_min is not None:
        base_q = base_q.where(Inventory.year >= year_min)
        count_q = count_q.where(Inventory.year >= year_min)
    if year_max is not None:
        base_q = base_q.where(Inventory.year <= year_max)
        count_q = count_q.where(Inventory.year <= year_max)
    if price_min is not None:
        base_q = base_q.where(Inventory.price >= price_min)
        count_q = count_q.where(Inventory.price >= price_min)
    if price_max is not None:
        base_q = base_q.where(Inventory.price <= price_max)
        count_q = count_q.where(Inventory.price <= price_max)
    if q:
        from sqlalchemy import or_

        like = f"%{q}%"
        base_q = base_q.where(
            or_(
                Inventory.make.ilike(like),
                Inventory.model.ilike(like),
                Inventory.notes.ilike(like),
            )
        )
        count_q = count_q.where(
            or_(
                Inventory.make.ilike(like),
                Inventory.model.ilike(like),
                Inventory.notes.ilike(like),
            )
        )

    total = (await db.execute(count_q)).scalar_one()

    base_q = (
        base_q.order_by(Inventory.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    rows = (await db.execute(base_q)).scalars().all()

    # Bulk-fetch primary thumbnails (lowest-position non-hidden image
    # per vehicle) so the dealer's own card view renders previews
    # without N+1 queries.
    from app.routers.marketplace import _primary_images_bulk

    primary_images = await _primary_images_bulk([r.id for r in rows], db)

    items: list[InventoryItemResponse] = []
    for r in rows:
        item = InventoryItemResponse.model_validate(r)
        item.primary_image_url = primary_images.get(r.id)
        items.append(item)
    pages = math.ceil(total / per_page) if total > 0 else 1

    return InventoryListResponse(
        items=items,
        total=total,
        page=page,
        pages=pages,
        per_page=per_page,
    )


@router.post(
    "",
    response_model=InventoryItemResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_inventory_item(
    payload: InventoryItemCreate,
    ud: Annotated[tuple[User, Dealer], Depends(require_verified_dealer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> InventoryItemResponse:
    user, dealer = ud

    item = Inventory(
        dealer_id=dealer.id,
        make=payload.make,
        model=payload.model,
        year=payload.year,
        mileage=payload.mileage,
        price=payload.price,
        color=payload.color,
        transmission=payload.transmission,
        fuel_type=payload.fuel_type,
        engine_volume=payload.engine_volume,
        notes=payload.notes,
        purchase_cost=payload.purchase_cost,
        warranty_type=payload.warranty_type,
        warranty_until=payload.warranty_until,
        hand=payload.hand,
        ownership_type=payload.ownership_type,
    )
    db.add(item)
    await db.flush()

    await emit_event(
        db,
        event_type="inventory.created",
        aggregate_type="inventory",
        aggregate_id=item.id,
        payload={
            "dealer_id": str(dealer.id),
            "make": item.make,
            "model": item.model,
            "year": item.year,
            "price": item.price,
        },
        actor_user_id=user.id,
    )

    await db.commit()
    await db.refresh(item)
    return InventoryItemResponse.model_validate(item)


# ==========================================================================
# Phase 6.5 — dealer KPI rollup. MUST be declared before /{item_id}, otherwise
# FastAPI matches the literal "stats" against the {item_id: UUID} parameter
# and rejects with 422 ("Request payload is invalid"). Routes are matched in
# declaration order — see the /lookup/* routes for the same pattern.
# ==========================================================================


@router.get("/stats", response_model=StatsResponse)
async def inventory_stats(
    ud: Annotated[tuple[User, Dealer], Depends(require_verified_dealer)],
    db: Annotated[AsyncSession, Depends(get_db)],
    period: str = Query(default="lifetime", pattern="^(lifetime|year|month)$"),
) -> StatsResponse:
    """Per-dealer rollup: active count, sold count, revenue, profit, margin,
    avg days to sell, and how many sold rows lack purchase_cost."""
    from datetime import datetime, timedelta, timezone as _tz

    _, dealer = ud
    now = datetime.now(tz=_tz.utc)
    if period == "month":
        since = now - timedelta(days=30)
    elif period == "year":
        since = now - timedelta(days=365)
    else:
        since = None  # lifetime

    active_count = (
        await db.execute(
            select(func.count())
            .select_from(Inventory)
            .where(Inventory.dealer_id == dealer.id, Inventory.status == "active")
        )
    ).scalar_one()

    sold_conds = [Inventory.dealer_id == dealer.id, Inventory.status == "sold"]
    if since is not None:
        sold_conds.append(Inventory.sold_at >= since)

    sold_rows = (
        await db.execute(
            select(
                Inventory.sale_price,
                Inventory.purchase_cost,
                Inventory.sold_at,
                Inventory.created_at,
            ).where(*sold_conds)
        )
    ).all()

    sold_count = len(sold_rows)
    total_revenue = sum(int(r.sale_price or 0) for r in sold_rows)
    profit_rows = [
        int(r.sale_price) - int(r.purchase_cost)
        for r in sold_rows
        if r.sale_price is not None and r.purchase_cost is not None
    ]
    total_profit = sum(profit_rows)
    rows_missing_purchase_cost = sum(
        1 for r in sold_rows if r.sale_price is not None and r.purchase_cost is None
    )
    profit_margin_pct = (
        round((total_profit / total_revenue) * 100, 1) if total_revenue > 0 else 0.0
    )

    days_list = [
        (r.sold_at - r.created_at).days
        for r in sold_rows
        if r.sold_at is not None and r.created_at is not None
    ]
    avg_days_to_sell = (
        int(round(sum(days_list) / len(days_list))) if days_list else None
    )

    return StatsResponse(
        period=period,
        active_count=active_count,
        sold_count=sold_count,
        total_revenue=total_revenue,
        total_profit=total_profit,
        profit_margin_pct=profit_margin_pct,
        avg_days_to_sell=avg_days_to_sell,
        rows_missing_purchase_cost=rows_missing_purchase_cost,
    )


@router.get("/{item_id}", response_model=InventoryItemResponse)
async def get_inventory_item(
    item_id: uuid.UUID,
    ud: Annotated[tuple[User, Dealer], Depends(require_verified_dealer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> InventoryItemResponse:
    _, dealer = ud
    item = await _get_own_or_404(item_id, dealer, db)
    return InventoryItemResponse.model_validate(item)


@router.put("/{item_id}", response_model=InventoryItemResponse)
async def update_inventory_item(
    item_id: uuid.UUID,
    payload: InventoryItemUpdate,
    ud: Annotated[tuple[User, Dealer], Depends(require_verified_dealer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> InventoryItemResponse:
    user, dealer = ud
    item = await _get_own_or_404(item_id, dealer, db)

    data = payload.model_dump(exclude_unset=True)
    changed: dict[str, object] = {}
    for key, value in data.items():
        before = getattr(item, key)
        if before != value:
            changed[key] = value
        setattr(item, key, value)

    await db.flush()

    if changed:
        await emit_event(
            db,
            event_type="inventory.updated",
            aggregate_type="inventory",
            aggregate_id=item.id,
            payload={"dealer_id": str(dealer.id), "changes": list(changed.keys())},
            actor_user_id=user.id,
        )

    await db.commit()
    await db.refresh(item)
    return InventoryItemResponse.model_validate(item)


@router.delete("/{item_id}")
async def delete_inventory_item(
    item_id: uuid.UUID,
    ud: Annotated[tuple[User, Dealer], Depends(require_verified_dealer)],
    db: Annotated[AsyncSession, Depends(get_db)],
    mode: str = Query(default="soft", pattern="^(soft|hard)$"),
) -> dict[str, object]:
    """Delete an inventory item.

    `mode=soft` (default) sets `status='hidden'` so the item remains
    recoverable by filtering. `mode=hard` removes the row permanently.
    """
    user, dealer = ud
    item = await _get_own_or_404(item_id, dealer, db)

    if mode == "hard":
        await db.delete(item)
        await emit_event(
            db,
            event_type="inventory.deleted",
            aggregate_type="inventory",
            aggregate_id=item_id,
            payload={"dealer_id": str(dealer.id), "mode": "hard"},
            actor_user_id=user.id,
        )
        await db.commit()
        return {"ok": True, "mode": "hard", "id": str(item_id)}

    # soft
    item.status = "hidden"
    await db.flush()
    await emit_event(
        db,
        event_type="inventory.hidden",
        aggregate_type="inventory",
        aggregate_id=item.id,
        payload={"dealer_id": str(dealer.id), "mode": "soft"},
        actor_user_id=user.id,
    )
    await db.commit()
    return {"ok": True, "mode": "soft", "id": str(item_id)}


# ==========================================================================
# Vehicle image endpoints
# ==========================================================================


@router.get("/{inventory_id}/images")
async def list_images(
    inventory_id: uuid.UUID,
    ud: Annotated[tuple[User, Dealer], Depends(require_verified_dealer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[dict[str, object]]:
    """List images for a vehicle owned by the caller."""
    _, dealer = ud
    await _get_own_or_404(inventory_id, dealer, db)

    rows = (
        await db.execute(
            select(InventoryImage)
            .where(InventoryImage.inventory_id == inventory_id)
            .order_by(InventoryImage.position)
        )
    ).scalars().all()

    return [
        {
            "id": str(img.id),
            "url": img.url,
            "position": img.position,
            "hidden": img.hidden,
        }
        for img in rows
    ]


@router.post(
    "/{inventory_id}/images",
    status_code=status.HTTP_201_CREATED,
)
async def upload_image(
    inventory_id: uuid.UUID,
    ud: Annotated[tuple[User, Dealer], Depends(require_verified_dealer)],
    db: Annotated[AsyncSession, Depends(get_db)],
    file: UploadFile = File(...),
) -> dict[str, object]:
    """Upload an image. Max 10 images per vehicle, 10MB per file."""
    user, dealer = ud
    await _get_own_or_404(inventory_id, dealer, db)

    # Count existing
    count = (
        await db.execute(
            select(func.count())
            .select_from(InventoryImage)
            .where(InventoryImage.inventory_id == inventory_id)
        )
    ).scalar_one()
    if count >= MAX_IMAGES_PER_VEHICLE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"מקסימום {MAX_IMAGES_PER_VEHICLE} תמונות לרכב",
        )

    # MIME check
    if file.content_type not in ALLOWED_IMAGE_MIME:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="סוג הקובץ אינו נתמך (JPEG / PNG / WebP / HEIC בלבד)",
        )

    # Size check (read once, then upload from buffer)
    contents = await file.read()
    if len(contents) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="הקובץ גדול מדי (מקסימום 10MB)",
        )

    result = await upload_vehicle_image(
        file_bytes=contents,
        dealer_id=str(dealer.id),
        inventory_id=str(inventory_id),
        filename=file.filename or "image",
    )

    # Determine next position
    next_pos = (
        await db.execute(
            select(func.coalesce(func.max(InventoryImage.position), -1))
            .where(InventoryImage.inventory_id == inventory_id)
        )
    ).scalar_one() + 1

    image = InventoryImage(
        inventory_id=inventory_id,
        dealer_id=dealer.id,
        url=result["url"],
        public_id=result["public_id"],
        position=next_pos,
    )
    db.add(image)
    await db.flush()

    await emit_event(
        db,
        event_type="inventory.image.uploaded",
        aggregate_type="inventory",
        aggregate_id=inventory_id,
        payload={
            "dealer_id": str(dealer.id),
            "image_id": str(image.id),
            "position": image.position,
        },
        actor_user_id=user.id,
    )

    await db.commit()
    await db.refresh(image)

    return {
        "id": str(image.id),
        "url": image.url,
        "position": image.position,
    }


@router.patch("/{inventory_id}/images/{image_id}")
async def patch_image(
    inventory_id: uuid.UUID,
    image_id: uuid.UUID,
    payload: ImagePatchRequest,
    ud: Annotated[tuple[User, Dealer], Depends(require_verified_dealer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, object]:
    """Toggle a specific image's `hidden` flag. Owner-only.

    Hidden images stay in the dealer's view but are skipped by the
    marketplace primary-image lookup."""
    _, dealer = ud
    img = await db.get(InventoryImage, image_id)
    if img is None or img.inventory_id != inventory_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="התמונה לא נמצאה"
        )
    if img.dealer_id != dealer.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="אין הרשאה"
        )
    img.hidden = bool(payload.hidden)
    await db.commit()
    return {"id": str(img.id), "hidden": img.hidden}


@router.delete("/{inventory_id}/images/{image_id}")
async def delete_image(
    inventory_id: uuid.UUID,
    image_id: uuid.UUID,
    ud: Annotated[tuple[User, Dealer], Depends(require_verified_dealer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, object]:
    user, dealer = ud

    image = (
        await db.execute(
            select(InventoryImage).where(
                InventoryImage.id == image_id,
                InventoryImage.inventory_id == inventory_id,
                InventoryImage.dealer_id == dealer.id,
            )
        )
    ).scalar_one_or_none()

    if image is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="תמונה לא נמצאה"
        )

    public_id = image.public_id
    await db.delete(image)
    await db.flush()

    await emit_event(
        db,
        event_type="inventory.image.deleted",
        aggregate_type="inventory",
        aggregate_id=inventory_id,
        payload={"dealer_id": str(dealer.id), "image_id": str(image_id)},
        actor_user_id=user.id,
    )

    await db.commit()

    # Best-effort Cloudinary cleanup (after DB commit — survives CDN failures)
    try:
        await delete_vehicle_image(public_id)
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "cloudinary cleanup failed image_id=%s public_id=%s err=%s",
            image_id,
            public_id,
            exc,
        )

    return {"ok": True, "id": str(image_id)}


# ==========================================================================
# Smart lookups — government plate registry + AI image recognition
# ==========================================================================


# TODO Phase 6: replace gov.il price with internal market price calculated
# from our own inventory data (as dealer activity accumulates, our own
# aggregate is more trustworthy than the ministry's average list).
async def _get_govil_price(make: str, model: str, year: int) -> int | None:
    """Best-effort new-car price lookup against the gov.il importers price
    list (resource `39f455bf-…`, dataset `יבואנים ומחירוני רכב חדש`).

    Fields on that resource: tozeret_nm, degem_nm, kinuy_mishari,
    shnat_yitzur, mehir. We take the mean of matching rows, preferring
    rows within ±1 year of the requested year. On any network or parsing
    failure returns None — this is a nice-to-have hint, never blocks the
    plate/image lookup flow.
    """
    import httpx

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://data.gov.il/api/3/action/datastore_search",
                params={
                    "resource_id": "39f455bf-6db0-4926-859d-017f34eacbcb",
                    "q": f"{make} {model}".strip(),
                    "limit": 20,
                },
            )
        if resp.status_code != 200:
            return None
        records = resp.json().get("result", {}).get("records", [])
        if not records:
            return None

        preferred: list[int] = []
        fallback: list[int] = []
        for r in records:
            try:
                price = int(r.get("mehir") or 0)
            except (TypeError, ValueError):
                continue
            if price <= 0:
                continue
            try:
                rec_year = int(r.get("shnat_yitzur") or 0)
            except (TypeError, ValueError):
                rec_year = 0
            fallback.append(price)
            if rec_year == 0 or abs(rec_year - year) <= 1:
                preferred.append(price)

        pool = preferred or fallback
        if not pool:
            return None
        return int(sum(pool) / len(pool))
    except Exception:  # noqa: BLE001
        return None


# ==========================================================================
# Phase 4.3 — pause / unpause
# ==========================================================================


from pydantic import BaseModel as _BM  # noqa: E402


class _PauseBody(_BM):
    hours: int | None = None  # None = indefinite
    reason: str | None = None


@router.post("/{item_id}/pause", response_model=InventoryItemResponse)
async def pause_item(
    item_id: uuid.UUID,
    body: _PauseBody,
    ud: Annotated[tuple[User, Dealer], Depends(require_verified_dealer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> InventoryItemResponse:
    """Pause a vehicle temporarily — hides it from marketplace/B2C until
    paused_until (or until /unpause for indefinite pauses)."""
    from datetime import datetime, timedelta, timezone as _tz

    user, dealer = ud
    item = await _get_own_or_404(item_id, dealer, db)

    if body.hours is not None and (body.hours < 1 or body.hours > 24 * 30):
        raise HTTPException(status_code=400, detail="מספר שעות לא תקין")

    reason = (body.reason or "").strip()[:100] or None

    item.paused_until = (
        datetime.now(tz=_tz.utc) + timedelta(hours=body.hours) if body.hours else None
    )
    item.pause_reason = reason
    item.status = "hidden"

    await emit_event(
        db,
        event_type="inventory.paused",
        aggregate_type="inventory",
        aggregate_id=item.id,
        payload={
            "dealer_id": str(dealer.id),
            "hours": body.hours,
            "reason": reason,
        },
        actor_user_id=user.id,
    )
    await db.commit()
    await db.refresh(item)
    return InventoryItemResponse.model_validate(item)


@router.post("/{item_id}/unpause", response_model=InventoryItemResponse)
async def unpause_item(
    item_id: uuid.UUID,
    ud: Annotated[tuple[User, Dealer], Depends(require_verified_dealer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> InventoryItemResponse:
    user, dealer = ud
    item = await _get_own_or_404(item_id, dealer, db)

    item.paused_until = None
    item.pause_reason = None
    item.status = "active"

    await emit_event(
        db,
        event_type="inventory.unpaused",
        aggregate_type="inventory",
        aggregate_id=item.id,
        payload={"dealer_id": str(dealer.id)},
        actor_user_id=user.id,
    )
    await db.commit()
    await db.refresh(item)
    return InventoryItemResponse.model_validate(item)


# ==========================================================================
# Phase 6.5 — sale closure
# ==========================================================================


@router.post("/{inventory_id}/sell", response_model=SellResponse)
async def sell_item(
    inventory_id: uuid.UUID,
    payload: SellRequest,
    ud: Annotated[tuple[User, Dealer], Depends(require_verified_dealer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SellResponse:
    """Mark an active inventory row as sold.

    Captures sale_price, optional purchase_cost, sold_to (b2b/b2c/external),
    and timestamp. If a B2B Deal exists for this inventory and the supplied
    price differs, the response includes a non-blocking warning."""
    from datetime import datetime, timezone as _tz

    from app.models import Deal

    user, dealer = ud
    item = await db.get(Inventory, inventory_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="רכב לא נמצא")
    if item.dealer_id != dealer.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="אין הרשאה")
    if item.status != "active":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="הרכב כבר סומן כנמכר או מוסתר",
        )

    item.status = "sold"
    item.sale_price = payload.sale_price
    item.sold_at = payload.sold_at or datetime.now(tz=_tz.utc)
    item.sold_to = payload.sold_to
    if payload.purchase_cost is not None:
        item.purchase_cost = payload.purchase_cost

    # Phase 6.8.4 — persist buyer details + trade-in (only the fields the
    # caller actually filled in; nulls otherwise so partial submissions
    # don't blank existing data on a re-sell flow).
    if payload.buyer_name:
        item.buyer_name = payload.buyer_name.strip()
    if payload.buyer_id_number:
        item.buyer_id_number = payload.buyer_id_number
    if payload.buyer_phone:
        item.buyer_phone = payload.buyer_phone.strip()
    item.was_trade_in = payload.was_trade_in
    if payload.was_trade_in:
        item.trade_in_make = payload.trade_in_make
        item.trade_in_model = payload.trade_in_model
        item.trade_in_year = payload.trade_in_year
        item.trade_in_value = payload.trade_in_value
        item.trade_in_plate = payload.trade_in_plate

    warnings: SellWarning | None = None
    if payload.sold_to == "b2b":
        deal = (
            await db.execute(
                select(Deal).where(Deal.inventory_id == inventory_id).limit(1)
            )
        ).scalar_one_or_none()
        if deal is not None and deal.final_price != payload.sale_price:
            warnings = SellWarning(
                deal_price_mismatch={
                    "deal_final_price": int(deal.final_price),
                    "supplied_sale_price": int(payload.sale_price),
                }
            )

    await emit_event(
        db,
        event_type="inventory.sold",
        aggregate_type="inventory",
        aggregate_id=item.id,
        payload={
            "sale_price": payload.sale_price,
            "purchase_cost": item.purchase_cost,
            "sold_to": payload.sold_to,
        },
        actor_user_id=user.id,
    )
    await db.commit()
    await db.refresh(item)

    return SellResponse(
        inventory=InventoryItemResponse.model_validate(item), warnings=warnings
    )


# ==========================================================================
# Phase 6.5 — dealer KPI rollup
# ==========================================================================


@router.get("/lookup/price-hint")
async def lookup_price_hint(
    ud: Annotated[tuple[User, Dealer], Depends(require_verified_dealer)],
    make: str = Query(min_length=1, max_length=100),
    model: str = Query(min_length=1, max_length=100),
    year: int = Query(ge=1900, le=2030),
) -> dict[str, int | None]:
    """Live market-price hint for a given make/model/year.

    Used by the inventory form dialog to display a non-binding hint
    below the price field as the dealer fills in identity fields.
    Never fails — returns `{"price": null}` when nothing is found.
    """
    price = await _get_govil_price(make, model, year)
    return {"price": price}


@router.get("/lookup/plate/{plate_number}")
async def lookup_by_plate(
    plate_number: str,
    ud: Annotated[tuple[User, Dealer], Depends(require_verified_dealer)],
) -> dict[str, object]:
    """Israeli transport-ministry lookup (data.gov.il vehicle registry)."""
    import httpx

    clean = "".join(c for c in plate_number if c.isdigit())
    if len(clean) < 6 or len(clean) > 9:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="מספר רכב לא תקין — יש להזין 6–9 ספרות",
        )

    async with httpx.AsyncClient(timeout=10) as client:
        try:
            resp = await client.get(
                "https://data.gov.il/api/3/action/datastore_search",
                params={
                    "resource_id": "053cea08-09bc-40ec-8f7a-156f0677aff3",
                    "q": clean,
                    "limit": 1,
                },
            )
        except httpx.HTTPError as exc:
            logger.warning("gov plate lookup network error: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="שגיאת רשת בחיפוש מספר הרכב",
            )

    if resp.status_code != 200:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="שגיאה בחיפוש מספר הרכב",
        )

    records = resp.json().get("result", {}).get("records", [])
    if not records:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="מספר רכב לא נמצא ברישומי רשות הרישוי",
        )

    r = records[0]

    # gov.il fuel names → our enum
    fuel_map = {
        "בנזין": "petrol",
        "דיזל": "diesel",
        "חשמלי": "electric",
        "היברידי": "hybrid",
        "גז": "petrol",  # LPG falls back to petrol
    }
    fuel_raw = (r.get("sug_delek_nm") or "").strip()
    fuel_type = fuel_map.get(fuel_raw)

    # The registry's `kinuy_mishari` is "ALFA ROMEO 159" — strip the make prefix
    # so the model field gets just the model name.
    make_he = (r.get("tozeret_nm") or "").strip()
    model_raw = (r.get("kinuy_mishari") or r.get("degem_nm") or "").strip()
    # Remove common English make prefix (case-insensitive) from model if present
    make_prefixes = [make_he.upper(), make_he.split()[0].upper() if make_he else ""]
    model_clean = model_raw
    for prefix in make_prefixes:
        if prefix and model_clean.upper().startswith(prefix):
            model_clean = model_clean[len(prefix):].strip()
            break

    try:
        year_int = int(r.get("shnat_yitzur") or 0)
    except (TypeError, ValueError):
        year_int = 0

    # Market price hint — best-effort, never blocks the response.
    market_price = await _get_govil_price(make_he, model_clean or model_raw, year_int)

    return {
        "make": make_he,
        "model": model_clean or model_raw,
        "year": r.get("shnat_yitzur"),
        "color": (r.get("tzeva_rechev") or "").strip() or None,
        "fuel_type": fuel_type,
        "plate_number": clean,
        "market_price": market_price,
    }


@router.post("/lookup/image")
async def lookup_by_image(
    ud: Annotated[tuple[User, Dealer], Depends(require_verified_dealer)],
    file: UploadFile = File(...),
) -> dict[str, object | None]:
    """Identify a vehicle from a user-supplied image.

    Two-pass strategy:
      1. Claude vision extracts a visual guess (make/model/year/color) AND
         attempts OCR on the license plate, if visible.
      2. If a plausible plate number was extracted (6–9 digits), call the
         gov.il registry — its data is authoritative and overrides the
         visual guess for any field it returns.

    `source` in the response says which path was used:
      * `"plate+vision"` — both succeeded; gov.il fields took priority
      * `"vision"`       — no plate detected (or gov.il lookup failed)
    """
    import base64
    import json as json_stdlib

    import anthropic
    import httpx

    from app.core.config import settings as app_settings

    if not app_settings.anthropic_api_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="שירות זיהוי לא מוגדר",
        )

    if file.content_type not in ALLOWED_IMAGE_MIME:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="סוג קובץ לא נתמך",
        )

    contents = await file.read()
    if len(contents) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="הקובץ גדול מדי (מקסימום 10MB)",
        )

    image_b64 = base64.standard_b64encode(contents).decode("ascii")
    media_type = (
        "image/jpeg" if file.content_type == "image/heic" else file.content_type
    )

    client = anthropic.Anthropic(api_key=app_settings.anthropic_api_key)

    try:
        message = client.messages.create(
            model="claude-opus-4-7",
            max_tokens=400,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": media_type,
                                "data": image_b64,
                            },
                        },
                        {
                            "type": "text",
                            "text": (
                                "Look at this image of a vehicle. Return ONLY a JSON object "
                                "with these fields:\n"
                                "{\n"
                                '  "make": "manufacturer in Hebrew when there is an Israeli market name, otherwise English",\n'
                                '  "model": "model name (Hebrew if applicable, otherwise English)",\n'
                                '  "year": estimated year as integer or null,\n'
                                '  "color": "color in Hebrew",\n'
                                '  "plate_number": "Israeli license plate as digits only (no dashes, no spaces) if you can read it clearly, otherwise null"\n'
                                "}\n"
                                "Israeli plates are 7 or 8 digits, sometimes shown as XX-XXX-XX or XXX-XX-XXX. Strip all non-digits. "
                                "Only return a plate if you can read it with high confidence — do not guess.\n"
                                'If you cannot identify the vehicle at all, return {"make": null, "model": null, "year": null, "color": null, "plate_number": null}.\n'
                                "Return ONLY the JSON, no other text."
                            ),
                        },
                    ],
                }
            ],
        )
    except anthropic.APIError as exc:
        logger.warning("anthropic vision call failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="שירות הזיהוי לא זמין כרגע",
        )

    # First content block is text in the happy path
    text_block = ""
    for block in message.content:
        if getattr(block, "type", None) == "text":
            text_block = block.text
            break

    try:
        # Be tolerant of leading/trailing whitespace or code fences
        cleaned = text_block.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("```")[1]
            if cleaned.startswith("json"):
                cleaned = cleaned[4:]
            cleaned = cleaned.strip()
        parsed = json_stdlib.loads(cleaned)
    except (json_stdlib.JSONDecodeError, IndexError):
        parsed = {
            "make": None,
            "model": None,
            "year": None,
            "color": None,
            "plate_number": None,
        }

    # Normalize the visual pass.
    result: dict[str, object | None] = {
        "make": parsed.get("make") or None,
        "model": parsed.get("model") or None,
        "year": parsed.get("year") if isinstance(parsed.get("year"), int) else None,
        "color": parsed.get("color") or None,
        "fuel_type": None,
        "plate_number": None,
        "source": "vision",
    }

    # Plate OCR + cross-reference. Strip non-digits Claude may have left in.
    plate_raw = parsed.get("plate_number")
    plate_digits = (
        "".join(c for c in str(plate_raw) if c.isdigit()) if plate_raw else ""
    )
    if 6 <= len(plate_digits) <= 9:
        try:
            async with httpx.AsyncClient(timeout=10) as gov:
                resp = await gov.get(
                    "https://data.gov.il/api/3/action/datastore_search",
                    params={
                        "resource_id": "053cea08-09bc-40ec-8f7a-156f0677aff3",
                        "q": plate_digits,
                        "limit": 1,
                    },
                )
            if resp.status_code == 200:
                records = resp.json().get("result", {}).get("records", [])
                if records:
                    r = records[0]
                    fuel_map = {
                        "בנזין": "petrol",
                        "דיזל": "diesel",
                        "חשמלי": "electric",
                        "היברידי": "hybrid",
                        "גז": "petrol",
                    }
                    fuel_raw = (r.get("sug_delek_nm") or "").strip()
                    make_he = (r.get("tozeret_nm") or "").strip()
                    model_raw = (
                        r.get("kinuy_mishari") or r.get("degem_nm") or ""
                    ).strip()
                    make_prefixes = [
                        make_he.upper(),
                        make_he.split()[0].upper() if make_he else "",
                    ]
                    model_clean = model_raw
                    for prefix in make_prefixes:
                        if prefix and model_clean.upper().startswith(prefix):
                            model_clean = model_clean[len(prefix):].strip()
                            break

                    # gov.il is authoritative — overwrite visual fields where
                    # we have a registry value.
                    if make_he:
                        result["make"] = make_he
                    if model_clean or model_raw:
                        result["model"] = model_clean or model_raw
                    year_reg = r.get("shnat_yitzur")
                    try:
                        result["year"] = int(year_reg) if year_reg else result["year"]
                    except (TypeError, ValueError):
                        pass
                    color_reg = (r.get("tzeva_rechev") or "").strip()
                    if color_reg:
                        result["color"] = color_reg
                    fuel_mapped = fuel_map.get(fuel_raw)
                    if fuel_mapped:
                        result["fuel_type"] = fuel_mapped
                    result["plate_number"] = plate_digits
                    result["source"] = "plate+vision"
        except httpx.HTTPError as exc:
            # Plate OCR succeeded but registry was unreachable — keep the
            # visual guess, surface plate so the user can retry the lookup.
            logger.info("gov plate lookup (image-derived) failed: %s", exc)
            result["plate_number"] = plate_digits

    # Market price hint — only if we have all three identity bits.
    if result["make"] and result["model"] and isinstance(result["year"], int):
        result["market_price"] = await _get_govil_price(
            str(result["make"]), str(result["model"]), int(result["year"])
        )
    else:
        result["market_price"] = None

    return result


@router.post("/scan-registration")
async def scan_registration(
    ud: Annotated[tuple[User, Dealer], Depends(require_verified_dealer)],
    file: UploadFile = File(...),
) -> dict[str, object | None]:
    """Extract structured fields from an Israeli vehicle-registration document
    (רישיון רכב) using Claude Vision.

    Accepts JPEG/PNG/WebP/HEIC. Sends the image to Claude with a strict
    prompt that asks for plate, make, model, year, engine_volume,
    fuel_type, color, weight, seats, ownership_type, and license expiry —
    each with a confidence label per field. Falls back to nulls for
    fields it can't read.
    """
    import base64
    import json as json_stdlib

    import anthropic

    from app.core.config import settings as app_settings

    if not app_settings.anthropic_api_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="שירות זיהוי לא מוגדר",
        )

    if file.content_type not in ALLOWED_IMAGE_MIME and file.content_type != "application/pdf":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="סוג קובץ לא נתמך — JPG / PNG / WebP / HEIC / PDF בלבד",
        )

    contents = await file.read()
    if len(contents) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="הקובץ גדול מדי (מקסימום 10MB)",
        )

    image_b64 = base64.standard_b64encode(contents).decode("ascii")
    media_type = (
        "image/jpeg"
        if file.content_type == "image/heic"
        else (file.content_type or "image/jpeg")
    )

    client = anthropic.Anthropic(api_key=app_settings.anthropic_api_key)

    prompt = (
        "This is a scan of an Israeli vehicle registration certificate "
        "(רישיון רכב). Extract every field you can read into JSON.\n\n"
        "Return ONLY this JSON shape — no commentary, no fences:\n"
        "{\n"
        '  "plate_number": "<digits only, no dashes>",\n'
        '  "make": "<manufacturer in Hebrew when applicable>",\n'
        '  "model": "<model name>",\n'
        '  "year": <int year of manufacture or null>,\n'
        '  "engine_volume": <decimal liters e.g. 1.6 or null>,\n'
        '  "fuel_type": "petrol" | "diesel" | "electric" | "hybrid" | null,\n'
        '  "color": "<color in Hebrew>",\n'
        '  "weight_kg": <int kg or null>,\n'
        '  "seats": <int or null>,\n'
        '  "ownership_type": "private" | "dealer" | "leasing" | "rental" | "government" | null,\n'
        '  "expiry_date": "<YYYY-MM-DD or null>",\n'
        '  "confidence": {"<field>": "high"|"medium"|"low", ...}\n'
        "}\n\n"
        "Engine volume in registration is usually labelled נפח מנוע — convert "
        "from cm³ to liters (1600 → 1.6). For fuel: בנזין=petrol, דיזל=diesel, "
        "חשמלי=electric, היברידי=hybrid. For ownership: פרטי=private, סוחר=dealer, "
        "ליסינג=leasing, השכרה=rental, ממשלתי/רשות=government. "
        "Plate digits only (strip dashes/spaces). "
        "Return null for any field you cannot read confidently."
    )

    try:
        message = client.messages.create(
            model="claude-opus-4-7",
            max_tokens=600,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": media_type,
                                "data": image_b64,
                            },
                        },
                        {"type": "text", "text": prompt},
                    ],
                }
            ],
        )
    except anthropic.APIError as exc:
        logger.warning("anthropic registration scan failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="שירות הסריקה לא זמין כרגע",
        )

    text_block = ""
    for block in message.content:
        if getattr(block, "type", None) == "text":
            text_block = block.text
            break

    cleaned = text_block.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("```")[1]
        if cleaned.startswith("json"):
            cleaned = cleaned[4:]
        cleaned = cleaned.strip()
    try:
        parsed = json_stdlib.loads(cleaned)
    except json_stdlib.JSONDecodeError:
        parsed = {}

    def _coerce_int(v: object) -> int | None:
        try:
            return int(v) if v is not None else None
        except (TypeError, ValueError):
            return None

    def _coerce_float(v: object) -> float | None:
        try:
            return float(v) if v is not None else None
        except (TypeError, ValueError):
            return None

    fuel = parsed.get("fuel_type")
    if fuel not in ("petrol", "diesel", "electric", "hybrid"):
        fuel = None

    ownership = parsed.get("ownership_type")
    if ownership not in ("private", "dealer", "leasing", "rental", "government"):
        ownership = None

    plate_raw = parsed.get("plate_number")
    plate_digits = "".join(c for c in str(plate_raw) if c.isdigit()) if plate_raw else None
    if plate_digits and not (6 <= len(plate_digits) <= 9):
        plate_digits = None

    confidence = parsed.get("confidence")
    if not isinstance(confidence, dict):
        confidence = {}

    return {
        "plate_number": plate_digits,
        "make": (parsed.get("make") or None),
        "model": (parsed.get("model") or None),
        "year": _coerce_int(parsed.get("year")),
        "engine_volume": _coerce_float(parsed.get("engine_volume")),
        "fuel_type": fuel,
        "color": (parsed.get("color") or None),
        "weight_kg": _coerce_int(parsed.get("weight_kg")),
        "seats": _coerce_int(parsed.get("seats")),
        "ownership_type": ownership,
        "expiry_date": (parsed.get("expiry_date") or None),
        "confidence": confidence,
    }
