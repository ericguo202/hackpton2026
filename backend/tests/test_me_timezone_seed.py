"""
Unit tests for the seed-once browser timezone on `GET /me`.

`users.timezone` used to be written only by `enforce_session_start_limits`
(POST /sessions + re-practice), so a user who only ever used Ask Tutor kept a
NULL timezone and every free-tier counter rolled on UTC — visibly, as a chat
budget that didn't reset at local midnight. `get_me` now seeds the column from
a `?timezone=` query param.

Two properties carry the fix and are easy to regress:

  * the write is SEED-ONCE — never an overwrite. The rollover guards in
    `daily_limit` are `IS DISTINCT FROM`, so a stored date can move backwards;
    a caller free to change their timezone on an endpoint hit by every route
    guard could zero any counter on demand by alternating two far-apart zones.
  * junk is DROPPED, not stored. With no second write to correct it, one bad
    value would pin that user to the UTC fallback forever.

Ordering (seed before the rollovers) is covered by
`test_seeds_before_the_counter_rollovers_read_it`. A `pro`-tier user is used
elsewhere so the free-tier rollover branch stays out of the way, matching
`test_me_email_conflict.py`.
"""

import uuid
from datetime import date
from types import SimpleNamespace
from unittest.mock import AsyncMock

from app.api.v1.endpoints import me as me_module
from app.core.auth import ClerkClaims
from app.db.models.enums import UserTier
from app.services.daily_limit import is_known_timezone


def _claims(sub: str = "user_abc") -> ClerkClaims:
    return ClerkClaims(sub=sub, iss="https://x.clerk.dev", exp=9_999_999_999, iat=0, email=None)


def _user(**overrides) -> SimpleNamespace:
    base = dict(
        id=uuid.uuid4(),
        clerk_user_id="user_abc",
        tier=UserTier.pro,
        completed_registration=True,
        timezone=None,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


# ── is_known_timezone ─────────────────────────────────────────────────────────

def test_accepts_real_iana_zones():
    assert is_known_timezone("America/New_York")
    assert is_known_timezone("UTC")


def test_rejects_missing_and_unknown():
    assert not is_known_timezone(None)
    assert not is_known_timezone("")
    assert not is_known_timezone("Mars/Olympus_Mons")
    # A browser sending a UTC offset rather than an IANA name.
    assert not is_known_timezone("GMT+5")


def test_rejects_keys_zoneinfo_refuses_outright():
    # These raise ValueError, not ZoneInfoNotFoundError. Before the validator
    # they escaped `_today_in_tz` as a 500 once persisted.
    assert not is_known_timezone("../../etc/passwd")
    assert not is_known_timezone("/absolute/path")


# ── seed-once ─────────────────────────────────────────────────────────────────

async def test_seeds_when_column_is_null():
    user = _user(timezone=None)
    db = AsyncMock()

    await me_module.get_me(claims=_claims(), user=user, db=db, tz="America/New_York")

    assert user.timezone == "America/New_York"
    db.commit.assert_awaited_once()


async def test_never_overwrites_an_existing_timezone():
    # The abuse case: alternating zones would otherwise roll a counter's stored
    # date backwards and zero it on demand.
    user = _user(timezone="America/New_York")
    db = AsyncMock()

    await me_module.get_me(claims=_claims(), user=user, db=db, tz="Pacific/Kiritimati")

    assert user.timezone == "America/New_York"
    db.commit.assert_not_called()


async def test_drops_junk_instead_of_storing_it():
    user = _user(timezone=None)
    db = AsyncMock()

    await me_module.get_me(claims=_claims(), user=user, db=db, tz="Not/AZone")

    assert user.timezone is None
    db.commit.assert_not_called()


async def test_no_write_when_param_absent():
    user = _user(timezone=None)
    db = AsyncMock()

    await me_module.get_me(claims=_claims(), user=user, db=db, tz=None)

    assert user.timezone is None
    db.commit.assert_not_called()


async def test_seeds_before_the_counter_rollovers_read_it(monkeypatch):
    """The rollovers must see the seeded zone, not the NULL they were called with.

    Seeded afterwards, the first /me of each day would still stamp a UTC date,
    and `IS DISTINCT FROM` wouldn't fire again until that wrong date passed.
    """
    user = _user(tier=UserTier.free, timezone=None, daily_chat_count=0)
    db = AsyncMock()
    seen: list[str | None] = []

    async def spy(_db, u):
        seen.append(u.timezone)
        return 0

    monkeypatch.setattr(me_module, "check_and_reset_turns", spy)
    monkeypatch.setattr(me_module, "check_and_reset_week", spy)
    monkeypatch.setattr(me_module, "check_and_reset_chat", spy)

    await me_module.get_me(claims=_claims(), user=user, db=db, tz="America/New_York")

    assert seen == ["America/New_York"] * 3


async def test_seeded_zone_drives_the_local_day(monkeypatch):
    """End of the fix: the stored zone is what `_today_in_tz` then resolves.

    Kiritimati (UTC+14) is a day ahead of UTC for most of the UTC day, which is
    the same shape as the reported bug in the other direction.
    """
    from app.services import daily_limit

    assert daily_limit._today_in_tz(None) == date.today()
    ahead = daily_limit._today_in_tz("Pacific/Kiritimati")
    behind = daily_limit._today_in_tz("Pacific/Midway")
    # UTC-11 to UTC+14 spans more than a day, so these can never be equal.
    assert ahead != behind
