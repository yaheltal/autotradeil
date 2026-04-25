"""Cloudinary helpers for vehicle image uploads.

Uses the service-role credentials from settings. Uploads are stored under
`autotradeil/dealers/{dealer_id}/{inventory_id}/` and transformed to
WebP at a capped 1200×900 with `auto:good` quality.

`init_cloudinary()` is idempotent — safe to call on every request.
"""

from __future__ import annotations

from typing import Any

import cloudinary
import cloudinary.uploader

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


def init_cloudinary() -> None:
    cloudinary.config(
        cloud_name=settings.cloudinary_cloud_name,
        api_key=settings.cloudinary_api_key,
        api_secret=settings.cloudinary_api_secret,
        secure=True,
    )


async def upload_vehicle_image(
    file_bytes: bytes,
    dealer_id: str,
    inventory_id: str,
    filename: str,
) -> dict[str, Any]:
    """Upload a vehicle image. Returns `{url, public_id, width, height}`."""
    init_cloudinary()
    result = cloudinary.uploader.upload(
        file_bytes,
        folder=f"autotradeil/dealers/{dealer_id}/{inventory_id}",
        public_id=filename,
        overwrite=True,
        transformation=[
            {
                "width": 1200,
                "height": 900,
                "crop": "limit",
                "quality": "auto:good",
            },
        ],
        format="webp",
    )
    logger.info(
        "cloudinary upload ok dealer=%s inv=%s public_id=%s",
        dealer_id,
        inventory_id,
        result.get("public_id"),
    )
    return {
        "url": result["secure_url"],
        "public_id": result["public_id"],
        "width": result.get("width"),
        "height": result.get("height"),
    }


async def upload_kyc_document(
    file_bytes: bytes,
    dealer_id: str,
    document_type: str,
    content_type: str,
) -> dict[str, Any]:
    """Upload a KYC document with `type=authenticated` so the delivered
    URL requires a signed view. Folder is `autotradeil/kyc/{dealer_id}/`.

    `document_type` is one of `id_front`, `id_back`, `dealer_license` —
    used as the public_id so re-uploads overwrite the old copy.

    PDFs are kept as-is (resource_type=raw/auto). Images get a size cap.
    """
    init_cloudinary()

    is_image = content_type.startswith("image/")
    kwargs: dict[str, Any] = {
        "folder": f"autotradeil/kyc/{dealer_id}",
        "public_id": document_type,
        "overwrite": True,
        "type": "authenticated",
        "resource_type": "image" if is_image else "auto",
    }
    if is_image:
        kwargs["transformation"] = [
            {"width": 2000, "height": 2000, "crop": "limit", "quality": "auto:good"},
        ]

    result = cloudinary.uploader.upload(file_bytes, **kwargs)
    logger.info(
        "cloudinary kyc upload ok dealer=%s type=%s public_id=%s",
        dealer_id,
        document_type,
        result.get("public_id"),
    )
    return {
        "url": result["secure_url"],
        "public_id": result["public_id"],
        "resource_type": result.get("resource_type"),
    }


async def sign_kyc_url(public_id: str, resource_type: str = "image") -> str:
    """Return a short-lived signed URL for a KYC document.

    Cloudinary's `utils.cloudinary_url` with `sign_url=True` + `type=authenticated`
    produces a URL that expires after the configured window. We set
    `expires_at` 10 minutes out — long enough for an admin to view but
    short enough that a leaked URL is useless quickly.
    """
    import time

    import cloudinary.utils

    init_cloudinary()
    url, _ = cloudinary.utils.cloudinary_url(
        public_id,
        type="authenticated",
        resource_type=resource_type,
        sign_url=True,
        secure=True,
        auth_token={"duration": 600},  # 10 minutes
        expires_at=int(time.time()) + 600,
    )
    return url


async def upload_dealer_logo(
    file_bytes: bytes,
    dealer_id: str,
    content_type: str,
) -> dict[str, Any]:
    """Upload a dealer business-logo image. Public URL (not authenticated),
    capped at 600×600, WebP. Folder: `autotradeil/logos/{dealer_id}/`.
    """
    init_cloudinary()
    if not content_type.startswith("image/"):
        raise ValueError("logo must be an image")

    result = cloudinary.uploader.upload(
        file_bytes,
        folder=f"autotradeil/logos/{dealer_id}",
        public_id="logo",
        overwrite=True,
        transformation=[
            {"width": 600, "height": 600, "crop": "limit", "quality": "auto:good"},
        ],
        format="webp",
    )
    return {"url": result["secure_url"], "public_id": result["public_id"]}


async def delete_vehicle_image(public_id: str) -> bool:
    """Best-effort delete. Returns True if Cloudinary confirmed."""
    init_cloudinary()
    result = cloudinary.uploader.destroy(public_id)
    ok = result.get("result") == "ok"
    if not ok:
        logger.warning("cloudinary delete failed public_id=%s result=%s", public_id, result)
    return ok
