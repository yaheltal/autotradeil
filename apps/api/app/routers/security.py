"""Dealer security router (Phase 3.5).

Endpoints:

    OTP
        POST /api/v1/security/otp/send         body={method}
        POST /api/v1/security/otp/verify       body={code}

    TOTP (RFC 6238 — Google Authenticator compatible)
        POST /api/v1/security/2fa/setup        -> {secret, qr_url, qr_data_url}
        POST /api/v1/security/2fa/enable       body={secret, code}
        POST /api/v1/security/2fa/disable      body={code}
        POST /api/v1/security/2fa/verify       body={code}

    KYC
        POST /api/v1/security/kyc/upload       multipart: document_type, file
        GET  /api/v1/security/kyc/status
        GET  /api/v1/security/kyc/pending      (admin)
        POST /api/v1/security/kyc/{id}/approve (admin)
        POST /api/v1/security/kyc/{id}/reject  (admin) body={reason}

Security notes:
    - OTP codes are stored as salted SHA-256 hashes (`_hash_otp`). The
      plaintext never touches the DB. Expiry window = 10 minutes.
    - Rate limit = 3 OTP sends per rolling 10-minute window per dealer.
    - TOTP secrets are base32 as required by RFC 6238. Stored only after
      the dealer proves possession with a matching code.
    - KYC docs are uploaded as Cloudinary `type=authenticated` assets —
      the URLs returned here are time-limited signed URLs (10 min).
      Plaintext URLs are never stored; we only persist Cloudinary
      public_ids and recompute signed URLs per request.
"""

from __future__ import annotations

import hashlib
import hmac
import io
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated, Literal

import pyotp
import qrcode
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_admin, require_any_dealer, require_verified_dealer
from app.core.cloudinary_client import sign_kyc_url, upload_kyc_document
from app.core.config import settings
from app.core.email import send_kyc_approved, send_kyc_rejected, send_otp_email
from app.core.events import emit_event
from app.core.logging import get_logger
from app.core.sms import _normalize_il_phone, send_sms
from app.database import get_db
from app.models import Dealer, User

logger = get_logger(__name__)

router = APIRouter(prefix="/api/v1/security", tags=["security"])


# =============================================================================
# Helpers
# =============================================================================

OTP_TTL_MINUTES = 10
OTP_MAX_SENDS_PER_WINDOW = 3
OTP_WINDOW_MINUTES = 10
KYC_MAX_BYTES = 10 * 1024 * 1024  # 10 MB per doc
KYC_ALLOWED_MIME = frozenset(
    {
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
        "image/heic",
        "application/pdf",
    }
)
KYC_DOC_FIELD_MAP: dict[str, str] = {
    "id_front": "id_card_front_url",
    "id_back": "id_card_back_url",
    "dealer_license": "dealer_license_url",
}


def _generate_otp() -> str:
    """Cryptographically-random 6-digit OTP (leading zeros OK)."""
    n = secrets.randbelow(1_000_000)
    return f"{n:06d}"


def _hash_otp(code: str, salt: str) -> str:
    """HMAC-SHA256 of the OTP, salted with the dealer's id. Gives a
    64-char hex digest that fits our `otp_code_hash` VARCHAR(128)."""
    return hashlib.sha256((salt + code).encode("utf-8")).hexdigest()


def _now() -> datetime:
    return datetime.now(tz=timezone.utc)


async def _rate_limit_ok(dealer: Dealer, db: AsyncSession) -> bool:
    """Window-based rate limit: 3 sends per 10 minutes. Rolling window
    restarts whenever the oldest send in the window ages out."""
    now = _now()
    window = timedelta(minutes=OTP_WINDOW_MINUTES)

    if dealer.otp_send_window_start is None or (
        now - dealer.otp_send_window_start > window
    ):
        dealer.otp_send_window_start = now
        dealer.otp_send_count = 0

    if dealer.otp_send_count >= OTP_MAX_SENDS_PER_WINDOW:
        return False

    dealer.otp_send_count += 1
    await db.flush()
    return True


# =============================================================================
# OTP
# =============================================================================


class OtpSendBody(BaseModel):
    method: Literal["email", "sms"] = "email"


class OtpVerifyBody(BaseModel):
    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


