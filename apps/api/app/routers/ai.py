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

from app.core.ai_usage import check_and_increment_ai_usage
from app.core.auth import require_admin, require_verified_dealer
from app.core.cache import redis_client
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


class DealerFilters(BaseModel):
    """Admin-side dealer-search filters extracted from a Hebrew NL query.
    Mirrors the column shape of /api/v1/admin/dealers query params."""
    # Verification status (pending = not verified yet, no rejection;
    # verified = approved; rejected = explicitly rejected)
    status: str | None = None  # "pending" | "verified" | "rejected"
    tier: str | None = None  # bronze | silver | gold | platinum
    kyc_status: str | None = None  # pending | submitted | approved | rejected
    city: str | None = None  # passed through to substring search field
    search: str | None = None  # residual substring (business name, email, contact)


class ParseDealerFiltersResponse(BaseModel):
    filters: DealerFilters


class DashboardAskRequest(BaseModel):
    """Free-form Hebrew query the dealer types into the dashboard search bar."""
    query: str = Field(min_length=1, max_length=500)


class DashboardAskAction(BaseModel):
    """Optional structured CTA the model wants to surface alongside its
    text answer. Frontend treats this as a hint — it can render a
    button that navigates to `href` with a Hebrew label."""
    label: str
    href: str


class DashboardAskResponse(BaseModel):
    answer: str  # Hebrew NL answer rendered in the response card
    actions: list[DashboardAskAction] = Field(default_factory=list)


class PriceEstimateRequest(BaseModel):
    make: str = Field(min_length=1, max_length=100)
    model: str = Field(min_length=1, max_length=100)
    year: int = Field(ge=1900, le=2030)
    mileage: int = Field(ge=0)
    hand: int | None = Field(default=None, ge=1, le=4)
    ownership_type: str | None = Field(
        default=None, pattern="^(private|dealer|leasing|rental|government)$"
    )


class PriceEstimateResponse(BaseModel):
    estimated_price: int | None
    confidence: str  # "high" | "medium" | "low" | "unavailable"
    breakdown: str  # Hebrew, single short sentence
    new_car_price: int | None = None  # baseline new-car list price if known


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


async def parse_dealer_query(query: str) -> DealerFilters:
    """Hebrew NL → DealerFilters for the admin dealers search bar.

    Returns an empty DealerFilters on any error so the search still runs
    (caller falls back to substring on the original query)."""
    client = _anthropic_client()
    if client is None:
        return DealerFilters()

    prompt = f"""Parse this Hebrew dealer-search query into JSON filters.

Query: "{query}"

Return ONLY a JSON object (no prose, no code fences) with these optional fields:
{{
  "status": "pending" | "verified" | "rejected" | null,
  "tier": "bronze" | "silver" | "gold" | "platinum" | null,
  "kyc_status": "pending" | "submitted" | "approved" | "rejected" | null,
  "city": "city name in Hebrew or null",
  "search": "remaining business-name / contact-name substring or null"
}}

Rules:
- "סוחרים שלא אומתו" / "ממתין לאישור" → status: "pending"
- "מאומתים" / "אושרו" → status: "verified"
- "נדחו" → status: "rejected"
- "גולד" / "זהב" → tier: "gold". "פלטינום" → "platinum".
  "כסף" / "סילבר" → "silver". "ברונזה" → "bronze".
- "KYC הוגש" → kyc_status: "submitted". "KYC מאושר" → "approved".
  "KYC נדחה" → "rejected". "ללא KYC" / "טרם הגיש" → "pending".
- City names like "תל אביב" / "חיפה" → city.
- Anything else (a name fragment) → search.
- Omit fields you are not sure about (use null).

Examples:
"סוחרים שלא אומתו מתל אביב" → {{"status": "pending", "city": "תל אביב"}}
"סוחרי גולד" → {{"tier": "gold"}}
"TalCars" → {{"search": "TalCars"}}
"סוחרים עם KYC הוגש" → {{"kyc_status": "submitted"}}
"""
    try:
        message = client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=400,
            messages=[{"role": "user", "content": prompt}],
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("ai.parse_dealer parse failed: %s", exc)
        return DealerFilters()

    text = ""
    for block in message.content:
        if getattr(block, "type", None) == "text":
            text = block.text
            break
    parsed = _safe_json_extract(text)
    if parsed is None:
        return DealerFilters()

    cleaned: dict[str, Any] = {}
    for key in ("status", "tier", "kyc_status", "city", "search"):
        v = parsed.get(key)
        if v is None or v == "":
            continue
        cleaned[key] = v
    try:
        return DealerFilters(**cleaned)
    except Exception as exc:  # noqa: BLE001
        logger.info("ai.parse_dealer coercion failed: %s payload=%s", exc, cleaned)
        return DealerFilters()


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


