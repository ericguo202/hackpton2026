import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager

from app.api.v1.router import api_router
from app.core.config import settings
from app.db.session import check_db_connection
from app.services.delivery_retention_scheduler import (
    start_retention_scheduler,
    stop_retention_scheduler,
)
from app.services.incidents import log_error
from app.services.moderation import (
    ModerationUnavailableError,
    ensure_moderation_configured,
)

# Make app-level `logger.info(...)` calls visible in stdout. uvicorn's
# --log-level only configures its own access/error loggers, so without
# this every `logging.getLogger(__name__).info(...)` in the codebase
# (research completion, background-eval status, moderation rejects, etc.)
# would be silently dropped at the WARNING root threshold.
logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s:%(name)s:%(message)s",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await check_db_connection()
    # Fail closed: refuse to boot if content moderation isn't configured, so
    # production can never run with the content-policy layer silently disabled.
    ensure_moderation_configured()
    # Enforce the delivery-analytics retention ceiling on a daily cadence so the
    # consent's "deleted within 12 months of your last session" promise is real.
    retention_task = start_retention_scheduler()
    yield
    # Shutdown
    await stop_retention_scheduler(retention_task)


app = FastAPI(
    title=settings.PROJECT_NAME,
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_origin_regex=settings.ALLOWED_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")


@app.get("/")
async def root():
    return {"message": f"{settings.PROJECT_NAME} is running"}


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    if exc.status_code >= 500:
        await log_error(
            exc,
            user_id=getattr(request.state, "user_id", None),
            clerk_user_id=getattr(request.state, "clerk_user_id", None),
            metadata={
                "source": "http_exception",
                "method": request.method,
                "path": request.url.path,
                "status_code": exc.status_code,
            },
        )
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers=getattr(exc, "headers", None),
    )


@app.exception_handler(ModerationUnavailableError)
async def moderation_unavailable_handler(
    request: Request, exc: ModerationUnavailableError
):
    # Moderation failed closed — block the request with a retryable 503. The
    # outage was already recorded as an error incident inside check_moderation,
    # so we don't re-log here. A generic message avoids leaking internals.
    return JSONResponse(
        status_code=503,
        content={
            "detail": (
                "Content checks are temporarily unavailable. "
                "Please try again in a moment."
            )
        },
        headers={"Retry-After": "30"},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    await log_error(
        exc,
        user_id=getattr(request.state, "user_id", None),
        clerk_user_id=getattr(request.state, "clerk_user_id", None),
        metadata={
            "source": "unhandled_exception",
            "method": request.method,
            "path": request.url.path,
            "status_code": 500,
        },
    )
    logger = logging.getLogger(__name__)
    logger.exception("Unhandled request error: %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )
