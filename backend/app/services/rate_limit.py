"""
Per-user fixed-window rate limiting for spend-amplifying endpoints.

The only spend cap elsewhere is the daily *session* limit (`daily_limit.py`),
which gates session creation. The autocomplete and onboarding endpoints,
though authenticated, are otherwise ungated and each fan out to moderation +
OpenRouter LLM calls. A single valid Clerk token (cheap to obtain via self-serve
sign-up) could script them in a tight loop and run up unbounded third-party
cost. This module bounds that.

Design mirrors `daily_limit.py`: a single atomic SQL statement does the
read-modify-write, so concurrent requests — including across the two blue/green
API replicas — can't race the counter. State lives in the `rate_limits` table
(shared across replicas), not in process memory; an in-process counter would
only see one replica's traffic and let the real limit drift to ~2x.

Fixed-window (not sliding / token-bucket) is deliberate: it's one upsert with no
background sweeper, and "slightly permissive at the window edge" is fine for an
anti-abuse cap. Window boundaries are epoch-aligned (`now // window * window`)
so every replica agrees on which window a given instant falls in.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass

from fastapi import Depends, HTTPException, status
from sqlalchemy import case
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import get_current_user_db
from app.db.models.rate_limit import RateLimit
from app.db.models.user import User
from app.db.session import get_db

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class RateLimitRule:
    """`limit` requests allowed per `window_seconds`-long fixed window."""

    limit: int
    window_seconds: int


# Per-operation quotas. Autocomplete is the hot path (fires as the user types —
# 1 moderation + up to 2 LLM calls each), so its window is sized to comfortably
# clear real typing bursts while still turning "unbounded" into a hard ceiling.
# Onboarding is rare per user but heavy (PDF parse + moderation), so a tight
# window is plenty for a human and caps parse abuse.
RULES: dict[str, RateLimitRule] = {
    "autocomplete": RateLimitRule(limit=60, window_seconds=60),
    "onboarding": RateLimitRule(limit=10, window_seconds=60),
}


async def enforce_rate_limit(db: AsyncSession, user: User, bucket: str) -> None:
    """429 if `user` has exceeded `bucket`'s quota for the current window.

    One INSERT ... ON CONFLICT DO UPDATE both rolls the window over (when the
    stored `window_start` is stale) and increments the counter, returning the
    post-increment count. Because it's a single statement, Postgres row-locks
    the (user, bucket) row, so two concurrent requests — same replica or not —
    can't both read a pre-increment value. Commits inline so the count is
    durable regardless of what the rest of the request does.
    """
    rule = RULES.get(bucket)
    if rule is None:  # misconfigured bucket name — fail open rather than 500
        logger.error("Unknown rate-limit bucket %r; allowing request", bucket)
        return

    now = int(time.time())
    window_start = now - (now % rule.window_seconds)

    stmt = (
        pg_insert(RateLimit)
        .values(
            user_id=user.id,
            bucket=bucket,
            window_start=window_start,
            count=1,
        )
        .on_conflict_do_update(
            index_elements=["user_id", "bucket"],
            set_={
                # Existing window still current → increment; otherwise the
                # stored window is stale, so this request opens a fresh one at 1.
                "count": case(
                    (RateLimit.window_start == window_start, RateLimit.count + 1),
                    else_=1,
                ),
                "window_start": window_start,
            },
        )
        .returning(RateLimit.count)
    )
    result = await db.execute(stmt)
    current = result.scalar_one()
    await db.commit()

    if current > rule.limit:
        retry_after = max(1, window_start + rule.window_seconds - now)
        logger.info(
            "Rate limit hit user_id=%s bucket=%s count=%s/%s",
            user.id, bucket, current, rule.limit,
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Please slow down and try again shortly.",
            headers={"Retry-After": str(retry_after)},
        )


def rate_limited(bucket: str):
    """FastAPI dependency factory: gate a route on `bucket`'s quota.

    Use in a route's `dependencies=[...]`. Re-uses `get_current_user_db` and
    `get_db` as sub-dependencies; FastAPI caches both within a request, so this
    adds no extra DB session or user upsert on top of what the endpoint already
    resolves. The check runs as a dependency, i.e. before the endpoint body, so
    a 429 short-circuits *before* any moderation / LLM spend.
    """

    async def _dependency(
        user: User = Depends(get_current_user_db),
        db: AsyncSession = Depends(get_db),
    ) -> None:
        await enforce_rate_limit(db, user, bucket)

    return _dependency
