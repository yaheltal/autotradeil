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


async def delete_vehicle_image(public_id: str) -> bool:
    """Best-effort delete. Returns True if Cloudinary confirmed."""
    init_cloudinary()
    result = cloudinary.uploader.destroy(public_id)
    ok = result.get("result") == "ok"
    if not ok:
        logger.warning("cloudinary delete failed public_id=%s result=%s", public_id, result)
    return ok
