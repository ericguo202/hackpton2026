"""Endpoint-level tests for the clarification-retry branch of `submit_turn`.

The isolated helpers (`_is_clarification_request`, `_clarified_question`) are
unit-tested in `test_session_turn_count.py`. This file covers the load-bearing
endpoint behavior those helpers gate:

  * a clarification request re-asks the SAME turn without persisting the
    transcript, scoring, advancing the turn count, or spawning an evaluator;
  * the retry is once-per-session — a second clarification, with the flag
    already set, falls through to the normal (scored) answer path.

Like the other `sessions` endpoint tests, `submit_turn` is called directly with
a fake async DB and monkeypatched I/O (STT, moderation, TTS) so no network or
real database is involved.
"""

import uuid
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints import sessions as sessions_module
from app.db.models.enums import SessionStatus
from app.services.stt import Transcription


class _LockingResult:
    """Return value for the `with_for_update` current-turn SELECT."""

    def __init__(self, turn):
        self._turn = turn

    def scalar_one_or_none(self):
        return self._turn


class _FakeDb:
    def __init__(self, session, current_turn):
        self._session = session
        self._current_turn = current_turn
        self.commits = 0
        self.added = []

    async def get(self, _model, _pk):
        return self._session

    async def execute(self, _stmt):
        # Only the current-turn locking SELECT is reached before the
        # clarification branch returns.
        return _LockingResult(self._current_turn)

    async def scalar(self, _stmt):  # pragma: no cover - not hit on this path
        return None

    def add(self, obj):
        self.added.append(obj)

    async def commit(self):
        self.commits += 1


def _session(user_id, *, clarification_retry_used=False):
    return SimpleNamespace(
        id=uuid.uuid4(),
        user_id=user_id,
        status=SessionStatus.in_progress,
        num_turns=4,
        company_summary=None,
        experience_level=None,
        voice_id="voice-x",
        speech_speed=None,
        clarification_retry_used=clarification_retry_used,
    )


def _turn(question, *, is_followup=False):
    return SimpleNamespace(
        id=uuid.uuid4(),
        turn_number=1,
        question_text=question,
        transcript_text=None,
        is_followup=is_followup,
    )


def _patch_io(monkeypatch, *, transcript):
    """Stub STT/moderation/TTS so the endpoint reaches the branch under test."""

    async def _fake_transcribe(_bytes, _filename):
        # STT returns transcript + speech span (the words-per-minute
        # denominator); the span is irrelevant to these branches.
        return Transcription(text=transcript, duration_seconds=12.0)

    async def _fake_read_audio(_audio):
        return b"x"

    async def _fake_moderation(*_a, **_k):
        return SimpleNamespace(flagged=False, categories=[])

    async def _fake_tts(text, *, voice_id, speed=None):
        return "data:audio/mp3;base64,AAAA"

    monkeypatch.setattr(sessions_module, "transcribe_audio", _fake_transcribe)
    monkeypatch.setattr(sessions_module, "_read_audio_bounded", _fake_read_audio)
    monkeypatch.setattr(sessions_module, "check_moderation", _fake_moderation)
    monkeypatch.setattr(sessions_module, "synthesize_speech", _fake_tts)


async def test_clarification_request_reasks_without_scoring_or_advancing(monkeypatch):
    _patch_io(monkeypatch, transcript="Can you clarify the question?")

    user = SimpleNamespace(id=uuid.uuid4())
    session = _session(user.id)
    original_q = "Tell me about a time you handled conflict?"
    current_turn = _turn(original_q)
    db = _FakeDb(session, current_turn)

    out = await sessions_module.submit_turn(
        session.id,
        audio=SimpleNamespace(filename="a.webm"),
        cv_summary=None,
        user=user,
        db=db,
    )

    # Signals the frontend re-records the same slot rather than advancing.
    assert out.clarification_retry is True
    assert out.is_final is False
    assert out.scores is None
    assert out.evaluation_pending is False

    # Same turn re-asked with a concrete frame; transcript NOT persisted, so the
    # turn stays pending (transcript_text is None) and is never scored.
    assert current_turn.transcript_text is None
    assert current_turn.question_text == (
        "Tell me about a time you handled conflict "
        "using one specific work or school example."
    )
    assert out.next_question == current_turn.question_text
    assert out.next_question_audio_url == "data:audio/mp3;base64,AAAA"

    # Retry consumed; exactly one commit (the question rewrite + flag); no new
    # turn inserted (the turn count does not advance).
    assert session.clarification_retry_used is True
    assert db.commits == 1
    assert db.added == []


async def test_clarification_preserves_turn_type(monkeypatch):
    """A clarification on a follow-up re-asks it as a follow-up, not an opening."""
    _patch_io(monkeypatch, transcript="What do you mean?")

    user = SimpleNamespace(id=uuid.uuid4())
    session = _session(user.id)
    current_turn = _turn("Describe a setback.", is_followup=True)
    db = _FakeDb(session, current_turn)

    out = await sessions_module.submit_turn(
        session.id,
        audio=SimpleNamespace(filename="a.webm"),
        cv_summary=None,
        user=user,
        db=db,
    )

    assert out.clarification_retry is True
    assert out.next_question_is_followup is True


async def test_second_clarification_falls_through_to_normal_scoring(monkeypatch):
    """Once-per-session gate: with the flag already set, a second clarification
    is treated as a real answer and enters the normal (scored) path.

    `count_words` is the marker — it runs only on the normal path (the
    clarification branch returns after `count_filler_words`), so tripping it
    proves the branch was skipped.
    """
    _patch_io(monkeypatch, transcript="Can you clarify the question?")

    class _ReachedNormalPath(Exception):
        pass

    def _boom(_transcript):
        raise _ReachedNormalPath()

    monkeypatch.setattr(sessions_module, "count_words", _boom)

    user = SimpleNamespace(id=uuid.uuid4())
    session = _session(user.id, clarification_retry_used=True)
    current_turn = _turn("Tell me about a challenge?")
    db = _FakeDb(session, current_turn)

    with pytest.raises(_ReachedNormalPath):
        await sessions_module.submit_turn(
            session.id,
            audio=SimpleNamespace(filename="a.webm"),
            cv_summary=None,
            user=user,
            db=db,
        )

    # Branch was skipped: the pending turn was neither rewritten nor committed
    # as a clarification retry.
    assert current_turn.question_text == "Tell me about a challenge?"
    assert db.commits == 0
