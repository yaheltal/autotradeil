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
    InventoryItemCreate,
    InventoryItemResponse,
    InventoryItemUpdate,
    InventoryListResponse,
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


@router.get("", response_model=InventoryListResponse)
async def list_inventory(
    ud: Annotated[tuple[User, Dealer], Depends(require_verified_dealer)],
    db: Annotated[AsyncSession, Depends(get_db)],
    status_filter: str | None = Query(default=None, alias="status"),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
) -> InventoryListResponse:
    _, dealer = ud

    base_q = select(Inventory).where(Inventory.dealer_id == dealer.id)
    count_q = (
        select(func.count()).select_from(Inventory).where(Inventory.dealer_id == dealer.id)
    )

    if status_filter in {"active", "sold", "hidden"}:
        base_q = base_q.where(Inventory.status == status_filter)
        count_q = count_q.where(Inventory.status == status_filter)

    total = (await db.execute(count_q)).scalar_one()

    base_q = (
        base_q.order_by(Inventory.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    rows = (await db.execute(base_q)).scalars().all()

    items = [InventoryItemResponse.model_validate(r) for r in rows]
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
        {"id": str(img.id), "url": img.url, "position": img.position} for img in rows
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
