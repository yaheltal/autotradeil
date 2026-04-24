"""B2B marketplace endpoints (Phase 4.1).

Routes (all require a verified dealer):

    GET  /api/v1/marketplace/search           — paginated browse with filters
    GET  /api/v1/marketplace/vehicles/{id}    — vehicle detail + seller info
    POST /api/v1/marketplace/vehicles/{id}/offers      — submit an offer
    GET  /api/v1/marketplace/offers/received  — offers I need to act on
    GET  /api/v1/marketplace/offers/sent      — offers I sent
    POST /api/v1/marketplace/offers/{id}/accept
    POST /api/v1/marketplace/offers/{id}/reject
    POST /api/v1/marketplace/offers/{id}/counter
    POST /api/v1/marketplace/offers/{id}/cancel

    GET  /api/v1/notifications                — dealer inbox
    POST /api/v1/notifications/{id}/read
    POST /api/v1/notifications/read-all

State machine (offers):

    pending   → accepted | rejected | countered | cancelled
    countered → accepted | rejected | countered | cancelled
    (terminal: accepted, rejected, cancelled)

The state transition rules consider WHO is acting:
    - seller can accept/reject/counter a pending-from-buyer or
      countered-from-buyer offer
    - buyer can accept/reject/counter a countered-from-seller offer
    - either side can cancel their own side's outstanding offer
"""

from __future__ import annotations

import math
import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_verified_dealer
from app.core.email import (
    send_counter_offer,
    send_deal_completed_buyer,
    send_deal_completed_seller,
    send_offer_accepted,
    send_offer_received,
    send_offer_rejected,
)
from app.core.trust import recalculate_trust_score
from app.core.events import emit_event
from app.core.logging import get_logger
from app.database import get_db
from app.models import (
    Deal,
    Dealer,
    Inventory,
    InventoryImage,
    Notification,
    Offer,
    User,
)
from app.schemas.marketplace import (
    CounterOfferCreate,
    DealerPublicProfile,
    DealListResponse,
    DealResponse,
    MarketplaceSellerInfo,
    MarketplaceVehicleDetail,
    MarketplaceVehicleImage,
    NotificationListResponse,
    NotificationResponse,
    OfferCreate,
    OfferDealerSummary,
    OfferListResponse,
    OfferResponse,
    OfferVehicleSummary,
    VehicleSearchResponse,
    VehicleSearchResult,
)

logger = get_logger(__name__)

marketplace_router = APIRouter(prefix="/api/v1/marketplace", tags=["marketplace"])
notifications_router = APIRouter(
    prefix="/api/v1/notifications", tags=["notifications"]
)


# =============================================================================
# Helpers
# =============================================================================


async def _primary_image_url_for(
    inventory_id: uuid.UUID, db: AsyncSession
) -> str | None:
    row = (
        await db.execute(
            select(InventoryImage.url)
            .where(InventoryImage.inventory_id == inventory_id)
            .order_by(InventoryImage.position)
            .limit(1)
        )
    ).scalar_one_or_none()
    return row


async def _primary_images_bulk(
    inventory_ids: list[uuid.UUID], db: AsyncSession
) -> dict[uuid.UUID, str]:
    """Return a mapping of inventory_id → lowest-position image url for the
    listed ids. Issues one query."""
    if not inventory_ids:
        return {}

    # Correlated subquery: for each inventory_id, pick the image with the
    # lowest `position` value.
    inner = (
        select(
            InventoryImage.inventory_id,
            InventoryImage.url,
            func.row_number()
            .over(
                partition_by=InventoryImage.inventory_id,
                order_by=InventoryImage.position,
            )
            .label("rn"),
        )
        .where(InventoryImage.inventory_id.in_(inventory_ids))
        .subquery()
    )

    stmt = select(inner.c.inventory_id, inner.c.url).where(inner.c.rn == 1)
    rows = (await db.execute(stmt)).all()
    return {row.inventory_id: row.url for row in rows}


async def _notify(
    db: AsyncSession,
    dealer_id: uuid.UUID,
    type_: str,
    title: str,
    body: str,
    data: dict[str, Any] | None = None,
) -> Notification:
    n = Notification(
        dealer_id=dealer_id,
        type=type_,
        title=title,
        body=body,
        data=data,
    )
    db.add(n)
    await db.flush()
    return n


async def _load_offer_context(
    offer_id: uuid.UUID,
    db: AsyncSession,
) -> tuple[Offer, Inventory, Dealer, Dealer, User, User] | None:
    """Load the offer + related rows in one shot. Returns None if the offer
    does not exist. Order: (offer, vehicle, buyer_dealer, seller_dealer,
    buyer_user, seller_user)."""
    offer = (
        await db.execute(select(Offer).where(Offer.id == offer_id))
    ).scalar_one_or_none()
    if offer is None:
        return None

    vehicle = (
        await db.execute(select(Inventory).where(Inventory.id == offer.inventory_id))
    ).scalar_one()
    buyer_dealer = (
        await db.execute(select(Dealer).where(Dealer.id == offer.buyer_dealer_id))
    ).scalar_one()
    seller_dealer = (
        await db.execute(select(Dealer).where(Dealer.id == offer.seller_dealer_id))
    ).scalar_one()
    buyer_user = (
        await db.execute(select(User).where(User.id == buyer_dealer.user_id))
    ).scalar_one()
    seller_user = (
        await db.execute(select(User).where(User.id == seller_dealer.user_id))
    ).scalar_one()

    return offer, vehicle, buyer_dealer, seller_dealer, buyer_user, seller_user


