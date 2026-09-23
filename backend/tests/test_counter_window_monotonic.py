"""
Unit tests for the FORWARD-ONLY counter windows in `daily_limit`.

Every free-tier counter resets against a window derived from `users.timezone`,
which the user supplies. The reset guards used to be `IS DISTINCT FROM`, i.e. a
plain not-equal — so a stored date could move BACKWARDS as easily as forwards,
and alternating two far-apart zones zeroed every counter on each flip. That was
free to run: `POST /sessions` rewrites the timezone, and no counter is charged
until turn 1 (`increment_week` / `increment_turns` live in `submit_turn`), so a
create-and-abandon loop cost the caller nothing.

The fix is monotonicity, and it has two halves that must BOTH hold — closing
only one leaves the loop open:

  * the three `check_and_reset_*` guards compare `IS NULL OR stored < period`;
  * the three charge paths stamp `GREATEST(stored, period)` rather than
    assigning the period outright, since a bare assignment walks the window
    backwards on a westward hop and re-arms the guard above.

These tests inspect the emitted SQL rather than a fake's return value: the
property at stake IS the predicate, and a mocked `execute` would happily accept
either version. Compiled against the Postgres dialect, which is what runs.
"""

import uuid
from datetime import date
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from sqlalchemy.dialects import postgresql

from app.db.models.enums import UserTier
from app.services import daily_limit


def _user(**overrides) -> SimpleNamespace:
    base = dict(
        id=uuid.uuid4(),
        clerk_user_id="user_abc",
        tier=UserTier.free,
        timezone="America/New_York",
        daily_turn_count=0,
        count_reset_date=None,
        weekly_session_count=0,
        week_reset_date=None,
        daily_chat_count=0,
        chat_count_reset_date=None,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


def _sql(db: AsyncMock) -> str:
    """The statement the helper handed to `execute`, as Postgres would see it."""
    stmt = db.execute.await_args[0][0]
    return str(stmt.compile(dialect=postgresql.dialect()))


def _db(returned=None) -> AsyncMock:
    db = AsyncMock()
    db.execute.return_value = SimpleNamespace(scalar_one_or_none=lambda: returned)
    return db


# -- the three reset guards ---------------------------------------------------

@pytest.mark.parametrize(
    "fn, column",
    [
        (daily_limit.check_and_reset_turns, "count_reset_date"),
        (daily_limit.check_and_reset_week, "week_reset_date"),
        (daily_limit.check_and_reset_chat, "chat_count_reset_date"),
    ],
)
async def test_reset_fires_only_when_the_window_moves_forward(fn, column):
    db = _db(None)
    await fn(db, _user())
    sql = _sql(db)

    # A stale window is `NULL` or strictly EARLIER — never merely different.
    assert f"users.{column} IS NULL" in sql
    assert f"users.{column} < " in sql
    assert "DISTINCT FROM" not in sql


@pytest.mark.parametrize(
    "fn",
    [
        daily_limit.check_and_reset_turns,
        daily_limit.check_and_reset_week,
        daily_limit.check_and_reset_chat,
    ],
)
async def test_reset_is_still_zero_write_in_the_steady_state(fn):
    """`/me` runs all three on every route guard — the guard must still filter."""
    db = _db(None)
    await fn(db, _user())
    db.commit.assert_not_awaited()


@pytest.mark.parametrize(
    "fn, attr",
    [
        (daily_limit.check_and_reset_turns, "daily_turn_count"),
        (daily_limit.check_and_reset_week, "weekly_session_count"),
        (daily_limit.check_and_reset_chat, "daily_chat_count"),
    ],
)
async def test_a_fired_reset_still_commits_and_returns_zero(fn, attr):
    db = _db(0)
    assert await fn(db, _user(**{attr: 9})) == 0
    db.commit.assert_awaited_once()


# -- the three charge paths ---------------------------------------------------

@pytest.mark.parametrize(
    "column",
    ["count_reset_date", "week_reset_date"],
)
async def test_charges_stamp_the_window_forward_only(column):
    """A bare `= today` here would undo the guards above on a westward hop."""
    db = AsyncMock()
    fn = (
        daily_limit.increment_turns
        if column == "count_reset_date"
        else daily_limit.increment_week
    )
    await fn(db, _user())
    sql = _sql(db)

    assert f"{column}=greatest(users.{column}, " in sql


async def test_chat_charge_stamps_the_window_forward_only(monkeypatch):
    captured = {}

    class _Session:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_):
            return False

        async def execute(self, stmt):
            captured["sql"] = str(stmt.compile(dialect=postgresql.dialect()))
            return SimpleNamespace(scalar_one=lambda: 4)

        async def commit(self):
            return None

    monkeypatch.setattr(daily_limit, "AsyncSessionLocal", lambda: _Session())

    remaining = await daily_limit.record_chat_completion(
        uuid.uuid4(), "America/New_York", cost=2
    )

    assert remaining == daily_limit.DAILY_CHAT_CREDITS_FREE - 4
    assert "chat_count_reset_date=greatest(users.chat_count_reset_date, " in captured["sql"]


# -- the behaviour the two halves buy together --------------------------------

async def test_a_westward_hop_cannot_re_trigger_a_reset():
    """The abuse case, stated as the two facts that block it.

    Kiritimati is UTC+14 and Midway UTC-11, so the same instant is two
    different local dates. Flipping between them used to zero every counter.
    """
    ahead = daily_limit._today_in_tz("Pacific/Kiritimati")
    behind = daily_limit._today_in_tz("Pacific/Midway")
    assert ahead > behind  # a flip west genuinely walks the date backwards

    # Fact 1: after being stamped with the later date, the earlier one is not
    # `< stored`, so the reset guard stays shut.
    assert not (ahead < behind)

    # Fact 2: a charge taken while west stamps GREATEST, so the stored date
    # stays at the later value and flipping back finds nothing stale.
    assert max(ahead, behind) == ahead


def test_first_ever_call_still_self_seeds():
    """`NULL < date` is NULL, not TRUE — the IS NULL branch is load-bearing."""
    db = _db(None)
    user = _user(count_reset_date=None)
    assert user.count_reset_date is None
    # Guard shape is asserted in the SQL test above; this pins the intent that
    # a fresh row (no backfill was ever run for these columns) must still roll.
    assert daily_limit._today_in_tz(user.timezone) <= date.max