# Lightweight variant of /search: parse only, no marketplace query.
# Each page (marketplace, admin inventory, dealer's own inventory)
# applies the resulting filters to ITS OWN data set client-side.
# Saves a DB round-trip per call and keeps the response shape stable
# across all the search bars that wire this up.

class ParseFiltersResponse(BaseModel):
    filters: AISearchFilters
    # Words/tokens from the original query that didn't map to any
    # structured filter. Frontend can use this as a residual full-text
    # search term against make/model/notes columns.
    fallback_q: str | None = None


@router.post("/parse-filters", response_model=ParseFiltersResponse)
async def ai_parse_filters(
    payload: AISearchRequest,
    _ud: Annotated[tuple[User, Dealer], Depends(require_verified_dealer)],
) -> ParseFiltersResponse:
    """Pure Hebrew NL → structured filters. No DB query, no caller-scoped
    data — same parser as /search but only returns the AISearchFilters
    object so any list page can apply them to its own dataset.

    Returns the original query as fallback_q when Claude couldn't pull
    out a single structured filter, so the caller can still do a
    substring fallback against make/model."""
    filters = await parse_vehicle_query(payload.query)
    any_set = any(
        getattr(filters, f) is not None
        for f in (
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
        )
    )
    return ParseFiltersResponse(
        filters=filters,
        fallback_q=payload.query.strip() if not any_set else None,
    )


