"""Dealer signup flow.

Creates a Supabase auth user + public.users row (via on_auth_user_created
trigger) + dealers row. All three must succeed; on any DB-side failure we
delete the auth user so we never leak orphaned identities.

Rate limited to 5 requests/hour per IP — see `app/core/rate_limit.py`.
"""

from __future__ import annotations

import asyncio
import uuid as uuid_pkg
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.email import send_password_reset
from app.core.events import emit_event
from app.core.logging import get_logger
from app.core.rate_limit import rate_limit
from app.database import get_db
from app.models import Dealer, User
from app.schemas.dealer import DealerSignupRequest, SignupResponse

logger = get_logger(__name__)

router = APIRouter(prefix="/api/v1/auth", tags=["signup"])

signup_rate_limit = rate_limit("5/hour", scope="signup_dealer")


async def _create_supabase_auth_user(email: str, password: str) -> str:
    """Call Supabase Admin API (service_role) to create an auth user.

    Returns the new user's UUID. The `on_auth_user_created` DB trigger
    mirrors the row into public.users with user_type='dealer', verified=false.
    """
    url = f"{settings.supabase_url}/auth/v1/admin/users"
    headers = {
        "apikey": settings.supabase_secret_key,
        "Authorization": f"Bearer {settings.supabase_secret_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "email": email,
        "password": password,
        "email_confirm": True,  # auto-confirm, skip email verification step for now
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(url, headers=headers, json=payload)

    if resp.status_code in (400, 422):
        try:
            msg = (resp.json().get("msg") or resp.json().get("message") or "").lower()
        except (ValueError, AttributeError):
            msg = ""
        if any(word in msg for word in ("already", "exists", "registered")):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email already registered",
            )
        raise HTTPException(status_code=400, detail=f"Signup failed: {resp.text}")

    if resp.status_code not in (200, 201):
        logger.error(
            "Supabase admin createUser failed: %s %s", resp.status_code, resp.text
        )
        raise HTTPException(status_code=502, detail="Auth service error")

    return resp.json()["id"]


async def _delete_supabase_auth_user(user_id: str) -> None:
    """Rollback: delete auth user if our subsequent DB writes failed."""
    url = f"{settings.supabase_url}/auth/v1/admin/users/{user_id}"
    headers = {
        "apikey": settings.supabase_secret_key,
        "Authorization": f"Bearer {settings.supabase_secret_key}",
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.delete(url, headers=headers)
    except Exception as exc:  # noqa: BLE001
        logger.error("Failed to rollback auth user %s: %s", user_id, exc)


async def _check_unique_dealer_fields(
    db: AsyncSession, payload: DealerSignupRequest
) -> None:
    """Pre-flight: reject early with a specific Hebrew message if business_id
    or license_number is already taken. Catches the most common signup failures
    BEFORE we create a Supabase auth user, so we never leak orphans."""
    existing_biz = (
        await db.execute(
            select(Dealer.id).where(Dealer.business_id == payload.business_id).limit(1)
        )
    ).scalar_one_or_none()
    if existing_biz is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="ח.פ. / ע.מ זה כבר רשום במערכת",
        )

    existing_license = (
        await db.execute(
            select(Dealer.id)
            .where(Dealer.license_number == payload.license_number)
            .limit(1)
        )
    ).scalar_one_or_none()
    if existing_license is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="מספר רישיון סוחר זה כבר רשום במערכת",
        )


def _map_integrity_error(exc: Exception) -> HTTPException:
    """Translate an IntegrityError on the dealers insert into a Hebrew 409.

    The unique-violation messages from asyncpg/postgres include the constraint
    name. We surface a specific field message so the dealer knows what to fix
    instead of seeing a generic 500."""
    text = str(exc).lower()
    if "uq_dealers_business_id" in text or "business_id" in text:
        return HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="ח.פ. / ע.מ זה כבר רשום במערכת",
        )
    if "license_number" in text:
        return HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="מספר רישיון סוחר זה כבר רשום במערכת",
        )
    if "users_email_key" in text or "email" in text:
        return HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="כתובת האימייל כבר רשומה במערכת",
        )
    return HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="ההרשמה נכשלה — נסה שוב או פנה לתמיכה",
    )


async def _purge_user_row(db: AsyncSession, user_uuid: uuid_pkg.UUID) -> None:
    """Delete the public.users row written by the on_auth_user_created trigger
    so a failed signup doesn't leave the email blocked for future retries."""
    try:
        await db.execute(User.__table__.delete().where(User.id == user_uuid))
        await db.commit()
    except Exception as exc:  # noqa: BLE001
        logger.error("public.users orphan cleanup failed for %s: %s", user_uuid, exc)


@router.post(
    "/signup/dealer",
    response_model=SignupResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(signup_rate_limit)],
)
async def signup_dealer(
    payload: DealerSignupRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> SignupResponse:
    """Create a pending dealer account. Returns 201 on success.

    Failure mapping (so the UI can show a useful message):
      * 409 with Hebrew detail — duplicate business_id, license_number, or email
      * 502 — Supabase Admin API error (network, rate limit, etc.)
      * 500 — unexpected; the auth user AND public.users orphan are both purged
    """
    # Pre-flight uniqueness check against our own dealers table. Catches the
    # common case (re-using an existing business_id / license_number) BEFORE we
    # touch Supabase, so a failed signup never creates an orphan auth user.
    await _check_unique_dealer_fields(db, payload)

    auth_user_id = await _create_supabase_auth_user(payload.email, payload.password)
    user_uuid = uuid_pkg.UUID(auth_user_id)

    try:
        # Wait for the trigger to populate public.users.
        user: User | None = None
        for _ in range(5):
            await asyncio.sleep(0.2)
            result = await db.execute(select(User).where(User.id == user_uuid))
            user = result.scalar_one_or_none()
            if user is not None:
                break
        if user is None:
            raise HTTPException(
                status_code=500,
                detail="User sync trigger did not complete in time",
            )

        dealer = Dealer(
            user_id=user_uuid,
            business_name=payload.business_name,
            business_id=payload.business_id,
            license_number=payload.license_number,
            phone=payload.phone,
            city=payload.city,
            lot_size=payload.lot_size,
            contact_name=payload.contact_name,
            verified=False,
        )
        db.add(dealer)
        await db.flush()

        await emit_event(
            db,
            event_type="dealer.registered",
            aggregate_type="dealer",
            aggregate_id=dealer.id,
            payload={
                "business_name": dealer.business_name,
                "city": dealer.city,
                "email": payload.email,
            },
            actor_user_id=user_uuid,
        )

        await db.commit()

        return SignupResponse(
            message="Registration received. You will be notified when approved.",
            dealer_id=dealer.id,
            user_id=user_uuid,
            status="pending_verification",
        )

    except HTTPException:
        await db.rollback()
        await _delete_supabase_auth_user(auth_user_id)
        await _purge_user_row(db, user_uuid)
        raise
    except Exception as exc:
        await db.rollback()
        await _delete_supabase_auth_user(auth_user_id)
        await _purge_user_row(db, user_uuid)
        logger.error("Dealer signup failed: %s", exc, exc_info=True)
        # Try to surface a specific 4xx if it was a known integrity problem;
        # otherwise fall back to a Hebrew generic message.
        raise _map_integrity_error(exc)


# ==========================================================================
# Password reset — send our own Hebrew RTL email via Resend
# ==========================================================================


forgot_password_rate_limit = rate_limit("5/hour", scope="forgot_password")
login_rate_limit = rate_limit("20/hour", scope="auth_login")
otp_request_rate_limit = rate_limit("5/hour", scope="auth_otp_request")
otp_verify_rate_limit = rate_limit("20/hour", scope="auth_otp_verify")


# ==========================================================================
# Phase 5.1 — native client login proxy
#
# Native iOS / Android clients can't use the Supabase JS SDK; they POST
# email + password to /api/v1/auth/login and we forward to Supabase's
# password grant, returning the access token + refresh token.
# Web stays on the Supabase JS SDK directly.
# ==========================================================================


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    """Response shape for `/auth/login`.

    If the dealer has TOTP 2FA enabled, the FIRST step's response is
    `{requires_totp: True, partial_token: "..."}` — NOT a real session.
    Caller then POSTs to `/auth/login/totp` with the partial token + code.
    """

    access_token: str | None = None
    refresh_token: str | None = None
    expires_in: int | None = None
    token_type: str = "bearer"
    requires_totp: bool = False
    partial_token: str | None = None


@router.post(
    "/login",
    response_model=LoginResponse,
    dependencies=[Depends(login_rate_limit)],
)
async def login(
    body: LoginRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> LoginResponse:
    """Forward to Supabase's password grant endpoint.

    On success returns the standard Supabase access/refresh tokens. On
    invalid credentials returns 401 with a Hebrew-localized message.
    """
    url = f"{settings.supabase_url}/auth/v1/token?grant_type=password"
    headers = {
        "apikey": settings.supabase_publishable_key or settings.supabase_secret_key,
        "Content-Type": "application/json",
    }
    payload = {"email": body.email, "password": body.password}

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
    except httpx.HTTPError as exc:
        logger.warning("login proxy network error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="שגיאת רשת",
        )

    if resp.status_code in (400, 401, 403, 422):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="שם משתמש או סיסמה שגויים",
        )
    if resp.status_code != 200:
        logger.error("login proxy unexpected status=%s body=%r", resp.status_code, resp.text)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="שירות האימות לא זמין",
        )

    data = resp.json()
    access_token = data["access_token"]
    refresh_token = data.get("refresh_token")

    # Phase 4.4 — TOTP step. If the dealer has 2FA enabled, do NOT return
    # the real access token. Instead return a short-lived partial token
    # that only `/auth/login/totp` will accept. The frontend then prompts
    # for the 6-digit code.
    user_id = data.get("user", {}).get("id")
    if user_id:
        try:
            import uuid as _uuid

            uid = _uuid.UUID(user_id)
            dealer = (
                await db.execute(
                    select(Dealer).where(Dealer.user_id == uid)
                )
            ).scalar_one_or_none()
            if dealer and dealer.totp_enabled:
                # Mint a partial token bound to this user; expires in 5 min.
                partial = _make_partial_token(
                    user_id=str(uid),
                    access_token=access_token,
                    refresh_token=refresh_token or "",
                )
                return LoginResponse(
                    requires_totp=True,
                    partial_token=partial,
                )
        except Exception as exc:  # noqa: BLE001
            logger.warning("totp gating check failed: %s", exc)

    return LoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=data.get("expires_in"),
        token_type=data.get("token_type", "bearer"),
    )


