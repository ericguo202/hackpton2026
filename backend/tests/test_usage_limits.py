"""
Unit tests for the free-tier usage limits: 10 answered turns per local day and
10 sessions per local week.

Three things are load-bearing and easy to break silently, so each gets direct
coverage:

  * the Monday-based week boundary (`_week_start_in_tz`) and its UTC fallback;
  * `enforce_session_start_limits` — which CLAMPS an over-long request instead
    of rejecting it, and 429s only below the 2-turn floor or at the weekly cap;
  * the charge points in `submit_turn` — one turn charged per answered turn,
    the weekly session slot charged on turn 1 ONLY.

Like the other service/endpoint tests in this suite, everything runs against a
fake async DB — no Postgres, no network.
"""

import uuid
from datetime import date
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints import sessions as sessions_module
from app.db.models.enums import SessionStatus, UserTier
from app.services import daily_limit
from app.services.stt import Transcription


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
    )
    base.update(overrides)
    return SimpleNamespace(**base)


# ── week boundary ─────────────────────────────────────────────────────────────

@pytest.mark.parametrize(
    "today, expected_monday",
    [
        # Monday is its own week start.
        (date(2026, 8, 3), date(2026, 8, 3)),
        # Mid-week rolls back.
        (date(2026, 8, 6), date(2026, 8, 3)),
        # Sunday belongs to the week that STARTED Monday — the boundary case
        # that a naive `weekday()` reading gets backwards.
        (date(2026, 8, 9), date(2026, 8, 3)),
        # Next Monday opens a fresh window.
        (date(2026, 8, 10), date(2026, 8, 10)),
    ],
)
def test_week_start_is_the_preceding_monday(monkeypatch, today, expected_monday):
    monkeypatch.setattr(daily_limit, "_today_in_tz", lambda _tz: today)

    assert daily_limit._week_start_in_tz("America/New_York") == expected_monday


def test_week_start_falls_back_to_utc_on_unknown_timezone():
    """A stale/garbage IANA name must degrade, never raise — it would otherwise
    block a legitimate session for a user with a stripped timezone."""
    fallback = daily_limit._week_start_in_tz("Not/AZone")

    assert fallback.weekday() == 0
    assert fallback <= daily_limit._today_in_tz(None)


# ── the session-start gate ────────────────────────────────────────────────────

def _patch_counters(monkeypatch, *, turns_used: int, weekly_used: int) -> dict:
    """Stub both lazy-reset reads, recording which ones were consulted."""
    seen: dict[str, bool] = {"turns": False, "week": False}

    async def _turns(_db, _user):
        seen["turns"] = True
        return turns_used

    async def _week(_db, _user):
        seen["week"] = True
        return weekly_used

    monkeypatch.setattr(daily_limit, "check_and_reset_turns", _turns)
    monkeypatch.setattr(daily_limit, "check_and_reset_week", _week)
    return seen


async def test_pro_tier_skips_both_caps(monkeypatch):
    seen = _patch_counters(monkeypatch, turns_used=99, weekly_used=99)
    user = _user(tier=UserTier.pro)

    allowed = await daily_limit.enforce_session_start_limits(
        AsyncMock(), user, requested_turns=8
    )

    assert allowed == 8
    assert seen == {"turns": False, "week": False}


async def test_request_within_budget_is_untouched(monkeypatch):
    _patch_counters(monkeypatch, turns_used=2, weekly_used=1)

    allowed = await daily_limit.enforce_session_start_limits(
        AsyncMock(), _user(), requested_turns=4
    )

    assert allowed == 4


async def test_over_budget_request_is_clamped_not_rejected(monkeypatch):
    """7 of 10 turns used + a request for 8 → a 3-turn session, not a 429."""
    _patch_counters(monkeypatch, turns_used=7, weekly_used=0)

    allowed = await daily_limit.enforce_session_start_limits(
        AsyncMock(), _user(), requested_turns=8
    )

    assert allowed == 3


async def test_clamps_exactly_to_the_two_turn_floor(monkeypatch):
    _patch_counters(monkeypatch, turns_used=8, weekly_used=0)

    allowed = await daily_limit.enforce_session_start_limits(
        AsyncMock(), _user(), requested_turns=6
    )

    assert allowed == daily_limit.MIN_SESSION_TURNS


@pytest.mark.parametrize("turns_used", [9, 10, 11])
async def test_429_below_the_two_turn_floor(monkeypatch, turns_used):
    """Fewer than 2 turns left can't be clamped into a valid session (the DB
    checks `num_turns BETWEEN 2 AND 8`), so the caller is refused."""
    _patch_counters(monkeypatch, turns_used=turns_used, weekly_used=0)

    with pytest.raises(HTTPException) as exc:
        await daily_limit.enforce_session_start_limits(
            AsyncMock(), _user(), requested_turns=2
        )

    assert exc.value.status_code == 429
    assert "tomorrow" in exc.value.detail


