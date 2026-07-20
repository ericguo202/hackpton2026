"""
Unit tests for the lazy stuck-session reaper in `endpoints/sessions`.

`_maybe_reap_stuck_session` decides whether a session left `in_progress`
(by a finalizer that died or raised) should have finalization re-spawned on
read. It only reads attributes off the ORM rows, so we drive it with light
`SimpleNamespace` stand-ins and stub `_spawn_finalize` to record calls.
"""

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.api.v1.endpoints import sessions as ep
from app.db.models.enums import SessionStatus


def _session(*, status=SessionStatus.in_progress, updated_at=None):
    return SimpleNamespace(
        id=uuid4(),
        status=status,
        # Default: stale enough to be past the grace window.
        updated_at=updated_at
        or (datetime.utcnow() - ep._FINALIZE_REAP_AFTER - timedelta(seconds=5)),
        company_summary=None,
        experience_level=None,
    )


def _turn(turn_number, *, transcript="an answer"):
    return SimpleNamespace(
        id=uuid4(), turn_number=turn_number, transcript_text=transcript
    )


@pytest.fixture
def spawn_calls(monkeypatch):
    calls: list[dict] = []
    monkeypatch.setattr(ep, "_spawn_finalize", lambda **kw: calls.append(kw))
    # Keep the dedup set clean across tests.
    monkeypatch.setattr(ep, "_finalizing_sessions", set())
    return calls


def test_reaps_stale_fully_answered_session(spawn_calls):
    session = _session()
    turns = [_turn(1), _turn(2)]

    ep._maybe_reap_stuck_session(session, turns)

    assert len(spawn_calls) == 1
    call = spawn_calls[0]
    assert call["session_id"] == session.id
    assert call["final_turn_id"] == turns[1].id


def test_skips_when_not_in_progress(spawn_calls):
    session = _session(status=SessionStatus.completed)
    ep._maybe_reap_stuck_session(session, [_turn(1), _turn(2)])
    assert spawn_calls == []


def test_skips_when_final_answer_not_persisted(spawn_calls):
    session = _session()
    # Turn 2 exists (question asked) but the candidate hasn't answered it.
    ep._maybe_reap_stuck_session(session, [_turn(1), _turn(2, transcript=None)])
    assert spawn_calls == []


def test_skips_before_grace_window_elapses(spawn_calls):
    session = _session(updated_at=datetime.utcnow())  # just submitted
    ep._maybe_reap_stuck_session(session, [_turn(1), _turn(2)])
    assert spawn_calls == []


def test_skips_when_already_finalizing_in_process(spawn_calls, monkeypatch):
    session = _session()
    monkeypatch.setattr(ep, "_finalizing_sessions", {session.id})
    ep._maybe_reap_stuck_session(session, [_turn(1), _turn(2)])
    assert spawn_calls == []


def test_reaps_with_tz_aware_updated_at(spawn_calls):
    # Postgres returns `updated_at` as tz-aware (timestamptz). Subtracting it
    # against naive `utcnow()` used to raise TypeError and 500 the read.
    stale = datetime.now(timezone.utc) - ep._FINALIZE_REAP_AFTER - timedelta(seconds=5)
    session = _session(updated_at=stale)
    ep._maybe_reap_stuck_session(session, [_turn(1), _turn(2)])
    assert len(spawn_calls) == 1


def test_skips_before_grace_window_with_tz_aware_updated_at(spawn_calls):
    session = _session(updated_at=datetime.now(timezone.utc))  # just submitted
    ep._maybe_reap_stuck_session(session, [_turn(1), _turn(2)])
    assert spawn_calls == []
