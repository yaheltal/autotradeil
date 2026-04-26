import time
import uuid
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app.core.config import settings


# ---------------------------------------------------------------------------
# Sentry — initialize BEFORE the FastAPI() instance so the SDK can patch the
# starlette/asgi internals correctly. Empty DSN → no-op (zero overhead).
#
# `before_send` filters out client-error HTTPExceptions (4xx). Those are
# normal control flow (auth failures, 404s, validation errors) — sending
# them to Sentry would just create noise + eat the free-tier quota. We
# still capture 5xx and uncaught exceptions, which is what we actually
# care about in production.
# ---------------------------------------------------------------------------
if settings.sentry_dsn:
    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration

    def _drop_4xx_http_exceptions(event, hint):  # type: ignore[no-untyped-def]
        exc_info = hint.get("exc_info") if hint else None
        if exc_info:
            exc = exc_info[1]
            if isinstance(exc, HTTPException) and 400 <= exc.status_code < 500:
                return None  # drop — not a real error
        return event

    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.environment,
        traces_sample_rate=settings.sentry_traces_sample_rate,
        # PII off by default — we never want dealer ID-document URLs or
        # JWT contents leaking into Sentry breadcrumbs.
        send_default_pii=False,
        integrations=[
            FastApiIntegration(transaction_style="endpoint"),
            SqlalchemyIntegration(),
        ],
        before_send=_drop_4xx_http_exceptions,
    )
from app.core.errors import register_exception_handlers
from app.core.logging import configure_logging, get_logger, log_request
from app.routers import (
    admin,
    ai,
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

# gzip everything ≥1KB. Marketplace search responses hit ~30-80KB; this
# typically saves 70-85% on the wire. Negligible CPU on Render's Starter
# instance; FastAPI applies the middleware lazily so small responses
# (auth probes, healthz) skip compression entirely.
app.add_middleware(GZipMiddleware, minimum_size=1024)

register_exception_handlers(app)

_request_logger = get_logger("app.request")


@app.middleware("http")
async def request_context(request: Request, call_next):  # type: ignore[no-untyped-def]
    request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:12]
    start = time.perf_counter()

    response = await call_next(request)

    duration_ms = (time.perf_counter() - start) * 1000
    response.headers["X-Request-ID"] = request_id

    # Default cache headers for safe, idempotent reads. Endpoints that
    # need different policies (e.g. /security/kyc/* with signed URLs)
    # can override by setting Cache-Control before this middleware sees
    # the response — we only fill in when the handler didn't.
    if (
        request.method == "GET"
        and 200 <= response.status_code < 300
        and "cache-control" not in (k.lower() for k in response.headers.keys())
    ):
        path = request.url.path
        if path in ("/", "/healthz") or path.startswith("/api/v1/health"):
            # Public health probes — short cache so Render's load
            # balancer + uptime pings don't all hit Postgres.
            response.headers["Cache-Control"] = "public, max-age=30"
        elif path.startswith("/api/v1/"):
            # Authenticated API responses are user-specific — keep them
            # private; allow short fresh-cache + 5min stale-while-revalidate
            # so the browser can re-render instantly while the next fetch
            # refreshes in the background.
            response.headers["Cache-Control"] = (
                "private, max-age=0, stale-while-revalidate=300"
            )

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
app.include_router(ai.router)


@app.get("/")
async def root() -> dict[str, str]:
    return {"service": "autotradeil-api", "version": "0.1.0"}
