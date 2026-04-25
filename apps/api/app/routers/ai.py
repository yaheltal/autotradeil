"""AI agent endpoints (Phase 6).

Three Claude-backed endpoints layered on top of the marketplace data:

    POST /api/v1/ai/search           — Hebrew NL → structured filters → results
    POST /api/v1/ai/price-analysis   — fair / high / low vs. comparable listings
    POST /api/v1/ai/recommendations  — vehicles for the caller based on history

All endpoints require a verified dealer. Failures from the Anthropic API
return safe empty payloads instead of 5xx so the UI can degrade gracefully.

Caching: price-analysis results are memoized in-process for 1 hour, keyed by
inventory_id. Multi-process deploys would need to swap this for Redis.
"""

from __future__ import annotations

import json
import math
import time
import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_verified_dealer
from app.core.config import settings
from app.core.logging import get_logger
from app.database import get_db
from app.models import Deal, Dealer, Inventory, Offer, User
from app.routers.marketplace import _primary_images_bulk
from app.schemas.marketplace import VehicleSearchResponse, VehicleSearchResult

logger = get_logger(__name__)

router = APIRouter(prefix="/api/v1/ai", tags=["ai"])

CLAUDE_MODEL = "claude-sonnet-4-6"

_PRICE_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}
_PRICE_CACHE_TTL_SECONDS = 3600


# =============================================================================
# Schemas
# =============================================================================


class AISearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=500)


class AISearchFilters(BaseModel):
    make: str | None = None
    model: str | None = None
    year_min: int | None = None
    year_max: int | None = None
    price_min: int | None = None
    price_max: int | None = None
    mileage_max: int | None = None
    transmission: str | None = None
    fuel_type: str | None = None
    color: str | None = None


class AISearchResponse(BaseModel):
    filters: AISearchFilters
    results: VehicleSearchResponse


class PriceAnalysisRequest(BaseModel):
    inventory_id: uuid.UUID


class PriceAnalysisResponse(BaseModel):
    assessment: str
    percentage: float | None = None
    avg_market_price: int | None = None
    sample_size: int = 0
    explanation: str


class RecommendationsResponse(BaseModel):
    vehicles: list[VehicleSearchResult]
    reason: str


# =============================================================================
# Claude helpers
# =============================================================================


def _anthropic_client():
    """Lazy-instantiate the Anthropic SDK client.

    Returns None when no API key is configured so callers can fall back to
    deterministic behavior without raising.
    """
    if not settings.anthropic_api_key:
        return None
    import anthropic

    return anthropic.Anthropic(api_key=settings.anthropic_api_key)


def _safe_json_extract(text: str) -> dict[str, Any] | None:
    """Pull a JSON object out of model output, tolerating fences and prose."""
    s = text.strip()
    if s.startswith("```"):
        # Strip ```json ... ``` fences
        s = s.strip("`")
        if s.lower().startswith("json"):
            s = s[4:]
        s = s.strip()
    start = s.find("{")
    end = s.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    try:
        parsed = json.loads(s[start : end + 1])
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        return None