async def test_weekly_cap_429s_before_the_turn_counter_is_read(monkeypatch):
    """The weekly cap is the harder stop, so it's checked first — and its
    message points at Monday, not midnight."""
    seen = _patch_counters(monkeypatch, turns_used=0, weekly_used=10)

    with pytest.raises(HTTPException) as exc:
        await daily_limit.enforce_session_start_limits(
            AsyncMock(), _user(), requested_turns=2
        )

    assert exc.value.status_code == 429
    assert "Monday" in exc.value.detail
    assert seen["week"] is True
    assert seen["turns"] is False


async def test_timezone_is_persisted_before_any_date_math(monkeypatch):
    """The reset windows are computed in the user's local calendar, so a newly
    reported timezone has to land on the row first."""
    order: list[str] = []

    async def _turns(_db, user):
        order.append(f"turns:{user.timezone}")
        return 0

    async def _week(_db, user):
        order.append(f"week:{user.timezone}")
        return 0

    monkeypatch.setattr(daily_limit, "check_and_reset_turns", _turns)
    monkeypatch.setattr(daily_limit, "check_and_reset_week", _week)

    user = _user(timezone="UTC")
    db = AsyncMock()

    await daily_limit.enforce_session_start_limits(
        db, user, timezone="Asia/Tokyo", requested_turns=2
    )

    assert user.timezone == "Asia/Tokyo"
    assert order == ["week:Asia/Tokyo", "turns:Asia/Tokyo"]
    db.commit.assert_awaited_once()


# ── lazy resets ───────────────────────────────────────────────────────────────

def _reset_db(returned):
    """Fake DB whose single UPDATE ... RETURNING yields `returned`.

    `None` models "the gating predicate matched no rows", i.e. the counter was
    already current and no reset fired.
    """
    db = AsyncMock()
    db.execute.return_value = SimpleNamespace(scalar_one_or_none=lambda: returned)
    return db


@pytest.mark.parametrize(
    "fn, attr",
    [
        (daily_limit.check_and_reset_turns, "daily_turn_count"),
        (daily_limit.check_and_reset_week, "weekly_session_count"),
    ],
)
async def test_reset_commits_and_returns_zero_when_window_is_stale(fn, attr):
    user = _user(**{attr: 7})
    db = _reset_db(0)

    assert await fn(db, user) == 0
    db.commit.assert_awaited_once()
    db.refresh.assert_awaited_once()


@pytest.mark.parametrize(
    "fn, attr",
    [
        (daily_limit.check_and_reset_turns, "daily_turn_count"),
        (daily_limit.check_and_reset_week, "weekly_session_count"),
    ],
)
async def test_current_window_returns_stored_count_without_writing(fn, attr):
    """Steady state must be zero-write — `/me` runs this on every route guard."""
    user = _user(**{attr: 4})
    db = _reset_db(None)

    assert await fn(db, user) == 4
    db.commit.assert_not_awaited()
    db.refresh.assert_not_awaited()


# ── increments ────────────────────────────────────────────────────────────────

@pytest.mark.parametrize(
    "fn, counter_col, date_col",
    [
        (daily_limit.increment_turns, "daily_turn_count", "count_reset_date"),
        (daily_limit.increment_week, "weekly_session_count", "week_reset_date"),
    ],
)
async def test_increment_targets_its_own_columns_and_does_not_commit(
    fn, counter_col, date_col
):
    """Both increments must ride the CALLER's transaction — committing here
    would charge a user for a turn whose persistence later rolled back."""
    db = AsyncMock()

    await fn(db, _user())

    db.commit.assert_not_awaited()
    stmt = str(db.execute.await_args.args[0])
    assert counter_col in stmt
    assert date_col in stmt
    # The reset-or-bump is done in SQL (a CASE), not read-modify-write in
    # Python, so a midnight/Monday crossing can't race itself.
    assert "CASE" in stmt


# ── charge points in submit_turn ──────────────────────────────────────────────

class _LockingResult:
    def __init__(self, turn):
        self._turn = turn

    def scalar_one_or_none(self):
        return self._turn


class _ScalarsResult:
    def __init__(self, rows):
        self._rows = rows

    def scalars(self):
        return SimpleNamespace(all=lambda: self._rows)


class _FakeDb:
    """Serves the current-turn locking SELECT, then the prior-turns SELECT."""

    def __init__(self, session, current_turn):
        self._session = session
        self._current_turn = current_turn
        self._calls = 0
        self.commits = 0

    async def get(self, _model, _pk):
        return self._session

    async def execute(self, _stmt):
        self._calls += 1
        if self._calls == 1:
            return _LockingResult(self._current_turn)
        return _ScalarsResult([])

    def add(self, obj):  # pragma: no cover - final-turn path adds nothing
        pass

    async def commit(self):
        self.commits += 1