# --- Partial-token helpers (HS256 JWT, signed with impersonation_secret) ---


def _make_partial_token(user_id: str, access_token: str, refresh_token: str) -> str:
    """5-minute JWT carrying the deferred access/refresh tokens. The
    impersonation_secret is reused as the HS256 key — it's already a
    server-only secret that's not used for ES256 user tokens."""
    import time
    import jwt as _pyjwt

    payload = {
        "sub": user_id,
        "iss": "autotradeil-totp",
        "iat": int(time.time()),
        "exp": int(time.time()) + 300,
        "at": access_token,
        "rt": refresh_token,
        "purpose": "totp_step",
    }
    return _pyjwt.encode(payload, settings.impersonation_secret, algorithm="HS256")


def _decode_partial_token(token: str) -> dict[str, object]:
    import jwt as _pyjwt

    try:
        payload = _pyjwt.decode(
            token,
            settings.impersonation_secret,
            algorithms=["HS256"],
            options={"require": ["exp", "iat", "sub", "purpose"]},
        )
    except _pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="פג תוקף — נסה להתחבר שוב")
    except _pyjwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="טוקן לא תקין")
    if payload.get("purpose") != "totp_step":
        raise HTTPException(status_code=401, detail="טוקן לא תקין")
    return payload


# --- /auth/login/totp ---


class TotpStepRequest(BaseModel):
    partial_token: str
    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