async def parse_vehicle_query(query: str) -> AISearchFilters:
    """Parse a Hebrew natural-language search query into structured filters.

    Returns an empty AISearchFilters on any error so the search still runs
    (just with no AI-derived constraints).
    """
    client = _anthropic_client()
    if client is None:
        return AISearchFilters()

    prompt = f"""Parse this Hebrew vehicle search query into JSON filters.

Query: "{query}"

Return ONLY a JSON object (no prose, no code fences) with these optional fields:
{{
  "make": "manufacturer in Hebrew or null",
  "model": "model name or null",
  "year_min": integer or null,
  "year_max": integer or null,
  "price_min": integer in NIS or null,
  "price_max": integer in NIS or null,
  "mileage_max": integer in km or null,
  "transmission": "automatic" | "manual" | null,
  "fuel_type": "petrol" | "diesel" | "electric" | "hybrid" | null,
  "color": "color in Hebrew or null"
}}

Rules:
- "אלף" = 1000, so "80 אלף" = 80000.
- "עד" = max, "מ-" / "מעל" = min.
- "אוטומט" / "אוטומטי" = automatic. "ידני" = manual.
- "חשמלי" = electric. "היברידי" = hybrid. "דיזל" = diesel. "בנזין" = petrol.
- If a single year appears (e.g. "2020"), set both year_min and year_max to it.
- Omit fields you are not sure about (use null).

Examples:
"יונדאי i20 2020 אוטומט עד 80 אלף" → {{"make": "יונדאי", "model": "i20", "year_min": 2020, "year_max": 2020, "price_max": 80000, "transmission": "automatic"}}
"טויוטה לבנה היברידית" → {{"make": "טויוטה", "color": "לבן", "fuel_type": "hybrid"}}
"רכב חשמלי עד 150 אלף ק\"מ" → {{"fuel_type": "electric", "mileage_max": 150000}}
"""

    try:
        message = client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=500,
            messages=[{"role": "user", "content": prompt}],
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("ai.search parse failed: %s", exc)
        return AISearchFilters()

    text = ""
    for block in message.content:
        if getattr(block, "type", None) == "text":
            text = block.text
            break
    parsed = _safe_json_extract(text)
    if parsed is None:
        return AISearchFilters()

    # Strip nulls and unknown keys; let pydantic coerce / drop bad values.
    cleaned: dict[str, Any] = {}
    for key in (
        "make",
        "model",
        "year_min",
        "year_max",
        "price_min",
        "price_max",
        "mileage_max",
        "transmission",
        "fuel_type",
        "color",
    ):
        v = parsed.get(key)
        if v is None or v == "":
            continue
        cleaned[key] = v
    try:
        return AISearchFilters(**cleaned)
    except Exception as exc:  # noqa: BLE001
        logger.info("ai.search filter coercion failed: %s payload=%s", exc, cleaned)
        return AISearchFilters()


# =============================================================================
# Marketplace search reused with structured filters
# =============================================================================


async def _run_marketplace_search(
    *,
    db: AsyncSession,
    caller_dealer_id: uuid.UUID,
    filters: AISearchFilters,
    page: int = 1,
    per_page: int = 20,
) -> VehicleSearchResponse:
    """Apply the same conditions as /marketplace/search using AI-derived
    filters. Kept inline so AI search and the manual search stay in sync on
    the same B2B / status / paused-until rules."""
    from datetime import datetime, timezone as _tz

    now = datetime.now(tz=_tz.utc)

    conds = [
        Inventory.visibility.in_(["b2b", "both"]),
        Inventory.status == "active",
        Inventory.dealer_id != caller_dealer_id,
        (Inventory.paused_until.is_(None)) | (Inventory.paused_until <= now),
    ]

    if filters.make:
        needle = f"%{filters.make.strip()}%"
        conds.append(Inventory.make.ilike(needle))
    if filters.model:
        needle = f"%{filters.model.strip()}%"
        conds.append(Inventory.model.ilike(needle))
    if filters.year_min is not None:
        conds.append(Inventory.year >= filters.year_min)
    if filters.year_max is not None:
        conds.append(Inventory.year <= filters.year_max)
    if filters.price_min is not None:
        conds.append(
            func.coalesce(Inventory.b2b_price, Inventory.price) >= filters.price_min
        )
    if filters.price_max is not None:
        conds.append(
            func.coalesce(Inventory.b2b_price, Inventory.price) <= filters.price_max
        )
    if filters.mileage_max is not None:
        conds.append(Inventory.mileage <= filters.mileage_max)
    if filters.transmission in ("automatic", "manual"):
        conds.append(Inventory.transmission == filters.transmission)
    if filters.fuel_type in ("petrol", "diesel", "electric", "hybrid"):
        conds.append(Inventory.fuel_type == filters.fuel_type)
    if filters.color:
        needle = f"%{filters.color.strip()}%"
        conds.append(Inventory.color.ilike(needle))

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
# Routes
# =============================================================================