@router.post("/otp/send")
async def otp_send(
    body: OtpSendBody,
    ud: Annotated[tuple[User, Dealer], Depends(require_verified_dealer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, str]:
    user, dealer = ud

    if not await _rate_limit_ok(dealer, db):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"הגעת למכסה של {OTP_MAX_SENDS_PER_WINDOW} בקשות ב-{OTP_WINDOW_MINUTES} דקות",
        )

    if body.method == "sms" and not dealer.phone:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="לא הוגדר מספר טלפון לסוחר",
        )

    code = _generate_otp()
    dealer.otp_code_hash = _hash_otp(code, str(dealer.id))
    dealer.otp_expires_at = _now() + timedelta(minutes=OTP_TTL_MINUTES)
    dealer.otp_method = body.method
    await db.flush()
    await db.commit()

    sent = False
    if body.method == "email":
        sent = await send_otp_email(
            to_email=user.email,
            business_name=dealer.business_name,
            code=code,
        )
    else:
        sent = await send_sms(
            to_phone=dealer.phone,
            message=f"קוד האימות שלך ב-AutoTradeIL: {code}. תקף ל-{OTP_TTL_MINUTES} דקות.",
        )

    if not sent:
        # Don't leak which side failed — just surface a generic error.
        logger.warning("otp send failed method=%s dealer=%s", body.method, dealer.id)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="שליחת הקוד נכשלה, אנא נסה שוב",
        )

    return {"method": body.method, "expires_in_minutes": str(OTP_TTL_MINUTES)}