@router.post(
    "/login/totp",
    response_model=LoginResponse,
    dependencies=[Depends(login_rate_limit)],
)
async def login_totp(
    body: TotpStepRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> LoginResponse:
    """Second login step — verify TOTP code and release the access token."""
    import uuid as _uuid
    import pyotp as _pyotp

    payload = _decode_partial_token(body.partial_token)
    user_id = _uuid.UUID(str(payload["sub"]))
    dealer = (
        await db.execute(select(Dealer).where(Dealer.user_id == user_id))
    ).scalar_one_or_none()
    if dealer is None or not dealer.totp_enabled or not dealer.totp_secret:
        raise HTTPException(status_code=400, detail="2FA לא מופעל")

    if not _pyotp.TOTP(dealer.totp_secret).verify(body.code, valid_window=1):
        raise HTTPException(status_code=401, detail="קוד שגוי")

    return LoginResponse(
        access_token=str(payload["at"]),
        refresh_token=str(payload.get("rt") or "") or None,
        token_type="bearer",
    )


class ForgotPasswordRequest(BaseModel):
    email: EmailStr
    # Redirect URL the user lands on after clicking the link. Supplied by
    # the frontend so we don't need to hardcode environments here.
    redirect_to: str | None = None


async def _supabase_generate_recovery_link(
    email: str, redirect_to: str
) -> str | None:
    """Ask Supabase to mint a one-time recovery link for this email.

    Returns the link on success. On "user not found" returns None — we
    swallow that so the endpoint can stay always-200 (don't leak which
    emails are registered).
    """
    url = f"{settings.supabase_url}/auth/v1/admin/generate_link"
    headers = {
        "apikey": settings.supabase_secret_key,
        "Authorization": f"Bearer {settings.supabase_secret_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "type": "recovery",
        "email": email,
        "options": {"redirect_to": redirect_to},
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
    except httpx.HTTPError as exc:
        logger.warning("supabase generate_link network error: %s", exc)
        return None

    if resp.status_code == 404 or resp.status_code == 422:
        # User not found — swallow silently.
        return None
    if resp.status_code not in (200, 201):
        logger.warning(
            "supabase generate_link unexpected status=%s body=%r",
            resp.status_code,
            resp.text,
        )
        return None

    data = resp.json()
    # Response shape: { properties: { action_link: "..." }, ... }
    props = data.get("properties") or {}
    link = props.get("action_link") or data.get("action_link")
    return link if isinstance(link, str) else None


@router.post(
    "/forgot-password",
    dependencies=[Depends(forgot_password_rate_limit)],
)
async def forgot_password(body: ForgotPasswordRequest) -> dict[str, str]:
    """Trigger a password-reset email. Always returns 200 so callers can
    not enumerate valid emails."""
    redirect_to = body.redirect_to or "http://localhost:3000/reset-password"
    # Basic allowlist so we don't turn this into an open redirect.
    if not redirect_to.startswith(("http://localhost", "https://autotradeil.co.il")):
        redirect_to = "https://autotradeil.co.il/reset-password"

    try:
        link = await _supabase_generate_recovery_link(body.email, redirect_to)
        if link:
            await send_password_reset(to_email=body.email, reset_link=link)
    except Exception as exc:  # noqa: BLE001
        logger.warning("forgot-password handler failed: %s", exc)

    # Always-200; do not reveal existence.
    return {
        "message": "אם הכתובת קיימת במערכת, נשלח אליה קישור לאיפוס סיסמה.",
    }


# ==========================================================================
# Public OTP login flow (Phase 4.4 addendum) — passwordless via email code
# ==========================================================================


class OtpRequestBody(BaseModel):
    email: EmailStr


@router.post(
    "/otp/request",
    dependencies=[Depends(otp_request_rate_limit)],
)
async def public_otp_request(
    body: OtpRequestBody,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, str]:
    """Public — generate a 6-digit code and email it to the address.

    Always returns 200 to prevent email enumeration. Mirrors the
    /security/otp/send pattern but is callable without a session because
    the user is trying to log IN, not perform a privileged action.
    """
    import secrets

    from app.core.email import send_otp_email
    from app.routers.security import _hash_otp, _now, OTP_TTL_MINUTES
    from datetime import timedelta

    user = (
        await db.execute(select(User).where(User.email == body.email))
    ).scalar_one_or_none()
    if user is None or user.user_type != "dealer":
        return {"message": "אם הכתובת קיימת במערכת, נשלח אליה קוד חד פעמי."}

    dealer = (
        await db.execute(select(Dealer).where(Dealer.user_id == user.id))
    ).scalar_one_or_none()
    if dealer is None:
        return {"message": "אם הכתובת קיימת במערכת, נשלח אליה קוד חד פעמי."}

    code = f"{secrets.randbelow(1_000_000):06d}"
    dealer.otp_code_hash = _hash_otp(code, str(dealer.id))
    dealer.otp_expires_at = _now() + timedelta(minutes=OTP_TTL_MINUTES)
    dealer.otp_method = "email"
    await db.commit()

    try:
        await send_otp_email(
            to_email=user.email, business_name=dealer.business_name, code=code
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("public otp send failed: %s", exc)

    return {"message": "אם הכתובת קיימת במערכת, נשלח אליה קוד חד פעמי."}


class OtpVerifyBody(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


@router.post(
    "/otp/verify",
    response_model=LoginResponse,
    dependencies=[Depends(otp_verify_rate_limit)],
)
async def public_otp_verify(
    body: OtpVerifyBody,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> LoginResponse:
    """Public — verify OTP, mint a Supabase session via admin link.

    On success:
      - Clear the consumed OTP (single-use).
      - Use Supabase admin `generate_link` (type=magiclink) to mint a real
        session, then exchange the action_link for tokens via the verify
        endpoint. Cleaner: just call admin generate_link with `type=magiclink`
        and parse the action link's hash params — but Supabase exposes
        `properties.access_token`+`refresh_token` directly on the response.
    """
    import hmac
    from app.routers.security import _hash_otp, _now

    user = (
        await db.execute(select(User).where(User.email == body.email))
    ).scalar_one_or_none()
    if user is None or user.user_type != "dealer":
        raise HTTPException(status_code=401, detail="קוד שגוי או פג תוקף")
    dealer = (
        await db.execute(select(Dealer).where(Dealer.user_id == user.id))
    ).scalar_one_or_none()
    if dealer is None or dealer.otp_code_hash is None or dealer.otp_expires_at is None:
        raise HTTPException(status_code=401, detail="קוד שגוי או פג תוקף")
    if _now() > dealer.otp_expires_at:
        dealer.otp_code_hash = None
        dealer.otp_expires_at = None
        await db.commit()
        raise HTTPException(status_code=401, detail="הקוד פג תוקף")

    expected = _hash_otp(body.code, str(dealer.id))
    if not hmac.compare_digest(expected, dealer.otp_code_hash):
        raise HTTPException(status_code=401, detail="קוד שגוי")

    # Consume the code.
    dealer.otp_code_hash = None
    dealer.otp_expires_at = None
    await db.commit()

    # Mint a session via Supabase admin generate_link (type=magiclink).
    url = f"{settings.supabase_url}/auth/v1/admin/generate_link"
    headers = {
        "apikey": settings.supabase_secret_key,
        "Authorization": f"Bearer {settings.supabase_secret_key}",
        "Content-Type": "application/json",
    }
    payload = {"type": "magiclink", "email": body.email}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
        if resp.status_code != 200:
            logger.warning(
                "supabase magiclink failed status=%s body=%r",
                resp.status_code,
                resp.text,
            )
            raise HTTPException(status_code=502, detail="שירות האימות לא זמין")
        data = resp.json()
    except httpx.HTTPError as exc:
        logger.warning("magiclink network error: %s", exc)
        raise HTTPException(status_code=502, detail="שגיאת רשת")

    # `properties.action_link` contains hash params with the access/refresh
    # tokens — but the cleaner shape is `properties.hashed_token` + email
    # which the client would then submit to /auth/v1/verify. For now we
    # parse the action_link hash to extract tokens directly.
    from urllib.parse import urlparse, parse_qs

    action_link = (data.get("properties") or {}).get("action_link", "")
    fragment = urlparse(action_link).fragment
    params = parse_qs(fragment)
    access = params.get("access_token", [None])[0]
    refresh = params.get("refresh_token", [None])[0]

    if not access:
        # Some Supabase responses return tokens at top-level instead.
        access = data.get("access_token")
        refresh = data.get("refresh_token")

    if not access:
        logger.error("magiclink response missing access_token: %r", data)
        raise HTTPException(status_code=502, detail="שירות האימות לא זמין")

    return LoginResponse(
        access_token=access,
        refresh_token=refresh,
        token_type="bearer",
    )
