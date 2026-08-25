"""
Usage limits for free-tier users: turns per day, sessions per week, chats per day.

The daily cap counts TURNS, not sessions. It used to count sessions (5/day),
which was a sound proxy back when every interview was exactly 2 turns. Variable
session length (2-8) broke that: each turn fires an evaluator call, a coaching
call, a next-question call and a TTS synthesis, so the same 5 sessions can cost
anywhere from 10 to 40 turns of spend. Counting the thing we actually pay for
removes the 4x spread.

Three counters, all on the `users` row, all reset lazily against the user's
local calendar:

* `daily_turn_count` / `count_reset_date` — turns ANSWERED today (cap 10).
  Charged in `submit_turn` as each transcript is persisted, in that same
  transaction, so a session abandoned by closing the tab still pays for the
  turns it consumed. (`count_reset_date` keeps its name from the session era —
  it holds the date the daily counter was stamped, whatever that counter counts.)
* `weekly_session_count` / `week_reset_date` — sessions started this local week
  (cap 10), where a week begins Monday 00:00 local. Bounds the per-session fixed
  spend — company research + opening question + TTS, all incurred at create —
  which the turn counter cannot see. Charged on the session's FIRST answered
  turn: charging at create would burn one of only 10 weekly slots on a mic
  failure, and charging at finalization would let a tab-close abandon evade the
  cap entirely.
* `daily_chat_count` / `chat_count_reset_date` — successful Ask Tutor chat
  completions today (cap 10). Unchanged.

The pre-check at `POST /sessions` only READS the session counters, so a race
between two concurrent starts can let one extra session through; the next start
sees the over-limit count and 429s. Accepted — the alternative is holding a row
lock across research + TTS.

Every helper below does its lazy reset in a single atomic `UPDATE`. A
read-modify-write in Python would have a TOCTOU window across the day boundary;
SQL-side `CASE` is race-free because Postgres row-locks on the UPDATE.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException, status
from sqlalchemy import case, or_, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.enums import UserTier
from app.db.models.user import User
from app.db.session import AsyncSessionLocal

logger = logging.getLogger(__name__)


# Per-day cap on ANSWERED TURNS for free-tier users. Pro users skip this gate
# entirely at the call site, so this constant only ever applies to free.
DAILY_TURN_LIMIT_FREE = 10

# Per-week cap on sessions for free-tier users. The week is a fixed local
# calendar week starting Monday (see `_week_start_in_tz`), not a rolling
# 168-hour window — "resets Monday" is something a user can plan around.
WEEKLY_SESSION_LIMIT_FREE = 10

# Floor on a session's turn count, mirroring `SessionCreateIn.num_turns`'s
# `ge=2` and the `interview_sessions.num_turns BETWEEN 2 AND 8` DB check. A
# caller with fewer turns left than this can't be given a shortened session, so
# they're refused outright instead.
MIN_SESSION_TURNS = 2

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


def _week_start_in_tz(tz_name: str | None) -> date:
    """Monday of the user's current local week.

    The weekly window is a fixed calendar week, not a rolling 168 hours: a
    rolling window would need a COUNT over `interview_sessions` on every session
    create and could only tell the user "a slot frees up Thursday at 4pm", where
    a fixed week resets predictably and rides the same cheap counter column as
    the daily cap. Monday chosen over Sunday so a weekend of practice lands in
    one window rather than straddling two.

    Shares `_today_in_tz`'s UTC fallback, so a missing or unparseable timezone
    degrades instead of raising.
    """
    today = _today_in_tz(tz_name)
    return today - timedelta(days=today.weekday())


async def check_and_reset_turns(db: AsyncSession, user: User) -> int:
    """Atomically roll the daily TURN counter over if stale, then return it.

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
    we don't want a crash mid-handler to leave the counter "still 10" on
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
            daily_turn_count=0,
            count_reset_date=today,
        )
        .returning(User.daily_turn_count)
    )
    result = await db.execute(stmt)
    row = result.scalar_one_or_none()
    if row is not None:
        # Reset fired. Commit + resync the ORM instance so later code in
        # the same handler reads the post-reset value.
        await db.commit()
        await db.refresh(
            user, attribute_names=["daily_turn_count", "count_reset_date"]
        )
        return row
    # No reset needed — the stored counter is already today's. The ORM
    # instance is already current; no commit because nothing was written.
    return user.daily_turn_count


async def check_and_reset_week(db: AsyncSession, user: User) -> int:
    """Atomically roll the weekly SESSION counter over if stale, then return it.

    Identical shape to `check_and_reset_turns` on the `weekly_session_count` /
    `week_reset_date` pair, keyed on `_week_start_in_tz` instead of the local
    day. Zero writes in steady state; `IS DISTINCT FROM` covers the first-ever
    (NULL) case so the column self-seeds without a backfill.
    """
    week_start = _week_start_in_tz(user.timezone)
    stmt = (
        update(User)
        .where(
            User.id == user.id,
            User.week_reset_date.is_distinct_from(week_start),
        )
        .values(
            weekly_session_count=0,
            week_reset_date=week_start,
        )
        .returning(User.weekly_session_count)
    )
    result = await db.execute(stmt)
    row = result.scalar_one_or_none()
    if row is not None:
        await db.commit()
        await db.refresh(
            user, attribute_names=["weekly_session_count", "week_reset_date"]
        )
        return row
    return user.weekly_session_count