@router.post("/search", response_model=AISearchResponse)
async def ai_search(
    payload: AISearchRequest,
    ud: Annotated[tuple[User, Dealer], Depends(require_verified_dealer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AISearchResponse:
    """Hebrew NL search. Claude parses filters; we run the marketplace query."""
    _, caller = ud
    filters = await parse_vehicle_query(payload.query)
    results = await _run_marketplace_search(
        db=db, caller_dealer_id=caller.id, filters=filters
    )
    return AISearchResponse(filters=filters, results=results)


@router.post("/price-analysis", response_model=PriceAnalysisResponse)
async def price_analysis(
    payload: PriceAnalysisRequest,
    ud: Annotated[tuple[User, Dealer], Depends(require_verified_dealer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PriceAnalysisResponse:
    """Compare a listing's price to comparable B2B listings. 1h memory cache."""
    cache_key = str(payload.inventory_id)
    cached = _PRICE_CACHE.get(cache_key)
    now = time.time()
    if cached and (now - cached[0]) < _PRICE_CACHE_TTL_SECONDS:
        return PriceAnalysisResponse(**cached[1])

    vehicle = (
        await db.execute(select(Inventory).where(Inventory.id == payload.inventory_id))
    ).scalar_one_or_none()
    if vehicle is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="רכב לא נמצא"
        )

    asking = vehicle.b2b_price or vehicle.price

    # Comparables: same make+model, year ±2, B2B-published, active, exclude self.
    comp_stmt = select(Inventory).where(
        Inventory.id != vehicle.id,
        Inventory.make == vehicle.make,
        Inventory.model == vehicle.model,
        Inventory.year >= vehicle.year - 2,
        Inventory.year <= vehicle.year + 2,
        Inventory.visibility.in_(["b2b", "both"]),
        Inventory.status == "active",
    )
    comps = (await db.execute(comp_stmt)).scalars().all()

    def _comp_price(c: Inventory) -> int:
        return c.b2b_price or c.price

    if len(comps) < 2:
        result = {
            "assessment": "unknown",
            "percentage": None,
            "avg_market_price": None,
            "sample_size": len(comps),
            "explanation": "אין מספיק נתונים להשוואה בשוק",
        }
        _PRICE_CACHE[cache_key] = (now, result)
        return PriceAnalysisResponse(**result)

    prices = [_comp_price(c) for c in comps]
    avg_price = sum(prices) / len(prices)
    diff_pct = ((asking - avg_price) / avg_price) * 100 if avg_price else 0.0

    if diff_pct > 10:
        assessment = "high"
    elif diff_pct < -10:
        assessment = "low"
    else:
        assessment = "fair"

    explanation = _fallback_explanation(assessment, diff_pct)
    client = _anthropic_client()
    if client is not None:
        try:
            message = client.messages.create(
                model=CLAUDE_MODEL,
                max_tokens=200,
                messages=[
                    {
                        "role": "user",
                        "content": (
                            "אתה מומחה לשוק הרכב המשומש בישראל. "
                            f"רכב: {vehicle.make} {vehicle.model} {vehicle.year}, "
                            f"{vehicle.mileage:,} ק\"מ, מחיר מבוקש ₪{asking:,}. "
                            f"ממוצע שוק על {len(comps)} רכבים דומים: ₪{avg_price:,.0f}. "
                            f"הפרש: {diff_pct:+.1f}%. "
                            "כתוב משפט אחד קצר בעברית (עד 20 מילים) שמסביר אם המחיר הוגן, "
                            "גבוה או נמוך, וציין את האחוז. ללא הקדמות, ללא מירכאות."
                        ),
                    }
                ],
            )
            for block in message.content:
                if getattr(block, "type", None) == "text" and block.text.strip():
                    explanation = block.text.strip()
                    break
        except Exception as exc:  # noqa: BLE001
            logger.warning("ai.price-analysis claude call failed: %s", exc)

    result = {
        "assessment": assessment,
        "percentage": round(diff_pct, 1),
        "avg_market_price": round(avg_price),
        "sample_size": len(comps),
        "explanation": explanation,
    }
    _PRICE_CACHE[cache_key] = (now, result)
    return PriceAnalysisResponse(**result)


def _fallback_explanation(assessment: str, diff_pct: float) -> str:
    pct = abs(diff_pct)
    if assessment == "fair":
        return f"המחיר הוגן ביחס לשוק ({diff_pct:+.1f}% מהממוצע)"
    if assessment == "high":
        return f"המחיר גבוה ב-{pct:.1f}% מהממוצע בשוק"
    return f"המחיר נמוך ב-{pct:.1f}% מהממוצע בשוק"


@router.post("/recommendations", response_model=RecommendationsResponse)
async def recommendations(
    ud: Annotated[tuple[User, Dealer], Depends(require_verified_dealer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> RecommendationsResponse:
    """Recommend B2B listings based on the dealer's offer + deal history.

    Heuristic: collect (make, model) pairs from past offers and closed deals.
    Surface up to 12 active B2B listings matching any of those make/models the
    caller hasn't already offered on. Falls back to "newest" when there is no
    history yet.
    """
    from datetime import datetime, timezone as _tz

    _, caller = ud

    # 1. Build interest signal from history.
    offered_inv_ids_stmt = select(Offer.inventory_id).where(
        Offer.buyer_dealer_id == caller.id
    )
    offered_inv_ids = (
        (await db.execute(offered_inv_ids_stmt)).scalars().all()
    )

    deal_inv_ids_stmt = select(Deal.inventory_id).where(
        or_(Deal.buyer_dealer_id == caller.id, Deal.seller_dealer_id == caller.id)
    )
    deal_inv_ids = (await db.execute(deal_inv_ids_stmt)).scalars().all()

    history_inv_ids = list({*offered_inv_ids, *deal_inv_ids})

    interest_pairs: list[tuple[str, str]] = []
    if history_inv_ids:
        rows = (
            (
                await db.execute(
                    select(Inventory.make, Inventory.model)
                    .where(Inventory.id.in_(history_inv_ids))
                    .distinct()
                )
            )
            .all()
        )
        interest_pairs = [(r.make, r.model) for r in rows]

    now = datetime.now(tz=_tz.utc)
    base_conds = [
        Inventory.visibility.in_(["b2b", "both"]),
        Inventory.status == "active",
        Inventory.dealer_id != caller.id,
        (Inventory.paused_until.is_(None)) | (Inventory.paused_until <= now),
    ]
    if offered_inv_ids:
        base_conds.append(Inventory.id.notin_(list(offered_inv_ids)))

    if interest_pairs:
        pair_filters = [
            and_(Inventory.make == m, Inventory.model == md)
            for m, md in interest_pairs
        ]
        base_conds.append(or_(*pair_filters))
        reason = (
            "בהתבסס על "
            f"{len(interest_pairs)} דגמים שהראית בהם עניין בעבר"
        )
    else:
        reason = "המודעות החדשות ביותר בשוק (אין היסטוריה לזיהוי העדפות)"

    rows = (
        await db.execute(
            select(Inventory, Dealer)
            .join(Dealer, Dealer.id == Inventory.dealer_id)
            .where(and_(*base_conds))
            .order_by(Inventory.created_at.desc())
            .limit(12)
        )
    ).all()

    inv_ids = [r[0].id for r in rows]
    primary_images = await _primary_images_bulk(inv_ids, db)

    vehicles = [
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

    return RecommendationsResponse(vehicles=vehicles, reason=reason)