@router.post("/otp/verify")
async def otp_verify(
    body: OtpVerifyBody,
    ud: Annotated[tuple[User, Dealer], Depends(require_verified_dealer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, bool]:
    _, dealer = ud

    if dealer.otp_code_hash is None or dealer.otp_expires_at is None:
        raise HTTPException(status_code=400, detail="לא נשלח קוד אימות")

    if _now() > dealer.otp_expires_at:
        dealer.otp_code_hash = None
        dealer.otp_expires_at = None
        await db.commit()
        raise HTTPException(status_code=400, detail="הקוד פג תוקף")

    expected = _hash_otp(body.code, str(dealer.id))
    if not hmac.compare_digest(expected, dealer.otp_code_hash):
        raise HTTPException(status_code=400, detail="קוד שגוי")

    # Consume — single use.
    dealer.otp_code_hash = None
    dealer.otp_expires_at = None
    await db.commit()

    return {"verified": True}


# =============================================================================
# TOTP
# =============================================================================


class TotpEnableBody(BaseModel):
    secret: str = Field(min_length=16, max_length=64)
    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


class TotpCodeBody(BaseModel):
    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


@router.post("/2fa/setup")
async def totp_setup(
    ud: Annotated[tuple[User, Dealer], Depends(require_verified_dealer)],
) -> dict[str, str]:
    """Generate a fresh TOTP secret + provisioning URI + QR data URL.

    The secret is returned to the client but NOT persisted yet — only
    after the dealer proves possession by calling /2fa/enable with a
    matching code."""
    import base64

    user, dealer = ud
    secret = pyotp.random_base32()
    totp = pyotp.TOTP(secret)
    provisioning = totp.provisioning_uri(
        name=user.email, issuer_name="AutoTradeIL"
    )

    # Render QR to PNG → data URL
    img = qrcode.make(provisioning)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    qr_data_url = (
        "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")
    )

    return {
        "secret": secret,
        "qr_url": provisioning,
        "qr_data_url": qr_data_url,
    }


@router.post("/2fa/enable")
async def totp_enable(
    body: TotpEnableBody,
    ud: Annotated[tuple[User, Dealer], Depends(require_verified_dealer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, bool]:
    user, dealer = ud
    if not pyotp.TOTP(body.secret).verify(body.code, valid_window=1):
        raise HTTPException(status_code=400, detail="קוד שגוי")

    dealer.totp_secret = body.secret
    dealer.totp_enabled = True
    await emit_event(
        db,
        event_type="security.2fa.enabled",
        aggregate_type="dealer",
        aggregate_id=dealer.id,
        payload={"dealer_id": str(dealer.id)},
        actor_user_id=user.id,
    )
    await db.commit()
    return {"enabled": True}


@router.post("/2fa/disable")
async def totp_disable(
    body: TotpCodeBody,
    ud: Annotated[tuple[User, Dealer], Depends(require_verified_dealer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, bool]:
    user, dealer = ud
    if not dealer.totp_enabled or not dealer.totp_secret:
        raise HTTPException(status_code=400, detail="2FA לא מופעל")
    if not pyotp.TOTP(dealer.totp_secret).verify(body.code, valid_window=1):
        raise HTTPException(status_code=400, detail="קוד שגוי")

    dealer.totp_secret = None
    dealer.totp_enabled = False
    await emit_event(
        db,
        event_type="security.2fa.disabled",
        aggregate_type="dealer",
        aggregate_id=dealer.id,
        payload={"dealer_id": str(dealer.id)},
        actor_user_id=user.id,
    )
    await db.commit()
    return {"enabled": False}


@router.post("/2fa/verify")
async def totp_verify(
    body: TotpCodeBody,
    ud: Annotated[tuple[User, Dealer], Depends(require_verified_dealer)],
) -> dict[str, bool]:
    _, dealer = ud
    if not dealer.totp_enabled or not dealer.totp_secret:
        raise HTTPException(status_code=400, detail="2FA לא מופעל")
    if not pyotp.TOTP(dealer.totp_secret).verify(body.code, valid_window=1):
        raise HTTPException(status_code=400, detail="קוד שגוי")
    return {"verified": True}


# =============================================================================
# KYC
# =============================================================================


def _kyc_public_id_for(dealer_id: uuid.UUID, document_type: str) -> str:
    return f"autotradeil/kyc/{dealer_id}/{document_type}"


async def _signed_kyc_url(stored_url: str | None, dealer_id: uuid.UUID, doc_type: str) -> str | None:
    """Given the stored (at-upload-time) URL, mint a fresh signed URL."""
    if not stored_url:
        return None
    public_id = _kyc_public_id_for(dealer_id, doc_type)
    return await sign_kyc_url(public_id)


@router.post("/kyc/upload")
async def kyc_upload(
    ud: Annotated[tuple[User, Dealer], Depends(require_any_dealer)],
    db: Annotated[AsyncSession, Depends(get_db)],
    document_type: str = Form(...),
    file: UploadFile = File(...),
) -> dict[str, str]:
    user, dealer = ud

    if document_type not in KYC_DOC_FIELD_MAP:
        raise HTTPException(status_code=400, detail="סוג מסמך לא תקין")

    if file.content_type not in KYC_ALLOWED_MIME:
        raise HTTPException(
            status_code=400, detail="סוג קובץ לא נתמך (JPEG / PNG / WebP / HEIC / PDF)"
        )

    contents = await file.read()
    if len(contents) > KYC_MAX_BYTES:
        raise HTTPException(status_code=400, detail="הקובץ גדול מדי (מקסימום 10MB)")

    result = await upload_kyc_document(
        file_bytes=contents,
        dealer_id=str(dealer.id),
        document_type=document_type,
        content_type=file.content_type,
    )

    field = KYC_DOC_FIELD_MAP[document_type]
    setattr(dealer, field, result["url"])

    # Phase 6.8.6 — auto-submission removed. The dealer must explicitly
    # press "סיום תהליך" which calls /kyc/finalize. That gives the dealer
    # a chance to review the uploads and gives us a hook to email support.
    # Re-uploading after rejection: clear the rejection reason so the
    # dealer can finalize again.
    if dealer.kyc_status == "rejected" and (
        dealer.id_card_front_url
        and dealer.id_card_back_url
        and dealer.dealer_license_url
    ):
        dealer.kyc_rejected_reason = None
        dealer.kyc_status = "pending"

    await emit_event(
        db,
        event_type="kyc.document.uploaded",
        aggregate_type="dealer",
        aggregate_id=dealer.id,
        payload={"document_type": document_type, "kyc_status": dealer.kyc_status},
        actor_user_id=user.id,
    )
    await db.commit()

    return {
        "url": result["url"],
        "kyc_status": dealer.kyc_status,
    }


@router.get("/kyc/status")
async def kyc_status(
    ud: Annotated[tuple[User, Dealer], Depends(require_any_dealer)],
) -> dict[str, object]:
    _, dealer = ud
    return {
        "kyc_status": dealer.kyc_status,
        "id_card_front_url": await _signed_kyc_url(
            dealer.id_card_front_url, dealer.id, "id_front"
        ),
        "id_card_back_url": await _signed_kyc_url(
            dealer.id_card_back_url, dealer.id, "id_back"
        ),
        "dealer_license_url": await _signed_kyc_url(
            dealer.dealer_license_url, dealer.id, "dealer_license"
        ),
        "kyc_rejected_reason": dealer.kyc_rejected_reason,
    }


# ---------- Admin ----------


@router.get("/kyc/pending")
async def kyc_pending(
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> list[dict[str, object]]:
    rows = (
        (
            await db.execute(
                select(Dealer, User)
                .join(User, User.id == Dealer.user_id)
                .where(Dealer.kyc_status == "submitted")
                .order_by(Dealer.updated_at.desc())
            )
        ).all()
    )
    out: list[dict[str, object]] = []
    for dealer, user in rows:
        out.append(
            {
                "id": str(dealer.id),
                "business_name": dealer.business_name,
                "email": user.email,
                "city": dealer.city,
                "id_card_front_url": await _signed_kyc_url(
                    dealer.id_card_front_url, dealer.id, "id_front"
                ),
                "id_card_back_url": await _signed_kyc_url(
                    dealer.id_card_back_url, dealer.id, "id_back"
                ),
                "dealer_license_url": await _signed_kyc_url(
                    dealer.dealer_license_url, dealer.id, "dealer_license"
                ),
            }
        )
    return out


class KycRejectBody(BaseModel):
    reason: str = Field(min_length=1, max_length=500)


@router.post("/kyc/{dealer_id}/approve")
async def kyc_approve(
    dealer_id: uuid.UUID,
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, str]:
    dealer = (
        await db.execute(select(Dealer).where(Dealer.id == dealer_id))
    ).scalar_one_or_none()
    if dealer is None:
        raise HTTPException(status_code=404, detail="סוחר לא נמצא")

    if dealer.kyc_status != "submitted":
        raise HTTPException(
            status_code=400, detail="ניתן לאשר רק בקשה שהוגשה"
        )

    dealer.kyc_status = "approved"
    dealer.kyc_rejected_reason = None

    user = (
        await db.execute(select(User).where(User.id == dealer.user_id))
    ).scalar_one()

    await emit_event(
        db,
        event_type="kyc.approved",
        aggregate_type="dealer",
        aggregate_id=dealer.id,
        payload={"dealer_id": str(dealer.id)},
        actor_user_id=admin.id,
    )
    await db.commit()

    try:
        await send_kyc_approved(to_email=user.email, business_name=dealer.business_name)
    except Exception as exc:  # noqa: BLE001
        logger.warning("kyc approved email failed: %s", exc)

    return {"kyc_status": "approved"}


@router.post("/kyc/{dealer_id}/reject")
async def kyc_reject(
    dealer_id: uuid.UUID,
    body: KycRejectBody,
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, str]:
    dealer = (
        await db.execute(select(Dealer).where(Dealer.id == dealer_id))
    ).scalar_one_or_none()
    if dealer is None:
        raise HTTPException(status_code=404, detail="סוחר לא נמצא")

    if dealer.kyc_status != "submitted":
        raise HTTPException(
            status_code=400, detail="ניתן לדחות רק בקשה שהוגשה"
        )

    dealer.kyc_status = "rejected"
    dealer.kyc_rejected_reason = body.reason

    user = (
        await db.execute(select(User).where(User.id == dealer.user_id))
    ).scalar_one()

    await emit_event(
        db,
        event_type="kyc.rejected",
        aggregate_type="dealer",
        aggregate_id=dealer.id,
        payload={"dealer_id": str(dealer.id), "reason": body.reason},
        actor_user_id=admin.id,
    )
    await db.commit()

    try:
        await send_kyc_rejected(
            to_email=user.email, business_name=dealer.business_name, reason=body.reason
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("kyc rejected email failed: %s", exc)

    return {"kyc_status": "rejected", "reason": body.reason}


# =============================================================================
# Phone update
# =============================================================================


class PhoneUpdateBody(BaseModel):
    phone: str = Field(min_length=7, max_length=20)


@router.post("/phone")
async def update_phone(
    body: PhoneUpdateBody,
    ud: Annotated[tuple[User, Dealer], Depends(require_verified_dealer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, str]:
    """Save dealer phone (Israeli format). Normalizes to E.164."""
    _, dealer = ud
    normalized = _normalize_il_phone(body.phone)
    dealer.phone = normalized
    await db.commit()
    return {"phone": normalized}


class OtpMethodBody(BaseModel):
    method: Literal["email", "sms"]


@router.post("/otp/method")
async def set_otp_method(
    body: OtpMethodBody,
    ud: Annotated[tuple[User, Dealer], Depends(require_verified_dealer)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, str]:
    _, dealer = ud
    if body.method == "sms" and not dealer.phone:
        raise HTTPException(status_code=400, detail="יש להזין מספר טלפון תחילה")
    dealer.otp_method = body.method
    await db.commit()
    return {"method": body.method}


# =============================================================================
# Phase 6.6 — KYC photo extraction (public, called during signup)
# =============================================================================

from app.core.rate_limit import rate_limit
from app.schemas.kyc import KYCExtractResponse

kyc_extract_rate_limit = rate_limit("5/hour", scope="kyc_extract")


@router.post("/kyc/extract", response_model=KYCExtractResponse)
async def kyc_extract(
    id_front: UploadFile = File(...),
    id_back: UploadFile = File(...),
    license_doc: UploadFile = File(..., alias="license"),
    _: None = Depends(kyc_extract_rate_limit),
) -> KYCExtractResponse:
    """Extract personal info from three KYC documents using Claude vision.

    Public — called during signup BEFORE the user exists. Rate-limited to
    5/hour/IP. Always returns 200 with the best-effort fields; missing
    fields are null so the wizard can fall back to manual entry.
    """
    import base64
    import json as _json

    if not settings.anthropic_api_key:
        return KYCExtractResponse(warnings=["AI service not configured"])

    async def encode(f: UploadFile) -> tuple[str, str]:
        content = await f.read()
        if len(content) > KYC_MAX_BYTES:
            raise HTTPException(status_code=400, detail="קובץ גדול מדי")
        media = (
            "image/jpeg" if f.content_type in (None, "image/heic") else f.content_type
        )
        return media, base64.standard_b64encode(content).decode("ascii")

    try:
        fmt_front, b64_front = await encode(id_front)
        fmt_back, b64_back = await encode(id_back)
        fmt_lic, b64_lic = await encode(license_doc)
    except HTTPException:
        raise

    import anthropic

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    prompt = """אתה מקבל 3 תמונות של מסמכי זיהוי ישראליים:
1. ת"ז קדמי
2. ת"ז אחורי
3. רישיון סוחר רכב

החזר אך ורק JSON (ללא טקסט נוסף, ללא code fences) במבנה:
{
  "first_name": "שם פרטי בעברית או null",
  "last_name": "שם משפחה בעברית או null",
  "id_number": "מספר ת״ז 9 ספרות או null",
  "birth_date": "YYYY-MM-DD או null",
  "license_number": "מספר רישיון סוחר או null",
  "license_until": "YYYY-MM-DD תאריך תפוגת רישיון או null",
  "city": "עיר מגורים בעברית או null",
  "confidence": "high" | "medium" | "low",
  "warnings": ["תיאור בעיה אחת או יותר", ...]
}
אם שדה אינו קריא — null. אל תנחש."""

    try:
        msg = client.messages.create(
            model="claude-opus-4-7",
            max_tokens=600,
            timeout=30,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": fmt_front,
                                "data": b64_front,
                            },
                        },
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": fmt_back,
                                "data": b64_back,
                            },
                        },
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": fmt_lic,
                                "data": b64_lic,
                            },
                        },
                        {"type": "text", "text": prompt},
                    ],
                }
            ],
        )
    except Exception as exc:  # noqa: BLE001
        logger.warning("kyc extract Claude call failed: %s", exc)
        return KYCExtractResponse(warnings=["AI extraction failed"])

    text = ""
    for blk in msg.content:
        if getattr(blk, "type", None) == "text":
            text = blk.text
            break

    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:].strip()
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return KYCExtractResponse(warnings=["AI returned unparseable JSON"])
    try:
        parsed = _json.loads(cleaned[start : end + 1])
    except _json.JSONDecodeError:
        return KYCExtractResponse(warnings=["AI returned unparseable JSON"])

    try:
        return KYCExtractResponse(**parsed)
    except Exception as exc:  # noqa: BLE001
        logger.info("kyc extract validation failed: %s payload=%s", exc, parsed)
        return KYCExtractResponse(warnings=["Some extracted fields were invalid"])
