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

from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import case, or_, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models.user import User


# Per-day cap for free-tier users. Pro users skip this gate entirely at
# the call site, so this constant only ever applies to free.
DAILY_LIMIT_FREE = 5


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

    Single `UPDATE ... RETURNING` so the read sees the post-reset count
    and two concurrent callers can't both observe a stale value across
    the day boundary. Commits inline because the reset must be durable
    before the caller decides whether to proceed with session creation —
    we don't want a crash mid-handler to leave the counter "still 5" on
    a fresh day.
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
                    0,
                ),
                else_=User.daily_session_count,
            ),
            count_reset_date=today,
        )
        .returning(User.daily_session_count)
    )
    result = await db.execute(stmt)
    await db.commit()
    # Keep the ORM-attached instance in sync so any later code in the same
    # handler that reads user.daily_session_count sees the post-reset value.
    await db.refresh(user, attribute_names=["daily_session_count", "count_reset_date"])
    return result.scalar_one()


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
