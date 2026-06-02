import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager

from app.api.v1.router import api_router
from app.core.config import settings
from app.db.session import check_db_connection
from app.services.incidents import log_error

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
    yield
    # Shutdown (add cleanup here if needed)


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
