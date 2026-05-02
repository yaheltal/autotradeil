"""SQLAlchemy async engine, session factory, and FastAPI dependency."""

from collections.abc import AsyncIterator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import settings
from app.core.logging import get_logger
from app.models.base import Base

logger = get_logger(__name__)

engine = create_async_engine(
    settings.database_url,
    echo=False,
    pool_pre_ping=True,
    # Increased from 5 to support 30+ concurrent dealers
    pool_size=20,
    max_overflow=30,
)

SessionLocal: async_sessionmaker[AsyncSession] = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


async def get_db() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency. Yields a session; commits on success, rolls back on error."""
    async with SessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def ping_db() -> tuple[bool, str | None]:
    """Lightweight connectivity check. Returns (ok, error_message)."""
    try:
        async with SessionLocal() as session:
            await session.execute(text("SELECT 1"))
        return True, None
    except Exception as exc:
        logger.warning("db ping failed: %s", exc)
        return False, str(exc)


__all__ = ["Base", "engine", "SessionLocal", "get_db", "ping_db"]
