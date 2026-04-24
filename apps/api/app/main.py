import time
import uuid
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.errors import register_exception_handlers
from app.core.logging import configure_logging, get_logger, log_request
from app.routers import (
    admin,
    auth_test,
    dealers,
    health,
    inventory,
    marketplace,
    security,
    signup,
)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    configure_logging(settings.log_level)
    logger = get_logger("app.startup")
    logger.info(
        "starting autotradeil-api env=%s cors=%s",
        settings.environment,
        settings.cors_origins,
    )
    yield
    logger.info("stopping autotradeil-api")


app = FastAPI(
    title="AutoTradeIL API",
    version="0.1.0",
    description="Backend for AutoTradeIL - car trading platform",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
    max_age=600,
)

register_exception_handlers(app)

_request_logger = get_logger("app.request")


@app.middleware("http")
async def request_context(request: Request, call_next):  # type: ignore[no-untyped-def]
    request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:12]
    start = time.perf_counter()

    response = await call_next(request)

    duration_ms = (time.perf_counter() - start) * 1000
    response.headers["X-Request-ID"] = request_id
    log_request(
        _request_logger,
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
        rid=request_id,
    )
    return response


app.include_router(health.router)
app.include_router(auth_test.router)
app.include_router(signup.router)
app.include_router(dealers.router)
app.include_router(admin.router)
app.include_router(inventory.router)
app.include_router(marketplace.marketplace_router)
app.include_router(marketplace.notifications_router)
app.include_router(security.router)


@app.get("/")
async def root() -> dict[str, str]:
    return {"service": "autotradeil-api", "version": "0.1.0"}
