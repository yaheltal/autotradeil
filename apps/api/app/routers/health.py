from datetime import datetime, timezone

from fastapi import APIRouter

from app.core.config import settings
from app.core.logging import get_logger
from app.database import ping_db

router = APIRouter(tags=["health"])
logger = get_logger(__name__)


@router.get("/health")
async def health() -> dict[str, object]:
    db_ok, db_err = await ping_db()

    payload: dict[str, object] = {
        "status": "ok" if db_ok else "degraded",
        "service": "autotradeil-api",
        "version": "0.1.0",
        "environment": settings.environment,
        "database_connected": db_ok,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    if not db_ok and db_err:
        payload["error"] = db_err
    return payload
