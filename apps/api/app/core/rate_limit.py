"""FastAPI-native rate limiting using the `limits` library.

slowapi's decorator wrapper breaks FastAPI signature introspection of
body + dependency parameters (a known issue in the project). We use the
same underlying `limits` package but expose it as a plain FastAPI
dependency, which sidesteps that bug.

Storage is in-memory per process. For a multi-replica deployment,
swap MemoryStorage for RedisStorage without changing callers.
"""

from __future__ import annotations

from typing import Callable

from fastapi import HTTPException, Request, status
from limits import parse as parse_limit
from limits.storage import MemoryStorage
from limits.strategies import MovingWindowRateLimiter

_storage = MemoryStorage()
_strategy = MovingWindowRateLimiter(_storage)


def rate_limit(expression: str, scope: str) -> Callable[[Request], None]:
    """Return a FastAPI dependency that enforces `expression` per client IP.

    Example:
        signup_rl = rate_limit("5/hour", scope="signup_dealer")

        @router.post("/signup/dealer", dependencies=[Depends(signup_rl)])
        async def signup_dealer(...): ...
    """
    limit_item = parse_limit(expression)

    def _dep(request: Request) -> None:
        client = request.client
        ip = client.host if client else "unknown"
        if not _strategy.hit(limit_item, scope, ip):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Rate limit exceeded ({expression})",
                headers={"Retry-After": "3600"},
            )

    _dep.__name__ = f"rate_limit_{scope}"
    return _dep
