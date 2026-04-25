"""Authentication + authorization dependencies.

Flow:
    1. Client sends `Authorization: Bearer <supabase_access_token>`.
    2. `verify_jwt` / `_decode_supabase_jwt` resolves the signing key via
       Supabase's JWKS endpoint and verifies the signature. Supports
       ES256 (new Supabase signing keys) and RS256, with an HS256
       fallback for legacy projects that still use a shared secret.
    3. `get_current_user` extracts `sub` (user UUID) and loads the
       matching row from `public.users`.
    4. Role-scoped dependencies (`require_admin`, `require_verified_dealer`)
       call `get_current_user` and enforce additional constraints.

Impersonation:
    Admin callers may set `X-Impersonate-Dealer-Id: <uuid>`. Use
    `get_effective_dealer_id(...)` to resolve the dealer the current
    request should act as, and to write an audit_log entry when
    impersonation is active.

Note on RLS:
    SQLAlchemy sessions use the service-role DATABASE_URL and therefore
    bypass RLS. Endpoint-level guards below are the authoritative gate
    for now. Propagating the user JWT into the DB session (so RLS
    policies fire with the correct `auth.uid()`) is deferred to a
    later phase when we ship endpoints that return tenant rows.
"""

from __future__ import annotations

import time
import uuid
from typing import Annotated, Any

import httpx
import jwt as pyjwt
from fastapi import Depends, Header, HTTPException, Request, status
from jwt.algorithms import ECAlgorithm, RSAAlgorithm
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.logging import get_logger
from app.database import get_db
from app.models import AuditLog, Dealer, User

logger = get_logger(__name__)


# --------------------------------------------------------------------------
# JWT verification (JWKS-first, HS256 fallback)
# --------------------------------------------------------------------------


class AuthError(HTTPException):
    def __init__(self, detail: str, status_code: int = status.HTTP_401_UNAUTHORIZED):
        super().__init__(
            status_code=status_code,
            detail=detail,
            headers={"WWW-Authenticate": "Bearer"},
        )


def _extract_bearer(request: Request) -> str:
    auth_header = request.headers.get("Authorization", "")
    scheme, _, token = auth_header.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise AuthError("Missing or malformed Authorization header")
    return token


def _supabase_base() -> str:
    return settings.supabase_url.rstrip("/")


# Module-level JWKS cache. httpx (certifi-backed) is used directly instead of
# PyJWKClient, which relies on stdlib urllib and fails on macOS Homebrew Python
# that doesn't pick up system trust roots. Behavior is identical in production.
_JWKS_CACHE: dict[str, Any] = {"keys": {}, "fetched_at": 0.0}
_JWKS_TTL_SECONDS = 3600


def _fetch_jwks_sync() -> dict[str, Any]:
    """Fetch JWKS from Supabase. Uses httpx (respects certifi)."""
    jwks_url = f"{_supabase_base()}/auth/v1/.well-known/jwks.json"
    logger.info("fetching JWKS url=%s", jwks_url)
    resp = httpx.get(jwks_url, timeout=10.0)
    resp.raise_for_status()
    return resp.json()


def _get_signing_key(kid: str, alg: str) -> Any:
    """Return a PyJWT-compatible signing key for the given kid.

    Refreshes the cache if the key isn't present (handles Supabase key
    rotation without requiring a process restart).
    """
    now = time.time()
    stale = (now - _JWKS_CACHE["fetched_at"]) > _JWKS_TTL_SECONDS
    if stale or kid not in _JWKS_CACHE["keys"]:
        try:
            data = _fetch_jwks_sync()
        except httpx.HTTPError as exc:
            logger.warning("JWKS fetch failed: %s", exc)
            raise AuthError("Unable to fetch signing keys")
        _JWKS_CACHE["keys"] = {k["kid"]: k for k in data.get("keys", [])}
        _JWKS_CACHE["fetched_at"] = now

    jwk = _JWKS_CACHE["keys"].get(kid)
    if jwk is None:
        logger.info("kid=%s not found in JWKS after refresh", kid)
        raise AuthError("Unable to resolve token signing key")

    if alg == "ES256":
        return ECAlgorithm.from_jwk(jwk)
    if alg == "RS256":
        return RSAAlgorithm.from_jwk(jwk)
    raise AuthError(f"Unsupported algorithm: {alg}")


