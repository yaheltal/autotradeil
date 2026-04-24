from datetime import datetime, timezone

from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict[str, str]:
    return {
        "status": "ok",
        "service": "autotradeil-api",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
