"""Dealer inventory endpoints.

All routes require a verified dealer. Every query is scoped by
`dealer.id` in Python — the backend uses the service-role DB
connection so RLS is not the authoritative gate here.
"""

from __future__ import annotations

import math
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_verified_dealer
from app.core.events import emit_event
from app.core.logging import get_logger
from app.database import get_db
from app.models import Dealer, Inventory, User
from app.schemas.inventory import (
    InventoryItemCreate,
    InventoryItemResponse,
    InventoryItemUpdate,
    InventoryListResponse,
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
