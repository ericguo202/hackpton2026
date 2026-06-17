"""
Daily session limit for free-tier users.

Free users get 5 completed interview sessions per local calendar day. The
counter increments on session finalization (in `submit_turn`'s final-turn
branch), not on session creation — a user who bails before the evaluator
runs doesn't get charged a slot, but also doesn't get any feedback. The
pre-check at `POST /sessions` only reads the counter, so a race between
two concurrent starts at count=4 can let one extra session through; the
next start sees count=6 and 429s.

Both helpers below use a single atomic `UPDATE` statement so the lazy
reset (zero the counter on a new local day) cannot race with itself. A
read-modify-write in Python would have a TOCTOU window across the day
boundary; SQL-side `CASE` is race-free because Postgres takes a row lock
on the UPDATE.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException, status
from sqlalchemy import case, or_, update
from sqlalchemy.ext.asyncio import AsyncSession

# Note: `or_` is still used by `increment`; `case` stays for that path too.
# `check_and_reset` uses `is_distinct_from` so the UPDATE never fires on a
# row whose `count_reset_date` is already today — see its docstring.

from app.db.models.enums import UserTier
from app.db.models.user import User
from app.db.session import AsyncSessionLocal

logger = logging.getLogger(__name__)


# Per-day cap for free-tier users. Pro users skip this gate entirely at
# the call site, so this constant only ever applies to free.
DAILY_LIMIT_FREE = 5

# Per-day cap on Ask Tutor chat COMPLETIONS for free-tier users. A completion
# is a successful LLM response, not a sent message — see `record_chat_completion`.
DAILY_CHAT_LIMIT_FREE = 10


def _today_in_tz(tz_name: str | None) -> date:
    """User's "today" in their local timezone.

    Falls back to UTC if `tz_name` is missing or not a known IANA name. A
    bad value silently degrades rather than raising — a stale or stripped
    timezone string should never block a legitimate session.
    """
    if tz_name:
        try:
            return datetime.now(ZoneInfo(tz_name)).date()
        except ZoneInfoNotFoundError:
            pass
    return datetime.now(timezone.utc).date()


async def check_and_reset(db: AsyncSession, user: User) -> int:
    """Atomically roll the counter over if stale, then return its value.

    The UPDATE is gated by `count_reset_date IS DISTINCT FROM :today` so
    the common path (counter already current for today's local date) does
    zero writes — `/me` is hit on every route guard, so writing every
    call would multiply write load by the read load. `IS DISTINCT FROM`
    also handles the NULL case (first-ever call for a user) in the same
    predicate, since `NULL IS DISTINCT FROM <date>` is TRUE.

    When the UPDATE does fire, it's atomic + race-free: Postgres row-locks
    the user row, so two concurrent callers crossing the day boundary
    can't both reset. Commits inline because the reset must be durable
    before the caller decides whether to proceed with session creation —
    we don't want a crash mid-handler to leave the counter "still 5" on
    a fresh day.
    """
    today = _today_in_tz(user.timezone)
    stmt = (
        update(User)
        .where(
            User.id == user.id,
            User.count_reset_date.is_distinct_from(today),
        )
        .values(
            daily_session_count=0,
            count_reset_date=today,
        )
        .returning(User.daily_session_count)
    )
    result = await db.execute(stmt)
    row = result.scalar_one_or_none()
    if row is not None:
        # Reset fired. Commit + resync the ORM instance so later code in
        # the same handler reads the post-reset value.
        await db.commit()
        await db.refresh(
            user, attribute_names=["daily_session_count", "count_reset_date"]
        )
        return row
    # No reset needed — the stored counter is already today's. The ORM
    # instance is already current; no commit because nothing was written.
    return user.daily_session_count


async def enforce_daily_limit(
    db: AsyncSession, user: User, *, timezone: str | None = None
) -> None:
    """Persist the client's timezone, then 429 if the free-tier daily cap is hit.

    Shared by the two session-creating endpoints (`create_session` and
    `practice_saved_question`) so the gate policy — which tier it applies to,
    the 429 copy, and the tz-before-reset ordering — lives in exactly one
    place. The timezone is written first so `check_and_reset` computes "today"
    in the user's local calendar. Pro users skip the gate entirely. The counter
    only advances at finalization (`increment`), so this read-only pre-check can
    let one extra session through under a tight race — by design (see the module
    docstring).
    """
    if timezone and timezone != user.timezone:
        user.timezone = timezone
        await db.commit()
    if user.tier != UserTier.free:
        return
    current_count = await check_and_reset(db, user)
    if current_count >= DAILY_LIMIT_FREE:
        logger.info(
            "Free-tier daily limit hit clerk_user_id=%s count=%s",
            user.clerk_user_id, current_count,
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"You have reached your daily limit of {DAILY_LIMIT_FREE} "
                "interviews. Come back tomorrow."
            ),
        )


async def increment(db: AsyncSession, user: User) -> None:
    """Atomically bump the counter by 1 — or reset to 1 on a new local day.

    Does NOT commit. Designed to be called from `submit_turn`'s final-turn
    branch right before the commit that flips `session.status` to
    `completed`, so the counter bump and the session completion ship in
    one transaction. If the caller's commit fails, the counter doesn't
    advance either — no double-charge, no orphan increment.
    """
    today = _today_in_tz(user.timezone)
    stmt = (
        update(User)
        .where(User.id == user.id)
        .values(
            daily_session_count=case(
                (
                    or_(
                        User.count_reset_date.is_(None),
                        User.count_reset_date < today,
                    ),
                    1,
                ),
                else_=User.daily_session_count + 1,
            ),
            count_reset_date=today,
        )
    )
    await db.execute(stmt)


# ── Ask Tutor chat-completion daily limit ──────────────────────────────────────
# Same shape as the session limit above, on the `daily_chat_count` /
# `chat_count_reset_date` columns, keyed on the same `_today_in_tz` local day.


async def check_and_reset_chat(db: AsyncSession, user: User) -> int:
    """Atomically roll the chat counter over if stale, then return its value.

    Mirrors `check_and_reset` on the Ask Tutor columns: gated by
    `chat_count_reset_date IS DISTINCT FROM :today` so the steady-state path
    (already current for today) does zero writes — `/me` calls this on every
    view. `IS DISTINCT FROM` also covers the first-ever (NULL) case.
    """
    today = _today_in_tz(user.timezone)
    stmt = (
        update(User)
        .where(
            User.id == user.id,
            User.chat_count_reset_date.is_distinct_from(today),
        )
        .values(
            daily_chat_count=0,
            chat_count_reset_date=today,
        )
        .returning(User.daily_chat_count)
    )
    result = await db.execute(stmt)
    row = result.scalar_one_or_none()
    if row is not None:
        await db.commit()
        await db.refresh(
            user, attribute_names=["daily_chat_count", "chat_count_reset_date"]
        )
        return row
    return user.daily_chat_count


async def enforce_chat_daily_limit(db: AsyncSession, user: User) -> None:
    """429 if the free-tier daily Ask Tutor chat cap is already hit.

    Read-only pre-check (no increment) — the counter only advances on a
    successful completion via `record_chat_completion`. Pro users skip the gate.
    Run before any moderation / LLM spend so an over-limit caller costs nothing.
    """
    if user.tier != UserTier.free:
        return
    current_count = await check_and_reset_chat(db, user)
    if current_count >= DAILY_CHAT_LIMIT_FREE:
        logger.info(
            "Free-tier daily chat limit hit clerk_user_id=%s count=%s",
            user.clerk_user_id, current_count,
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"You have reached your daily limit of {DAILY_CHAT_LIMIT_FREE} "
                "tutor chats. It resets at midnight."
            ),
        )


async def record_chat_completion(user_id, tz_name: str | None) -> int:
    """Count one successful chat completion; return the caller's remaining quota.

    Called from inside the Ask Tutor SSE generator AFTER a reply streams
    successfully, which is past the request-scoped DB session's lifecycle — so
    this opens its OWN session (same isolation rationale as incident logging)
    and commits inline. The atomic `CASE` both increments and rolls the counter
    over on a new local day, so a completion straddling midnight opens a fresh
    day at 1. Returns `max(0, limit - new_count)` remaining for the wire.
    """
    today = _today_in_tz(tz_name)
    async with AsyncSessionLocal() as session:
        stmt = (
            update(User)
            .where(User.id == user_id)
            .values(
                daily_chat_count=case(
                    (
                        or_(
                            User.chat_count_reset_date.is_(None),
                            User.chat_count_reset_date < today,
                        ),
                        1,
                    ),
                    else_=User.daily_chat_count + 1,
                ),
                chat_count_reset_date=today,
            )
            .returning(User.daily_chat_count)
        )
        new_count = (await session.execute(stmt)).scalar_one()
        await session.commit()
    return max(0, DAILY_CHAT_LIMIT_FREE - new_count)