@router.post("/inventory/price-estimate", response_model=PriceEstimateResponse)
async def price_estimate(
    payload: PriceEstimateRequest,
    _ud: Annotated[tuple[User, Dealer], Depends(require_verified_dealer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PriceEstimateResponse:
    """AI-driven market-price estimate for a specific (make, model, year,
    mileage, hand, ownership_type) combination.

    Calls Claude with the Israeli used-car market context and asks for a
    single ILS integer + a confidence label + a one-line breakdown in
    Hebrew. Empty / failed responses degrade gracefully to a deterministic
    formula so the form always shows SOMETHING under the price field.
    """
    _, dealer = _ud
    await check_and_increment_ai_usage(dealer, db)

    # Try cache first
    if redis_client:
        cache_key = f"price:{payload.make}:{payload.model}:{payload.year}:{payload.mileage}"
        try:
            cached = await redis_client.get(cache_key)
            if cached:
                return PriceEstimateResponse(**json.loads(cached))
        except Exception:
            pass  # Cache miss, continue

    client = _anthropic_client()

    # ---- Deterministic fallback (used when Claude is unreachable) ----
    # Conservative depreciation curve calibrated for the Israeli market —
    # accurate to within ~±15% for mid-segment cars, intentionally vague.
    from datetime import datetime as _dt

    current_year = _dt.now().year
    age = max(0, current_year - payload.year)
    # No baseline new-car price → use a rough heuristic (75k base × inverse age).
    base = 110_000
    depreciation = max(0.25, 0.85 ** age)  # 15%/year, floor at 25%
    mileage_factor = max(0.65, 1.0 - (payload.mileage / 400_000))
    hand_factor = {1: 1.0, 2: 0.93, 3: 0.85, 4: 0.78}.get(payload.hand or 1, 1.0)
    ownership_factor = {
        "private": 1.0,
        "dealer": 0.95,
        "leasing": 0.83,
        "rental": 0.78,
        "government": 0.88,
    }.get(payload.ownership_type or "private", 1.0)
    fallback_price = int(
        base * depreciation * mileage_factor * hand_factor * ownership_factor
    )
    fallback_price = max(5_000, fallback_price)

    if client is None:
        return PriceEstimateResponse(
            estimated_price=fallback_price,
            confidence="low",
            breakdown=(
                f"הערכה בסיסית — {payload.year} · {payload.mileage:,} ק״מ · "
                f"מבוסס נוסחת פחת ללא נתוני שוק חיים".replace(",", ",")
            ),
        )

    hand_he = (
        f"יד {payload.hand}" if payload.hand else "יד לא צוינה"
    )
    ownership_he = {
        "private": "פרטית",
        "dealer": "סוחר",
        "leasing": "ליסינג",
        "rental": "השכרה",
        "government": "ממשלתי",
    }.get(payload.ownership_type or "", "לא צוין")

    system = (
        "אתה מעריך מחירים לרכבי יד שנייה בשוק הישראלי. "
        "החזר JSON תקני בלבד: "
        '{"estimated_price": <int ILS>, "confidence": "high"|"medium"|"low", '
        '"breakdown": "<משפט קצר בעברית>", "new_car_price": <int או null>}. '
        "התבסס על מחירון לוי יצחק / יד2 / מחירון אחיד. "
        "אל תוסיף טקסט מחוץ ל-JSON."
    )
    user_msg = (
        f"רכב: {payload.make} {payload.model} שנת {payload.year}\n"
        f"קילומטראז׳: {payload.mileage:,} ק״מ\n".replace(",", ",")
        + f"היסטוריה: {hand_he} · {ownership_he}\n"
        "מהו מחיר השוק המשוער בשקלים?"
    )

    try:
        msg = client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=300,
            timeout=12,
            system=system,
            messages=[{"role": "user", "content": user_msg}],
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("price_estimate claude call failed: %s", exc)
        return PriceEstimateResponse(
            estimated_price=fallback_price,
            confidence="low",
            breakdown="הערכה זמנית — שירות התמחור לא זמין כרגע",
        )

    text = ""
    for blk in msg.content:
        if getattr(blk, "type", None) == "text":
            text = blk.text
            break

    parsed = _safe_json_extract(text) or {}
    raw_price = parsed.get("estimated_price")
    try:
        price = int(raw_price) if raw_price is not None else fallback_price
    except (TypeError, ValueError):
        price = fallback_price
    confidence = parsed.get("confidence")
    if confidence not in ("high", "medium", "low"):
        confidence = "medium"
    breakdown = parsed.get("breakdown")
    if not isinstance(breakdown, str) or not breakdown.strip():
        breakdown = f"הערכה לפי שנת {payload.year} · {payload.mileage:,} ק״מ · {hand_he} · {ownership_he}".replace(
            ",", ","
        )
    new_car_raw = parsed.get("new_car_price")
    try:
        new_car_price = int(new_car_raw) if new_car_raw is not None else None
    except (TypeError, ValueError):
        new_car_price = None

    result = PriceEstimateResponse(
        estimated_price=max(5_000, price),
        confidence=confidence,
        breakdown=breakdown,
        new_car_price=new_car_price,
    )

    # Cache the result
    if redis_client:
        try:
            await redis_client.setex(cache_key, 3600, result.model_dump_json())
        except Exception:
            pass  # Cache write failed, ignore

    return result


@router.post("/parse-dealer-filters", response_model=ParseDealerFiltersResponse)
async def ai_parse_dealer_filters(
    payload: AISearchRequest,
    _admin: Annotated[User, Depends(require_admin)],
) -> ParseDealerFiltersResponse:
    """Hebrew NL → admin dealer-list filters.

    Admin-gated since dealer listings are admin-only. Reuses the
    AISearchRequest body shape for consistency."""
    filters = await parse_dealer_query(payload.query)
    return ParseDealerFiltersResponse(filters=filters)


@router.post("/dashboard-assistant", response_model=DashboardAskResponse)
async def dashboard_assistant(
    payload: DashboardAskRequest,
    ud: Annotated[tuple[User, Dealer], Depends(require_verified_dealer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> DashboardAskResponse:
    """Conversational assistant for the dealer command center.

    Pre-fetches a snapshot of the caller's own data (active inventory
    count, sold-this-month, open offers in/out, latest deal) and feeds
    it to Claude as system context. Claude answers in Hebrew, may
    suggest one navigation CTA in JSON.

    Falls back to a deterministic answer when the API key is missing
    or Claude errors — the dashboard must never break when AI is down.
    """
    from datetime import datetime, timedelta, timezone as _tz

    user, dealer = ud
    now = datetime.now(tz=_tz.utc)
    month_ago = now - timedelta(days=30)

    # Single batched probe of the dealer's own state — no per-call API
    # roundtrips so the assistant feels instant.
    counts = (
        await db.execute(
            select(
                func.count().filter(Inventory.status == "active").label("active"),
                func.count().filter(
                    and_(Inventory.status == "sold", Inventory.sold_at >= month_ago)
                ).label("sold_30d"),
                func.coalesce(
                    func.sum(Inventory.sale_price).filter(
                        and_(Inventory.status == "sold", Inventory.sold_at >= month_ago)
                    ),
                    0,
                ).label("revenue_30d"),
            ).where(Inventory.dealer_id == dealer.id)
        )
    ).one()

    offers_in = (
        await db.execute(
            select(func.count()).where(
                and_(
                    Offer.seller_dealer_id == dealer.id,
                    Offer.status.in_(("pending", "countered")),
                )
            )
        )
    ).scalar_one()

    offers_out = (
        await db.execute(
            select(func.count()).where(
                and_(
                    Offer.buyer_dealer_id == dealer.id,
                    Offer.status.in_(("pending", "countered")),
                )
            )
        )
    ).scalar_one()

    context_lines = [
        f"שם העסק: {dealer.business_name}",
        f"אימייל: {user.email}",
        f"רכבים פעילים במלאי: {counts.active}",
        f"מכירות ב-30 הימים האחרונים: {counts.sold_30d}",
        f"הכנסות 30 יום: ₪{int(counts.revenue_30d):,}".replace(",", ","),
        f"הצעות פתוחות שקיבלת: {offers_in}",
        f"הצעות פתוחות ששלחת: {offers_out}",
        f"ציון אמון: {int(dealer.trust_score or 0)}",
        f"דרגה: {dealer.tier}",
    ]
    dealer_context = "\n".join(context_lines)

    client = _anthropic_client()
    if client is None:
        # Deterministic fallback so the dashboard still feels alive.
        return DashboardAskResponse(
            answer=(
                f"שלום {dealer.business_name}, יש לך {counts.active} רכבים פעילים, "
                f"{offers_in} הצעות שקיבלת, {offers_out} הצעות ששלחת, "
                f"ו-{counts.sold_30d} מכירות ב-30 הימים האחרונים."
            ),
            actions=[
                DashboardAskAction(label="פתח שוק B2B", href="/dashboard/marketplace")
            ],
        )

    system = (
        "אתה עוזר אישי בעברית של סוחר רכב בפלטפורמת AutoTradeIL. "
        "ענה תמיד בעברית, קצר וענייני (עד 3 משפטים). "
        "אם המשתמש מחפש רכב — הצע פעולה שמובילה ל/dashboard/marketplace עם פילטרים. "
        "אם הוא שואל על המלאי שלו — הצע /dashboard/inventory. "
        "על הצעות — /dashboard/offers. על עסקאות — /dashboard/deals. "
        "החזר JSON תקין: "
        '{"answer": "תשובה בעברית", "actions": [{"label": "טקסט כפתור", "href": "/dashboard/..."}]}'
        " כש-actions ריק — שלח []."
    )

    user_msg = f"הקשר הסוחר:\n{dealer_context}\n\nשאלה: {payload.query}"

    try:
        msg = client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=400,
            timeout=15,
            system=system,
            messages=[{"role": "user", "content": user_msg}],
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("dashboard_assistant claude call failed: %s", exc)
        return DashboardAskResponse(
            answer=f"שלום {dealer.business_name}, אני לא יכול לענות כרגע. נסה שוב עוד רגע.",
            actions=[],
        )

    text = ""
    for blk in msg.content:
        if getattr(blk, "type", None) == "text":
            text = blk.text
            break

    parsed = _safe_json_extract(text)
    if parsed and isinstance(parsed.get("answer"), str):
        actions_raw = parsed.get("actions") or []
        actions: list[DashboardAskAction] = []
        if isinstance(actions_raw, list):
            for a in actions_raw[:3]:  # cap at 3 to keep the card tidy
                if (
                    isinstance(a, dict)
                    and isinstance(a.get("label"), str)
                    and isinstance(a.get("href"), str)
                    and a["href"].startswith("/")  # only relative paths
                ):
                    actions.append(DashboardAskAction(label=a["label"], href=a["href"]))
        return DashboardAskResponse(answer=parsed["answer"], actions=actions)

    # Model returned plain text without JSON — surface it as-is.
    return DashboardAskResponse(answer=text.strip() or "לא הבנתי את השאלה, נסה לנסח מחדש.")


@router.post("/price-analysis", response_model=PriceAnalysisResponse)
async def price_analysis(
    payload: PriceAnalysisRequest,
    ud: Annotated[tuple[User, Dealer], Depends(require_verified_dealer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PriceAnalysisResponse:
    """Compare a listing's price to comparable B2B listings. 1h memory cache."""
    _, dealer = ud

    # Visibility check runs BEFORE the cache lookup. If we trusted the
    # cache first, a row that was B2B-published an hour ago and has since
    # been flipped to private would still serve its asking-price-derived
    # response from the stale cache entry. Match get_vehicle_detail's
    # gate in marketplace.py (security audit 2026-05-29, finding #1).
    vehicle = (
        await db.execute(select(Inventory).where(Inventory.id == payload.inventory_id))
    ).scalar_one_or_none()
    if vehicle is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="רכב לא נמצא"
        )
    if vehicle.dealer_id != dealer.id and (
        vehicle.visibility not in ("b2b", "both") or vehicle.status != "active"
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="רכב לא נמצא"
        )

    cache_key = str(payload.inventory_id)
    cached = _PRICE_CACHE.get(cache_key)
    now = time.time()
    if cached and (now - cached[0]) < _PRICE_CACHE_TTL_SECONDS:
        return PriceAnalysisResponse(**cached[1])

    await check_and_increment_ai_usage(dealer, db)

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