def verify_jwt(token: str) -> dict:
    """Verify a Supabase access token. Returns the decoded payload.

    Algorithms accepted:
      - ES256 / RS256  → resolved via JWKS by `kid`
      - HS256          → fallback using SUPABASE_JWT_SECRET
                         (for legacy projects with shared-secret signing)

    Raises AuthError (401) on any failure.
    """
    audience = settings.supabase_jwt_audience or "authenticated"
    issuer = f"{_supabase_base()}/auth/v1"

    try:
        header = pyjwt.get_unverified_header(token)
    except pyjwt.InvalidTokenError as exc:
        logger.info("jwt header parse failed: %s", exc)
        raise AuthError("Invalid token")

    alg = header.get("alg")

    # HS256 path: shared secret. JWKS doesn't publish HMAC keys.
    if alg == "HS256":
        if not settings.supabase_jwt_secret:
            raise AuthError(
                "Server not configured for HS256 (SUPABASE_JWT_SECRET missing)",
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        try:
            return pyjwt.decode(
                token,
                settings.supabase_jwt_secret,
                algorithms=["HS256"],
                audience=audience,
                issuer=issuer,
                options={"require": ["exp", "sub"]},
            )
        except pyjwt.ExpiredSignatureError:
            raise AuthError("Token has expired")
        except pyjwt.InvalidAudienceError:
            raise AuthError("Token audience mismatch")
        except pyjwt.InvalidIssuerError:
            raise AuthError("Token issuer mismatch")
        except pyjwt.InvalidTokenError as exc:
            logger.info("HS256 jwt rejected: %s", exc)
            raise AuthError("Invalid token")

    # ES256 / RS256: JWKS lookup by `kid`.
    if not settings.supabase_url:
        raise AuthError(
            "Server not configured (SUPABASE_URL missing)",
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
    kid = header.get("kid")
    if not kid:
        raise AuthError("Token missing kid header")
    signing_key_obj = _get_signing_key(kid, alg)

    try:
        return pyjwt.decode(
            token,
            signing_key_obj,
            algorithms=["ES256", "RS256"],
            audience=audience,
            issuer=issuer,
            options={"require": ["exp", "sub"]},
        )
    except pyjwt.ExpiredSignatureError:
        raise AuthError("Token has expired")
    except pyjwt.InvalidAudienceError:
        raise AuthError("Token audience mismatch")
    except pyjwt.InvalidIssuerError:
        raise AuthError("Token issuer mismatch")
    except pyjwt.InvalidTokenError as exc:
        logger.info("asymmetric jwt rejected: %s", exc)
        raise AuthError("Invalid token")


# Back-compat alias for the private name used elsewhere in this module.
_decode_supabase_jwt = verify_jwt


# --------------------------------------------------------------------------
# Dependencies
# --------------------------------------------------------------------------


def _peek_token_type(token: str) -> str | None:
    """Unverified peek at the `type` claim so we can branch before verify."""
    try:
        unverified = pyjwt.decode(
            token,
            options={
                "verify_signature": False,
                "verify_exp": False,
                "verify_aud": False,
            },
        )
    except pyjwt.InvalidTokenError:
        return None
    if isinstance(unverified, dict):
        value = unverified.get("type")
        return value if isinstance(value, str) else None
    return None


async def get_current_user(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    """Resolve the current authenticated user.

    Handles two token flavors:
      * Supabase access token — normal login; sub = auth user UUID.
      * Impersonation token   — signed by backend, sub = admin, act_as =
                                dealer UUID. The caller is resolved to the
                                IMPERSONATED dealer's user so downstream
                                dealer-scoped endpoints (/dealers/me, etc.)
                                see the dealer as the current identity.
                                Admin endpoints (`require_admin`) will
                                correctly reject because the resolved user
                                is user_type='dealer', not 'admin'.

    Raises 401 on bad/missing/expired tokens, 404 if the resolved user row
    isn't present in public.users.
    """
    token = _extract_bearer(request)

    if _peek_token_type(token) == "impersonation":
        # Deferred import — impersonation.py is a higher-level module that
        # imports settings (fine), but keeping the import lazy makes the
        # dependency direction obvious.
        from app.core.impersonation import decode_impersonation_token

        payload = decode_impersonation_token(token)
        dealer_id = uuid.UUID(payload["act_as"])
        dealer = await db.get(Dealer, dealer_id)
        if dealer is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Impersonated dealer not found",
            )
        user = await db.get(User, dealer.user_id)
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User row for impersonated dealer is missing",
            )
        return user

    # Default: Supabase JWT path.
    payload = _decode_supabase_jwt(token)

    sub = payload.get("sub")
    try:
        user_id = uuid.UUID(str(sub))
    except (TypeError, ValueError):
        raise AuthError("Malformed token subject")

    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User row missing from public.users (signup trigger may have failed)",
        )
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


async def require_admin(user: CurrentUser) -> User:
    if user.user_type != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return user


