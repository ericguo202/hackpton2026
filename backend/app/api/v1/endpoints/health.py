import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db

router = APIRouter()

logger = logging.getLogger(__name__)


@router.get("")
async def health_check():
    return {"status": "ok"}


@router.get("/2")
async def health_check2():
    return {"status": "also ok"}


@router.get("/db")
async def db_health_check(db: AsyncSession = Depends(get_db)):
    try:
        await db.execute(text("SELECT 1"))
        return {"status": "ok", "database": "connected"}
    except Exception:
        # Log the underlying error server-side; never leak DB internals
        # (driver/DSN/host details) to an unauthenticated caller.
        logger.exception("Database health check failed")
        raise HTTPException(status_code=503, detail="Database unavailable")