def _offer_response(
    offer: Offer,
    vehicle: Inventory,
    buyer: Dealer,
    seller: Dealer,
    primary_image_url: str | None,
) -> OfferResponse:
    return OfferResponse(
        id=offer.id,
        inventory_id=offer.inventory_id,
        buyer_dealer_id=offer.buyer_dealer_id,
        seller_dealer_id=offer.seller_dealer_id,
        offered_price=offer.offered_price,
        message=offer.message,
        status=offer.status,
        counter_price=offer.counter_price,
        counter_message=offer.counter_message,
        created_at=offer.created_at,
        updated_at=offer.updated_at,
        vehicle=OfferVehicleSummary(
            id=vehicle.id,
            make=vehicle.make,
            model=vehicle.model,
            year=vehicle.year,
            primary_image_url=primary_image_url,
        ),
        buyer=OfferDealerSummary(
            id=buyer.id,
            business_name=buyer.business_name,
            city=buyer.city,
            tier=buyer.tier,
        ),
        seller=OfferDealerSummary(
            id=seller.id,
            business_name=seller.business_name,
            city=seller.city,
            tier=seller.tier,
        ),
    )


# =============================================================================
# Search
# =============================================================================


@marketplace_router.get("/search", response_model=VehicleSearchResponse)
async def search_vehicles(
    ud: Annotated[tuple[User, Dealer], Depends(require_verified_dealer)],
    db: Annotated[AsyncSession, Depends(get_db)],
    q: str | None = Query(default=None, max_length=200),
    make: str | None = Query(default=None, max_length=100),
    model: str | None = Query(default=None, max_length=100),
    year_min: int | None = Query(default=None, ge=1900, le=2030),
    year_max: int | None = Query(default=None, ge=1900, le=2030),
    price_min: int | None = Query(default=None, ge=0),
    price_max: int | None = Query(default=None, ge=0),
    mileage_max: int | None = Query(default=None, ge=0),
    transmission: str | None = Query(default=None, pattern="^(automatic|manual)$"),
    fuel_type: str | None = Query(
        default=None, pattern="^(petrol|diesel|electric|hybrid)$"
    ),
    city: str | None = Query(default=None, max_length=100),
    seller_dealer_id: uuid.UUID | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=50),
) -> VehicleSearchResponse:
    """Browse the B2B marketplace. Returns only vehicles published as B2B
    (is_b2b=true, status='active') and excludes the caller's own inventory."""
    _, caller_dealer = ud

    from datetime import datetime, timezone as _tz

    now = datetime.now(tz=_tz.utc)
    conds = [
        Inventory.visibility.in_(["b2b", "both"]),
        Inventory.status == "active",
        Inventory.dealer_id != caller_dealer.id,
        # Filter out paused items — either paused_until is NULL-and-not-paused
        # (caller is looking at active rows only, so status=active is already
        # the authoritative gate) OR paused_until has passed. We include the
        # check as belt-and-suspenders so a race on auto-unpause doesn't leak.
        (Inventory.paused_until.is_(None)) | (Inventory.paused_until <= now),
    ]
    if seller_dealer_id:
        conds.append(Inventory.dealer_id == seller_dealer_id)

    if q:
        needle = f"%{q.strip()}%"
        conds.append(
            or_(
                Inventory.make.ilike(needle),
                Inventory.model.ilike(needle),
                Inventory.notes.ilike(needle),
            )
        )
    if make:
        conds.append(Inventory.make == make)
    if model:
        conds.append(Inventory.model == model)
    if year_min is not None:
        conds.append(Inventory.year >= year_min)
    if year_max is not None:
        conds.append(Inventory.year <= year_max)
    if price_min is not None:
        conds.append(
            func.coalesce(Inventory.b2b_price, Inventory.price) >= price_min
        )
    if price_max is not None:
        conds.append(
            func.coalesce(Inventory.b2b_price, Inventory.price) <= price_max
        )
    if mileage_max is not None:
        conds.append(Inventory.mileage <= mileage_max)
    if transmission:
        conds.append(Inventory.transmission == transmission)
    if fuel_type:
        conds.append(Inventory.fuel_type == fuel_type)
    if city:
        conds.append(Dealer.city == city)

    count_stmt = (
        select(func.count())
        .select_from(Inventory)
        .join(Dealer, Dealer.id == Inventory.dealer_id)
        .where(and_(*conds))
    )
    total = (await db.execute(count_stmt)).scalar_one()

    rows_stmt = (
        select(Inventory, Dealer)
        .join(Dealer, Dealer.id == Inventory.dealer_id)
        .where(and_(*conds))
        .order_by(Inventory.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    rows = (await db.execute(rows_stmt)).all()

    inv_ids = [r[0].id for r in rows]
    primary_images = await _primary_images_bulk(inv_ids, db)

    items = [
        VehicleSearchResult(
            id=inv.id,
            make=inv.make,
            model=inv.model,
            year=inv.year,
            mileage=inv.mileage,
            price=inv.price,
            b2b_price=inv.b2b_price,
            color=inv.color,
            transmission=inv.transmission,
            fuel_type=inv.fuel_type,
            engine_volume=inv.engine_volume,
            seller_dealer_id=dealer.id,
            seller_business_name=dealer.business_name,
            seller_city=dealer.city,
            seller_tier=dealer.tier,
            primary_image_url=primary_images.get(inv.id),
            created_at=inv.created_at,
        )
        for inv, dealer in rows
    ]

    pages = math.ceil(total / per_page) if total > 0 else 1

    return VehicleSearchResponse(
        items=items, total=total, page=page, pages=pages, per_page=per_page
    )


# =============================================================================
# Vehicle detail
# =============================================================================


@marketplace_router.get(
    "/vehicles/{inventory_id}", response_model=MarketplaceVehicleDetail
)
async def get_vehicle_detail(
    inventory_id: uuid.UUID,
    ud: Annotated[tuple[User, Dealer], Depends(require_verified_dealer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MarketplaceVehicleDetail:
    _, caller_dealer = ud

    row = (
        await db.execute(
            select(Inventory, Dealer)
            .join(Dealer, Dealer.id == Inventory.dealer_id)
            .where(Inventory.id == inventory_id)
        )
    ).first()

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="רכב לא נמצא",
        )

    inv, seller = row

    # Must be B2B-published AND not caller's own — unless caller IS the seller.
    if seller.id != caller_dealer.id:
        if inv.visibility not in ("b2b", "both") or inv.status != "active":
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="רכב לא נמצא",
            )
        # Track the view (skip if the seller is viewing their own listing).
        from app.models import InventoryView

        db.add(
            InventoryView(
                inventory_id=inv.id,
                viewer_dealer_id=caller_dealer.id,
                source="marketplace",
            )
        )
        seller.total_views = (seller.total_views or 0) + 1
        await db.commit()

    seller_user = (
        await db.execute(select(User).where(User.id == seller.user_id))
    ).scalar_one()

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

    return MarketplaceVehicleDetail(
        id=inv.id,
        make=inv.make,
        model=inv.model,
        year=inv.year,
        mileage=inv.mileage,
        price=inv.price,
        b2b_price=inv.b2b_price,
        color=inv.color,
        transmission=inv.transmission,
        fuel_type=inv.fuel_type,
        engine_volume=inv.engine_volume,
        notes=inv.notes,
        status=inv.status,
        created_at=inv.created_at,
        seller=MarketplaceSellerInfo(
            id=seller.id,
            business_name=seller.business_name,
            contact_name=seller.contact_name,
            city=seller.city,
            phone=seller.phone,
            email=seller_user.email,
            tier=seller.tier,
            deals_completed=seller.deals_completed,
        ),
        images=[
            MarketplaceVehicleImage(id=img.id, url=img.url, position=img.position)
            for img in images
        ],
    )


# =============================================================================
# Offers — create
# =============================================================================


@marketplace_router.post(
    "/vehicles/{inventory_id}/offers",
    response_model=OfferResponse,
    status_code=status.HTTP_201_CREATED,
)
async def make_offer(
    inventory_id: uuid.UUID,
    payload: OfferCreate,
    ud: Annotated[tuple[User, Dealer], Depends(require_verified_dealer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OfferResponse:
    user, buyer = ud

    vehicle = (
        await db.execute(select(Inventory).where(Inventory.id == inventory_id))
    ).scalar_one_or_none()
    if vehicle is None:
        raise HTTPException(status_code=404, detail="רכב לא נמצא")

    if vehicle.visibility not in ("b2b", "both") or vehicle.status != "active":
        raise HTTPException(
            status_code=400, detail="הרכב אינו זמין בשוק הסיטונאי"
        )

    if vehicle.dealer_id == buyer.id:
        raise HTTPException(
            status_code=400, detail="לא ניתן להציע הצעה על רכב ממלאי שלך"
        )

    # Block if there's already an open (non-terminal) offer between this buyer
    # and this vehicle — prevents noise.
    existing = (
        await db.execute(
            select(Offer).where(
                Offer.inventory_id == inventory_id,
                Offer.buyer_dealer_id == buyer.id,
                Offer.status.in_(["pending", "countered"]),
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(
            status_code=400,
            detail="קיימת כבר הצעה פתוחה לרכב הזה",
        )

    seller = (
        await db.execute(select(Dealer).where(Dealer.id == vehicle.dealer_id))
    ).scalar_one()
    seller_user = (
        await db.execute(select(User).where(User.id == seller.user_id))
    ).scalar_one()

    offer = Offer(
        inventory_id=inventory_id,
        buyer_dealer_id=buyer.id,
        seller_dealer_id=seller.id,
        offered_price=payload.offered_price,
        message=payload.message,
        status="pending",
    )
    db.add(offer)
    await db.flush()

    # Phase 4.2: bump trust counters
    buyer.offers_sent = (buyer.offers_sent or 0) + 1
    seller.offers_received = (seller.offers_received or 0) + 1
    await db.flush()
    await recalculate_trust_score(buyer.id, db)
    await recalculate_trust_score(seller.id, db)

    veh_line = f"{vehicle.make} {vehicle.model} {vehicle.year}"

    await _notify(
        db,
        seller.id,
        type_="offer.received",
        title=f"הצעה חדשה: {veh_line}",
        body=f"{buyer.business_name} הציע {payload.offered_price:,} ₪",
        data={
            "offer_id": str(offer.id),
            "inventory_id": str(inventory_id),
            "buyer_dealer_id": str(buyer.id),
            "offered_price": payload.offered_price,
        },
    )

    await emit_event(
        db,
        event_type="offer.created",
        aggregate_type="offer",
        aggregate_id=offer.id,
        payload={
            "inventory_id": str(inventory_id),
            "buyer_dealer_id": str(buyer.id),
            "seller_dealer_id": str(seller.id),
            "offered_price": payload.offered_price,
        },
        actor_user_id=user.id,
    )

    await db.commit()
    await db.refresh(offer)

    # Best-effort email (after commit)
    try:
        await send_offer_received(
            to_email=seller_user.email,
            seller_business_name=seller.business_name,
            buyer_business_name=buyer.business_name,
            vehicle={"make": vehicle.make, "model": vehicle.model, "year": vehicle.year},
            offered_price=payload.offered_price,
            message=payload.message,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("offer.received email failed: %s", exc)

    primary = await _primary_image_url_for(inventory_id, db)
    return _offer_response(offer, vehicle, buyer, seller, primary)


# =============================================================================
# Offers — list
# =============================================================================


async def _list_offers(
    *,
    db: AsyncSession,
    direction: str,  # "received" | "sent"
    dealer_id: uuid.UUID,
    status_filter: str | None,
    page: int,
    per_page: int,
) -> OfferListResponse:
    conds = []
    if direction == "received":
        conds.append(Offer.seller_dealer_id == dealer_id)
    else:
        conds.append(Offer.buyer_dealer_id == dealer_id)

    if status_filter:
        conds.append(Offer.status == status_filter)

    count_stmt = select(func.count()).select_from(Offer).where(and_(*conds))
    total = (await db.execute(count_stmt)).scalar_one()

    stmt = (
        select(Offer)
        .where(and_(*conds))
        .order_by(Offer.updated_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    offers = (await db.execute(stmt)).scalars().all()

    if not offers:
        return OfferListResponse(
            items=[], total=0, page=page, pages=1, per_page=per_page
        )

    # Bulk-fetch related rows.
    inv_ids = list({o.inventory_id for o in offers})
    buyer_ids = list({o.buyer_dealer_id for o in offers})
    seller_ids = list({o.seller_dealer_id for o in offers})
    dealer_ids = list(set(buyer_ids) | set(seller_ids))

    vehicles = {
        v.id: v
        for v in (
            (await db.execute(select(Inventory).where(Inventory.id.in_(inv_ids))))
            .scalars()
            .all()
        )
    }
    dealers = {
        d.id: d
        for d in (
            (await db.execute(select(Dealer).where(Dealer.id.in_(dealer_ids))))
            .scalars()
            .all()
        )
    }
    primary_images = await _primary_images_bulk(inv_ids, db)

    items = []
    for o in offers:
        veh = vehicles.get(o.inventory_id)
        buyer = dealers.get(o.buyer_dealer_id)
        seller = dealers.get(o.seller_dealer_id)
        if veh is None or buyer is None or seller is None:
            continue
        items.append(
            _offer_response(o, veh, buyer, seller, primary_images.get(veh.id))
        )

    pages = math.ceil(total / per_page) if total > 0 else 1
    return OfferListResponse(
        items=items, total=total, page=page, pages=pages, per_page=per_page
    )


@marketplace_router.get("/offers/received", response_model=OfferListResponse)
async def list_offers_received(
    ud: Annotated[tuple[User, Dealer], Depends(require_verified_dealer)],
    db: Annotated[AsyncSession, Depends(get_db)],
    status_filter: str | None = Query(default=None, alias="status"),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=50),
) -> OfferListResponse:
    _, dealer = ud
    return await _list_offers(
        db=db,
        direction="received",
        dealer_id=dealer.id,
        status_filter=status_filter,
        page=page,
        per_page=per_page,
    )


@marketplace_router.get("/offers/sent", response_model=OfferListResponse)
async def list_offers_sent(
    ud: Annotated[tuple[User, Dealer], Depends(require_verified_dealer)],
    db: Annotated[AsyncSession, Depends(get_db)],
    status_filter: str | None = Query(default=None, alias="status"),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=50),
) -> OfferListResponse:
    _, dealer = ud
    return await _list_offers(
        db=db,
        direction="sent",
        dealer_id=dealer.id,
        status_filter=status_filter,
        page=page,
        per_page=per_page,
    )


# =============================================================================
# Offers — actions
# =============================================================================


def _require_involved(offer: Offer, dealer: Dealer) -> str:
    """Return 'buyer' or 'seller' if the dealer is involved; raise 403 otherwise."""
    if offer.buyer_dealer_id == dealer.id:
        return "buyer"
    if offer.seller_dealer_id == dealer.id:
        return "seller"
    raise HTTPException(status_code=403, detail="אין גישה להצעה זו")


def _action_allowed(
    offer: Offer,
    caller_role: str,  # "buyer" | "seller"
    action: str,  # "accept" | "reject" | "counter" | "cancel"
) -> bool:
    """Enforce the state machine:

    * pending  (from buyer to seller):
        - seller may accept / reject / counter
        - buyer  may cancel
    * countered:
        `offers.status='countered'` means a counter-offer is outstanding. To
        know which side owes a response we look at `counter_price` — if set,
        the LAST mover was the seller (buyer owes response) OR the last mover
        was the buyer responding with a re-counter (seller owes response).

        Since we overwrite counter_price each round, the heuristic simplifies:
        treat 'countered' as fully symmetric — either side may accept/reject/
        re-counter/cancel. Simpler + matches the product spec of "it's a
        negotiation".
    * terminal (accepted/rejected/cancelled): nothing allowed.
    """
    if offer.status in {"accepted", "rejected", "cancelled"}:
        return False

    if offer.status == "pending":
        if caller_role == "seller":
            return action in {"accept", "reject", "counter"}
        # buyer on pending: can only cancel
        return action == "cancel"

    if offer.status == "countered":
        # symmetric — either side can close it out or re-counter
        return action in {"accept", "reject", "counter", "cancel"}

    return False


@marketplace_router.post("/offers/{offer_id}/accept", response_model=OfferResponse)
async def accept_offer(
    offer_id: uuid.UUID,
    ud: Annotated[tuple[User, Dealer], Depends(require_verified_dealer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OfferResponse:
    user, dealer = ud
    loaded = await _load_offer_context(offer_id, db)
    if loaded is None:
        raise HTTPException(status_code=404, detail="הצעה לא נמצאה")
    offer, vehicle, buyer, seller, buyer_user, seller_user = loaded

    role = _require_involved(offer, dealer)
    if not _action_allowed(offer, role, "accept"):
        raise HTTPException(status_code=400, detail="פעולה אינה חוקית במצב הנוכחי")

    # When seller accepts a pending offer, the agreed price = offered_price.
    # When either side accepts a countered offer, the agreed price = counter_price.
    if offer.status == "pending":
        agreed_price = offer.offered_price
    else:  # countered
        agreed_price = offer.counter_price or offer.offered_price

    offer.status = "accepted"
    await db.flush()

    # Notification goes to the OTHER side (the one who didn't click accept).
    other_dealer = buyer if role == "seller" else seller
    other_user = buyer_user if role == "seller" else seller_user
    veh_line = f"{vehicle.make} {vehicle.model} {vehicle.year}"

    await _notify(
        db,
        other_dealer.id,
        type_="offer.accepted",
        title=f"ההצעה אושרה: {veh_line}",
        body=f"מחיר מוסכם: {agreed_price:,} ₪",
        data={"offer_id": str(offer.id), "inventory_id": str(vehicle.id)},
    )

    await emit_event(
        db,
        event_type="offer.accepted",
        aggregate_type="offer",
        aggregate_id=offer.id,
        payload={"by_role": role, "agreed_price": agreed_price},
        actor_user_id=user.id,
    )

    await db.commit()
    await db.refresh(offer)

    # Best-effort email — notify the counterparty
    try:
        # The accepted email is always aimed at the buyer (who wins the car),
        # regardless of who clicked accept.
        await send_offer_accepted(
            to_email=buyer_user.email,
            buyer_business_name=buyer.business_name,
            seller_business_name=seller.business_name,
            vehicle={"make": vehicle.make, "model": vehicle.model, "year": vehicle.year},
            offered_price=agreed_price,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("offer.accepted email failed: %s", exc)

    primary = await _primary_image_url_for(vehicle.id, db)
    return _offer_response(offer, vehicle, buyer, seller, primary)


@marketplace_router.post("/offers/{offer_id}/reject", response_model=OfferResponse)
async def reject_offer(
    offer_id: uuid.UUID,
    ud: Annotated[tuple[User, Dealer], Depends(require_verified_dealer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OfferResponse:
    user, dealer = ud
    loaded = await _load_offer_context(offer_id, db)
    if loaded is None:
        raise HTTPException(status_code=404, detail="הצעה לא נמצאה")
    offer, vehicle, buyer, seller, buyer_user, seller_user = loaded

    role = _require_involved(offer, dealer)
    if not _action_allowed(offer, role, "reject"):
        raise HTTPException(status_code=400, detail="פעולה אינה חוקית במצב הנוכחי")

    offer.status = "rejected"
    await db.flush()

    other_dealer = buyer if role == "seller" else seller
    other_user = buyer_user if role == "seller" else seller_user
    veh_line = f"{vehicle.make} {vehicle.model} {vehicle.year}"

    # Notify the BUYER (the one whose money isn't moving). If the buyer
    # rejected a seller counter, we notify the seller instead.
    await _notify(
        db,
        other_dealer.id,
        type_="offer.rejected",
        title=f"ההצעה נדחתה: {veh_line}",
        body=f"רכב: {veh_line}",
        data={"offer_id": str(offer.id), "inventory_id": str(vehicle.id)},
    )

    await emit_event(
        db,
        event_type="offer.rejected",
        aggregate_type="offer",
        aggregate_id=offer.id,
        payload={"by_role": role},
        actor_user_id=user.id,
    )

    await db.commit()
    await db.refresh(offer)

    try:
        await send_offer_rejected(
            to_email=other_user.email,
            buyer_business_name=other_dealer.business_name,
            seller_business_name=dealer.business_name,
            vehicle={"make": vehicle.make, "model": vehicle.model, "year": vehicle.year},
            offered_price=offer.counter_price or offer.offered_price,
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("offer.rejected email failed: %s", exc)

    primary = await _primary_image_url_for(vehicle.id, db)
    return _offer_response(offer, vehicle, buyer, seller, primary)


@marketplace_router.post("/offers/{offer_id}/counter", response_model=OfferResponse)
async def counter_offer(
    offer_id: uuid.UUID,
    payload: CounterOfferCreate,
    ud: Annotated[tuple[User, Dealer], Depends(require_verified_dealer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OfferResponse:
    user, dealer = ud
    loaded = await _load_offer_context(offer_id, db)
    if loaded is None:
        raise HTTPException(status_code=404, detail="הצעה לא נמצאה")
    offer, vehicle, buyer, seller, buyer_user, seller_user = loaded

    role = _require_involved(offer, dealer)
    if not _action_allowed(offer, role, "counter"):
        raise HTTPException(status_code=400, detail="פעולה אינה חוקית במצב הנוכחי")

    previous_price = offer.counter_price or offer.offered_price
    offer.status = "countered"
    offer.counter_price = payload.counter_price
    offer.counter_message = payload.counter_message
    await db.flush()

    # Notify the OTHER side (they need to respond).
    other_dealer = buyer if role == "seller" else seller
    other_user = buyer_user if role == "seller" else seller_user
    veh_line = f"{vehicle.make} {vehicle.model} {vehicle.year}"

    await _notify(
        db,
        other_dealer.id,
        type_="offer.countered",
        title=f"הצעה נגדית: {veh_line}",
        body=f"{dealer.business_name}: {payload.counter_price:,} ₪",
        data={
            "offer_id": str(offer.id),
            "inventory_id": str(vehicle.id),
            "counter_price": payload.counter_price,
        },
    )

    await emit_event(
        db,
        event_type="offer.countered",
        aggregate_type="offer",
        aggregate_id=offer.id,
        payload={
            "by_role": role,
            "counter_price": payload.counter_price,
            "previous_price": previous_price,
        },
        actor_user_id=user.id,
    )

    await db.commit()
    await db.refresh(offer)

    try:
        await send_counter_offer(
            to_email=other_user.email,
            recipient_business_name=other_dealer.business_name,
            from_business_name=dealer.business_name,
            vehicle={"make": vehicle.make, "model": vehicle.model, "year": vehicle.year},
            original_price=previous_price,
            counter_price=payload.counter_price,
            counter_message=payload.counter_message,
            role=("buyer" if other_dealer.id == buyer.id else "seller"),
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("offer.countered email failed: %s", exc)

    primary = await _primary_image_url_for(vehicle.id, db)
    return _offer_response(offer, vehicle, buyer, seller, primary)


@marketplace_router.post("/offers/{offer_id}/cancel", response_model=OfferResponse)
async def cancel_offer(
    offer_id: uuid.UUID,
    ud: Annotated[tuple[User, Dealer], Depends(require_verified_dealer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OfferResponse:
    user, dealer = ud
    loaded = await _load_offer_context(offer_id, db)
    if loaded is None:
        raise HTTPException(status_code=404, detail="הצעה לא נמצאה")
    offer, vehicle, buyer, seller, buyer_user, seller_user = loaded

    role = _require_involved(offer, dealer)
    if not _action_allowed(offer, role, "cancel"):
        raise HTTPException(status_code=400, detail="פעולה אינה חוקית במצב הנוכחי")

    was_accepted = offer.status == "accepted"
    offer.status = "cancelled"
    await db.flush()

    # Phase 4.2: if cancel happens after accept (i.e. backing out of a deal),
    # apply the cancellation penalty to BOTH parties. Plain cancels of
    # pending/countered offers don't count as broken deals.
    if was_accepted:
        buyer.deals_cancelled = (buyer.deals_cancelled or 0) + 1
        seller.deals_cancelled = (seller.deals_cancelled or 0) + 1
        await db.flush()
        await recalculate_trust_score(buyer.id, db)
        await recalculate_trust_score(seller.id, db)

    await emit_event(
        db,
        event_type="offer.cancelled",
        aggregate_type="offer",
        aggregate_id=offer.id,
        payload={"by_role": role, "was_accepted": was_accepted},
        actor_user_id=user.id,
    )

    await db.commit()
    await db.refresh(offer)

    primary = await _primary_image_url_for(vehicle.id, db)
    return _offer_response(offer, vehicle, buyer, seller, primary)


# =============================================================================
# Notifications
# =============================================================================


@notifications_router.get("", response_model=NotificationListResponse)
async def list_notifications(
    ud: Annotated[tuple[User, Dealer], Depends(require_verified_dealer)],
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = Query(default=30, ge=1, le=100),
) -> NotificationListResponse:
    _, dealer = ud

    stmt = (
        select(Notification)
        .where(Notification.dealer_id == dealer.id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
    )
    rows = (await db.execute(stmt)).scalars().all()

    unread_stmt = (
        select(func.count())
        .select_from(Notification)
        .where(
            Notification.dealer_id == dealer.id,
            Notification.read_at.is_(None),
        )
    )
    unread = (await db.execute(unread_stmt)).scalar_one()

    return NotificationListResponse(
        items=[NotificationResponse.model_validate(r) for r in rows],
        unread_count=unread,
    )


@notifications_router.post("/{notification_id}/read")
async def mark_notification_read(
    notification_id: uuid.UUID,
    ud: Annotated[tuple[User, Dealer], Depends(require_verified_dealer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, object]:
    _, dealer = ud

    row = (
        await db.execute(
            select(Notification).where(
                Notification.id == notification_id,
                Notification.dealer_id == dealer.id,
            )
        )
    ).scalar_one_or_none()

    if row is None:
        raise HTTPException(status_code=404, detail="התראה לא נמצאה")

    if row.read_at is None:
        row.read_at = func.now()  # type: ignore[assignment]
        await db.commit()

    return {"ok": True, "id": str(notification_id)}


# =============================================================================
# Phase 4.2 — deal closing (double-confirmation) + history + profile
# =============================================================================


@marketplace_router.post("/offers/{offer_id}/confirm-deal", response_model=OfferResponse)
async def confirm_deal(
    offer_id: uuid.UUID,
    ud: Annotated[tuple[User, Dealer], Depends(require_verified_dealer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OfferResponse:
    """Called by the buyer OR seller after an offer has been accepted.

    Both sides must confirm. When the second confirmation arrives we:
      - mark the offer closed (closed_at = now)
      - create a `deals` row
      - flip the inventory status to 'sold'
      - increment deals_completed on BOTH dealers
      - recalculate trust scores
      - fan out notifications + emails to both sides
    """
    user, dealer = ud
    loaded = await _load_offer_context(offer_id, db)
    if loaded is None:
        raise HTTPException(status_code=404, detail="הצעה לא נמצאה")
    offer, vehicle, buyer, seller, buyer_user, seller_user = loaded

    role = _require_involved(offer, dealer)

    if offer.status != "accepted":
        raise HTTPException(
            status_code=400, detail="ניתן לאשר רק הצעה שאושרה"
        )
    if offer.closed_at is not None:
        raise HTTPException(status_code=400, detail="העסקה כבר נסגרה")

    if role == "buyer":
        if offer.deal_confirmed_buyer:
            raise HTTPException(status_code=400, detail="כבר אישרת את העסקה")
        offer.deal_confirmed_buyer = True
    else:
        if offer.deal_confirmed_seller:
            raise HTTPException(status_code=400, detail="כבר אישרת את העסקה")
        offer.deal_confirmed_seller = True

    await db.flush()

    both_confirmed = offer.deal_confirmed_buyer and offer.deal_confirmed_seller
    final_price = offer.counter_price or offer.offered_price

    if both_confirmed:
        from datetime import datetime, timezone as _tz

        now = datetime.now(tz=_tz.utc)
        offer.closed_at = now

        # Create deal row
        deal = Deal(
            offer_id=offer.id,
            inventory_id=vehicle.id,
            buyer_dealer_id=buyer.id,
            seller_dealer_id=seller.id,
            final_price=final_price,
            confirmed_at=now,
        )
        db.add(deal)

        # Flip inventory to sold
        vehicle.status = "sold"

        # Bump completed counters on BOTH sides
        buyer.deals_completed = (buyer.deals_completed or 0) + 1
        seller.deals_completed = (seller.deals_completed or 0) + 1

        await db.flush()

        await recalculate_trust_score(buyer.id, db)
        await recalculate_trust_score(seller.id, db)

        # Notifications
        veh_line = f"{vehicle.make} {vehicle.model} {vehicle.year}"
        await _notify(
            db,
            buyer.id,
            type_="deal.completed",
            title=f"עסקה נסגרה: {veh_line}",
            body=f"מחיר סופי: {final_price:,} ₪",
            data={"offer_id": str(offer.id), "inventory_id": str(vehicle.id)},
        )
        await _notify(
            db,
            seller.id,
            type_="deal.completed",
            title=f"עסקה נסגרה: {veh_line}",
            body=f"מחיר סופי: {final_price:,} ₪",
            data={"offer_id": str(offer.id), "inventory_id": str(vehicle.id)},
        )

        await emit_event(
            db,
            event_type="deal.closed",
            aggregate_type="offer",
            aggregate_id=offer.id,
            payload={
                "inventory_id": str(vehicle.id),
                "final_price": final_price,
                "buyer_dealer_id": str(buyer.id),
                "seller_dealer_id": str(seller.id),
            },
            actor_user_id=user.id,
        )
    else:
        await emit_event(
            db,
            event_type="deal.half_confirmed",
            aggregate_type="offer",
            aggregate_id=offer.id,
            payload={"by_role": role},
            actor_user_id=user.id,
        )

    await db.commit()
    await db.refresh(offer)

    if both_confirmed:
        veh_payload = {
            "make": vehicle.make,
            "model": vehicle.model,
            "year": vehicle.year,
        }
        try:
            await send_deal_completed_buyer(
                to_email=buyer_user.email,
                seller_business_name=seller.business_name,
                vehicle=veh_payload,
                final_price=final_price,
            )
            await send_deal_completed_seller(
                to_email=seller_user.email,
                buyer_business_name=buyer.business_name,
                vehicle=veh_payload,
                final_price=final_price,
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("deal.completed email fanout failed: %s", exc)

    primary = await _primary_image_url_for(vehicle.id, db)
    return _offer_response(offer, vehicle, buyer, seller, primary)


@marketplace_router.get("/deals", response_model=DealListResponse)
async def list_deals(
    ud: Annotated[tuple[User, Dealer], Depends(require_verified_dealer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> DealListResponse:
    """Dealer's own deal history — as buyer or seller."""
    _, dealer = ud

    deals = (
        (
            await db.execute(
                select(Deal)
                .where(
                    or_(
                        Deal.buyer_dealer_id == dealer.id,
                        Deal.seller_dealer_id == dealer.id,
                    )
                )
                .order_by(Deal.created_at.desc())
            )
        )
        .scalars()
        .all()
    )

    if not deals:
        return DealListResponse(items=[], total=0)

    inv_ids = list({d.inventory_id for d in deals})
    dealer_ids = list(
        {d.buyer_dealer_id for d in deals} | {d.seller_dealer_id for d in deals}
    )

    vehicles = {
        v.id: v
        for v in (
            (await db.execute(select(Inventory).where(Inventory.id.in_(inv_ids))))
            .scalars()
            .all()
        )
    }
    dealers = {
        d.id: d
        for d in (
            (await db.execute(select(Dealer).where(Dealer.id.in_(dealer_ids))))
            .scalars()
            .all()
        )
    }
    primary_images = await _primary_images_bulk(inv_ids, db)

    items: list[DealResponse] = []
    for d in deals:
        veh = vehicles.get(d.inventory_id)
        buyer = dealers.get(d.buyer_dealer_id)
        seller = dealers.get(d.seller_dealer_id)
        if veh is None or buyer is None or seller is None:
            continue
        items.append(
            DealResponse(
                id=d.id,
                offer_id=d.offer_id,
                inventory_id=d.inventory_id,
                buyer_dealer_id=d.buyer_dealer_id,
                seller_dealer_id=d.seller_dealer_id,
                final_price=d.final_price,
                confirmed_at=d.confirmed_at,
                created_at=d.created_at,
                vehicle=OfferVehicleSummary(
                    id=veh.id,
                    make=veh.make,
                    model=veh.model,
                    year=veh.year,
                    primary_image_url=primary_images.get(veh.id),
                ),
                buyer=OfferDealerSummary(
                    id=buyer.id, business_name=buyer.business_name, city=buyer.city
                ),
                seller=OfferDealerSummary(
                    id=seller.id, business_name=seller.business_name, city=seller.city
                ),
            )
        )

    return DealListResponse(items=items, total=len(items))


@marketplace_router.get(
    "/dealers/{dealer_id}/profile", response_model=DealerPublicProfile
)
async def dealer_public_profile(
    dealer_id: uuid.UUID,
    _ud: Annotated[tuple[User, Dealer], Depends(require_verified_dealer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> DealerPublicProfile:
    dealer = (
        await db.execute(select(Dealer).where(Dealer.id == dealer_id))
    ).scalar_one_or_none()
    if dealer is None or not dealer.verified:
        raise HTTPException(status_code=404, detail="סוחר לא נמצא")

    return DealerPublicProfile(
        id=dealer.id,
        business_name=dealer.business_name,
        city=dealer.city,
        tier=dealer.tier,
        trust_score=int(dealer.trust_score or 0),
        deals_completed=dealer.deals_completed,
        member_since=dealer.member_since,
    )


@marketplace_router.get("/analytics")
async def dealer_analytics(
    ud: Annotated[tuple[User, Dealer], Depends(require_verified_dealer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    """Self-analytics for the calling dealer."""
    from datetime import datetime, timedelta, timezone as _tz

    from app.models import InventoryView

    _, dealer = ud
    week_ago = datetime.now(tz=_tz.utc) - timedelta(days=7)

    # Vehicle counts
    inv_rows = (
        await db.execute(
            select(Inventory.status, func.count()).where(
                Inventory.dealer_id == dealer.id
            ).group_by(Inventory.status)
        )
    ).all()
    counts_by_status = {row[0]: row[1] for row in inv_rows}
    total_vehicles = sum(counts_by_status.values())
    paused_count = (
        await db.execute(
            select(func.count()).where(
                Inventory.dealer_id == dealer.id,
                Inventory.paused_until.isnot(None),
            )
        )
    ).scalar_one()

    # Views this week
    views_week = (
        await db.execute(
            select(func.count())
            .select_from(InventoryView)
            .join(Inventory, Inventory.id == InventoryView.inventory_id)
            .where(
                Inventory.dealer_id == dealer.id,
                InventoryView.viewed_at >= week_ago,
            )
        )
    ).scalar_one()

    # Total offers received + sent (lifetime)
    offers_received = (
        await db.execute(
            select(func.count()).where(Offer.seller_dealer_id == dealer.id)
        )
    ).scalar_one()
    offers_sent = (
        await db.execute(
            select(func.count()).where(Offer.buyer_dealer_id == dealer.id)
        )
    ).scalar_one()

    # Deal aggregates
    from app.models import Deal

    deal_rows = (
        await db.execute(
            select(func.count(), func.coalesce(func.sum(Deal.final_price), 0)).where(
                or_(
                    Deal.buyer_dealer_id == dealer.id,
                    Deal.seller_dealer_id == dealer.id,
                )
            )
        )
    ).first()
    deals_completed_rows = deal_rows[0] if deal_rows else 0
    deals_value = int(deal_rows[1]) if deal_rows else 0

    # Top vehicles by views (own inventory only)
    top_rows = (
        await db.execute(
            select(Inventory, func.count(InventoryView.id).label("views"))
            .outerjoin(InventoryView, InventoryView.inventory_id == Inventory.id)
            .where(Inventory.dealer_id == dealer.id)
            .group_by(Inventory.id)
            .order_by(func.count(InventoryView.id).desc())
            .limit(5)
        )
    ).all()

    top_vehicles: list[dict[str, Any]] = []
    for inv, views in top_rows:
        offer_count = (
            await db.execute(
                select(func.count()).where(Offer.inventory_id == inv.id)
            )
        ).scalar_one()
        top_vehicles.append(
            {
                "id": str(inv.id),
                "make": inv.make,
                "model": inv.model,
                "year": inv.year,
                "views": int(views or 0),
                "offers": int(offer_count),
            }
        )

    return {
        "total_vehicles": total_vehicles,
        "active_vehicles": counts_by_status.get("active", 0),
        "paused_vehicles": int(paused_count),
        "sold_vehicles": counts_by_status.get("sold", 0),
        "total_views": int(dealer.total_views or 0),
        "views_this_week": int(views_week),
        "total_offers_received": int(offers_received),
        "total_offers_sent": int(offers_sent),
        "deals_completed": dealer.deals_completed,
        "deals_value": deals_value,
        "trust_score": int(dealer.trust_score or 0),
        "tier": dealer.tier,
        "top_vehicles": top_vehicles,
    }


@notifications_router.post("/read-all")
async def mark_all_notifications_read(
    ud: Annotated[tuple[User, Dealer], Depends(require_verified_dealer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, object]:
    from sqlalchemy import update

    _, dealer = ud

    await db.execute(
        update(Notification)
        .where(
            Notification.dealer_id == dealer.id,
            Notification.read_at.is_(None),
        )
        .values(read_at=func.now())
    )
    await db.commit()
    return {"ok": True}