async def require_any_dealer(
    user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> tuple[User, Dealer]:
    """Loosened dealer dependency — only checks the dealer row exists.

    Used for endpoints that pre-verified-status dealers must access (KYC
    upload during signup, etc). Does NOT check `dealer.verified` so a
    pending application can still upload identity documents.
    """
    if user.user_type != "dealer":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Dealer access required",
        )
    dealer = (
        await db.execute(select(Dealer).where(Dealer.user_id == user.id))
    ).scalar_one_or_none()
    if dealer is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Dealer profile not found",
        )
    return user, dealer


async def require_marketplace_viewer(
    user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> tuple[User, Dealer | None]:
    """Read-only marketplace access — verified dealers OR admins.

    Returns (user, dealer) for dealers and (user, None) for admins. Use
    only on GET endpoints; admins do not place offers under their own
    identity (they impersonate via X-Impersonate-Dealer-Id for that).
    Callers that filter by "not the caller's own listings" must guard
    against `dealer is None`.
    """
    if user.user_type == "admin":
        return user, None
    if user.user_type != "dealer":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Dealer or admin access required",
        )
    dealer = (
        await db.execute(select(Dealer).where(Dealer.user_id == user.id))
    ).scalar_one_or_none()
    if dealer is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Dealer profile not found",
        )
    if dealer.archived_at is not None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="החשבון נמחק"
        )
    if dealer.suspended_at is not None:
        if dealer.suspension_silent:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="שירות לא זמין",
            )
        reason = dealer.suspended_reason or "ללא סיבה"
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"החשבון שלך הושעה — {reason}",
        )
    if not dealer.verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Dealer not yet verified",
        )
    return user, dealer


async def require_verified_dealer(
    user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> tuple[User, Dealer]:
    if user.user_type != "dealer":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Dealer access required",
        )
    dealer = (
        await db.execute(select(Dealer).where(Dealer.user_id == user.id))
    ).scalar_one_or_none()
    if dealer is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Dealer profile not found",
        )
    # Phase 6.7 — admin moderation gates BEFORE the verification check so
    # archive/suspend take precedence over "not yet verified".
    if dealer.archived_at is not None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="החשבון נמחק"
        )
    if dealer.suspended_at is not None:
        # Silent suspend returns a generic 503 — the dealer doesn't get a
        # clear explanation (the "shibush" the product asked for).
        if dealer.suspension_silent:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="שירות לא זמין",
            )
        # Reason-bearing suspend surfaces the exact admin reason so the
        # dealer (and the dealer-side banner) can show it.
        reason = dealer.suspended_reason or "ללא סיבה"
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"החשבון שלך הושעה — {reason}",
        )
    # Phase 2.1 added `dealers.verified` as the authoritative per-dealer
    # gate. This is distinct from `users.verified` (which is Supabase's
    # email-confirmation signal). A dealer is operable only once an admin
    # approves their application.
    if not dealer.verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Dealer not yet verified",
        )
    return user, dealer


# --------------------------------------------------------------------------
# Impersonation helper
# --------------------------------------------------------------------------


IMPERSONATE_HEADER = "X-Impersonate-Dealer-Id"


async def get_effective_dealer_id(
    user: CurrentUser,
    db: Annotated[AsyncSession, Depends(get_db)],
    x_impersonate_dealer_id: Annotated[
        str | None, Header(alias=IMPERSONATE_HEADER)
    ] = None,
) -> uuid.UUID:
    """Return the dealer_id the current request should act as.

    * Non-admin caller: returns the caller's own dealer_id.
    * Admin caller with X-Impersonate-Dealer-Id header: returns that
      dealer_id and writes an `audit_log` entry. Admin without header:
      403 (admins must either impersonate or call admin-only endpoints).
    """
    if user.user_type == "admin":
        if not x_impersonate_dealer_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Admin must set the X-Impersonate-Dealer-Id header on "
                    "dealer-scoped endpoints"
                ),
            )
        try:
            target = uuid.UUID(x_impersonate_dealer_id)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="X-Impersonate-Dealer-Id must be a UUID",
            )
        # Confirm the dealer exists before logging / returning.
        dealer = await db.get(Dealer, target)
        if dealer is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Impersonation target dealer not found",
            )
        db.add(
            AuditLog(
                actor_user_id=user.id,
                impersonated_dealer_id=target,
                action="impersonate.begin",
                target_type="dealer",
                target_id=target,
            )
        )
        await db.flush()
        return target

    # Non-admin: must be a dealer acting as themselves.
    dealer = (
        await db.execute(select(Dealer).where(Dealer.user_id == user.id))
    ).scalar_one_or_none()
    if dealer is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No dealer profile for this user",
        )
    return dealer.id