def _final_turn_session(user_id, *, num_turns):
    return SimpleNamespace(
        id=uuid.uuid4(),
        user_id=user_id,
        status=SessionStatus.in_progress,
        num_turns=num_turns,
        company_summary=None,
        experience_level=None,
        voice_id="voice-x",
        speech_speed=None,
        calibrated_mix=False,
        clarification_retry_used=False,
        updated_at=None,
    )


def _patch_submit_io(monkeypatch):
    """Stub STT/moderation and the detached finalizer so `submit_turn` runs the
    final-turn path end to end without network or background tasks."""

    async def _fake_transcribe(_bytes, _filename):
        return Transcription(
            text="I led the migration and cut latency by thirty percent.",
            duration_seconds=20.0,
        )

    async def _fake_read_audio(_audio):
        return b"x"

    async def _fake_moderation(*_a, **_k):
        return SimpleNamespace(flagged=False, categories=[])

    monkeypatch.setattr(sessions_module, "transcribe_audio", _fake_transcribe)
    monkeypatch.setattr(sessions_module, "_read_audio_bounded", _fake_read_audio)
    monkeypatch.setattr(sessions_module, "check_moderation", _fake_moderation)
    monkeypatch.setattr(sessions_module, "_spawn_finalize", lambda **_kw: None)


def _patch_charges(monkeypatch) -> dict:
    charges = {"turns": 0, "week": 0}

    async def _turns(_db, _user):
        charges["turns"] += 1

    async def _week(_db, _user):
        charges["week"] += 1

    monkeypatch.setattr(sessions_module, "increment_turns", _turns)
    monkeypatch.setattr(sessions_module, "increment_week", _week)
    return charges


async def _submit(db, session, user):
    return await sessions_module.submit_turn(
        session.id,
        audio=SimpleNamespace(filename="a.webm"),
        cv_summary=None,
        user=user,
        db=db,
    )


async def test_turn_one_charges_a_turn_and_the_weekly_session_slot(monkeypatch):
    _patch_submit_io(monkeypatch)
    charges = _patch_charges(monkeypatch)

    user = _user()
    session = _final_turn_session(user.id, num_turns=1)
    current_turn = SimpleNamespace(
        id=uuid.uuid4(), turn_number=1, question_text="Tell me about a challenge.",
        transcript_text=None, is_followup=False,
    )

    out = await _submit(_FakeDb(session, current_turn), session, user)

    assert out.is_final is True
    assert charges == {"turns": 1, "week": 1}


async def test_later_turns_charge_a_turn_but_not_another_session(monkeypatch):
    """The weekly slot is claimed once per session, on turn 1 — otherwise an
    8-turn interview would eat the whole weekly allowance."""
    _patch_submit_io(monkeypatch)
    charges = _patch_charges(monkeypatch)

    user = _user()
    session = _final_turn_session(user.id, num_turns=4)
    current_turn = SimpleNamespace(
        id=uuid.uuid4(), turn_number=4, question_text="What did you learn?",
        transcript_text=None, is_followup=True,
    )

    await _submit(_FakeDb(session, current_turn), session, user)

    assert charges == {"turns": 1, "week": 0}


async def test_pro_tier_answers_are_never_charged(monkeypatch):
    _patch_submit_io(monkeypatch)
    charges = _patch_charges(monkeypatch)

    user = _user(tier=UserTier.pro)
    session = _final_turn_session(user.id, num_turns=1)
    current_turn = SimpleNamespace(
        id=uuid.uuid4(), turn_number=1, question_text="Tell me about a challenge.",
        transcript_text=None, is_followup=False,
    )

    await _submit(_FakeDb(session, current_turn), session, user)

    assert charges == {"turns": 0, "week": 0}


async def test_clarification_retry_is_free(monkeypatch):
    """A clarification re-asks the same turn without scoring or advancing it, so
    it must not consume quota — otherwise asking the interviewer to repeat the
    question would cost the candidate a turn."""
    _patch_submit_io(monkeypatch)
    charges = _patch_charges(monkeypatch)

    async def _clarification(_bytes, _filename):
        return Transcription(text="Can you clarify the question?", duration_seconds=3.0)

    async def _fake_tts(_text, *, voice_id, speed=None):
        return "data:audio/mp3;base64,AAAA"

    monkeypatch.setattr(sessions_module, "transcribe_audio", _clarification)
    monkeypatch.setattr(sessions_module, "synthesize_speech", _fake_tts)

    user = _user()
    session = _final_turn_session(user.id, num_turns=4)
    current_turn = SimpleNamespace(
        id=uuid.uuid4(), turn_number=1, question_text="Tell me about a challenge?",
        transcript_text=None, is_followup=False,
    )

    out = await _submit(_FakeDb(session, current_turn), session, user)

    assert out.clarification_retry is True
    assert charges == {"turns": 0, "week": 0}