async def enforce_session_start_limits(
    db: AsyncSession,
    user: User,
    *,
    timezone: str | None = None,
    requested_turns: int,
) -> int:
    """Persist the client's timezone, apply both session-start caps, return the
    turn count the session may actually run for.

    Shared by the two session-creating endpoints (`create_session` and
    `practice_saved_question`) so the gate policy — which tier it applies to,
    the 429 copy, the ordering — lives in exactly one place. The timezone is
    written first so both resets compute the user's local calendar.

    Order matters: the WEEKLY cap is checked first because it is the harder
    stop. A user out of weekly sessions can't start anything regardless of how
    many turns they have left, and checking it first keeps the 429 message
    pointed at the limit they'd actually have to wait longest for.

    The daily TURN cap does not reject an over-long request — it CLAMPS it. A
    user with 3 turns left who asks for 8 gets a 3-turn session rather than a
    dead end; only a caller below `MIN_SESSION_TURNS` (the DB floor on
    `interview_sessions.num_turns`) is refused. The frontend caps its length
    slider to the same number, so in practice the clamp is invisible.

    Both counters advance later, in `submit_turn` — per answered turn, and on
    turn 1 for the weekly slot — so this read-only pre-check can let one extra
    session through under a tight race, by design (see the module docstring).
    """
    if timezone and timezone != user.timezone:
        user.timezone = timezone
        await db.commit()
    if user.tier != UserTier.free:
        return requested_turns

    weekly_count = await check_and_reset_week(db, user)
    if weekly_count >= WEEKLY_SESSION_LIMIT_FREE:
        logger.info(
            "Free-tier weekly session limit hit clerk_user_id=%s count=%s",
            user.clerk_user_id, weekly_count,
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"You have reached your weekly limit of "
                f"{WEEKLY_SESSION_LIMIT_FREE} interviews. It resets Monday."
            ),
        )

    turns_used = await check_and_reset_turns(db, user)
    turns_left = DAILY_TURN_LIMIT_FREE - turns_used
    if turns_left < MIN_SESSION_TURNS:
        logger.info(
            "Free-tier daily turn limit hit clerk_user_id=%s count=%s",
            user.clerk_user_id, turns_used,
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"You have reached your daily limit of {DAILY_TURN_LIMIT_FREE} "
                "interview questions. Come back tomorrow."
            ),
        )

    return min(requested_turns, turns_left)


async def increment_turns(db: AsyncSession, user: User) -> None:
    """Count one answered turn — or reset to 1 on a new local day.

    Does NOT commit. Called from `submit_turn` right after the transcript is
    written onto the pending turn, so the charge and the answer ship in one
    transaction: if question generation or TTS then raises and the handler
    rolls back, the turn isn't persisted and the user isn't charged for it.

    A turn is charged when ANSWERED rather than when the session finalizes.
    Every submitted turn fires an evaluator call, a coaching call, a
    next-question call and a TTS synthesis, so a session abandoned by closing
    the tab — which the lazy reaper deliberately won't finalize while a turn is
    still unanswered — really did cost what it consumed.
    """
    today = _today_in_tz(user.timezone)
    stmt = (
        update(User)
        .where(User.id == user.id)
        .values(
            daily_turn_count=case(
                (
                    or_(
                        User.count_reset_date.is_(None),
                        User.count_reset_date < today,
                    ),
                    1,
                ),
                else_=User.daily_turn_count + 1,
            ),
            count_reset_date=today,
        )
    )
    await db.execute(stmt)


async def increment_week(db: AsyncSession, user: User) -> None:
    """Count one session against the weekly cap — or reset to 1 on a new week.

    Does NOT commit; rides the caller's transaction like `increment_turns`.
    Called from `submit_turn` on turn 1 only, which is the moment a session
    stops being a free abandon and becomes real engagement.
    """
    week_start = _week_start_in_tz(user.timezone)
    stmt = (
        update(User)
        .where(User.id == user.id)
        .values(
            weekly_session_count=case(
                (
                    or_(
                        User.week_reset_date.is_(None),
                        User.week_reset_date < week_start,
                    ),
                    1,
                ),
                else_=User.weekly_session_count + 1,
            ),
            week_reset_date=week_start,
        )
    )
    await db.execute(stmt)


# ── Ask Tutor chat-completion daily limit ──────────────────────────────────────
# Same shape as the turn limit above, on the `daily_chat_count` /
# `chat_count_reset_date` columns, keyed on the same `_today_in_tz` local day.


async def check_and_reset_chat(db: AsyncSession, user: User) -> int:
    """Atomically roll the chat counter over if stale, then return its value.

    Mirrors `check_and_reset_turns` on the Ask Tutor columns: gated by
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


async def record_chat_completion(user_id: UUID, tz_name: str | None) -> int:
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
