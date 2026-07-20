"""Tests for saving OPENING questions from variable-length (story-block)
sessions.

Story-block interviews have more than one opening (turn 1 plus a fresh opening
at each block pivot), and any opening is savable — but never a follow-up. These
cover the two helpers that make that work: `_resolve_savable_turn` (which turn
to freeze, with the follow-up/ownership gates) and `_pick_attempt_turn` (which
opening represents the saved question on the progress page).
"""

import uuid
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints import saved_questions as sq_module


def _turn(turn_number, *, is_followup, question_text="q", session_id=None, dimension_1_score=5):
    return SimpleNamespace(
        id=uuid.uuid4(),
        session_id=session_id or uuid.uuid4(),
        turn_number=turn_number,
        is_followup=is_followup,
        question_text=question_text,
        dimension_1_score=dimension_1_score,
    )


# ── _pick_attempt_turn (pure) ────────────────────────────────────────────────

def test_pick_attempt_turn_prefers_exact_question_match():
    # A mid-session opening (turn 3) is the saved question; its scores — not
    # turn 1's — are the baseline attempt.
    t1 = _turn(1, is_followup=False, question_text="A")
    t3 = _turn(3, is_followup=False, question_text="B")
    assert sq_module._pick_attempt_turn([t1, t3], "B") is t3


def test_pick_attempt_turn_falls_back_to_lowest_opening():
    t3 = _turn(3, is_followup=False, question_text="B")
    t1 = _turn(1, is_followup=False, question_text="A")
    # No opening matches "Z" -> lowest turn_number wins (legacy / defensive).
    assert sq_module._pick_attempt_turn([t3, t1], "Z") is t1


def test_pick_attempt_turn_empty_is_none():
    assert sq_module._pick_attempt_turn([], "A") is None


# ── _resolve_savable_turn ────────────────────────────────────────────────────

class _Result:
    def __init__(self, row):
        self._row = row

    def scalar_one_or_none(self):
        return self._row


class _FakeDb:
    def __init__(self, *, opening=None, get_turn=None):
        self._opening = opening
        self._get_turn = get_turn

    async def execute(self, _stmt):
        return _Result(self._opening)

    async def get(self, _model, _pk):
        return self._get_turn


async def test_resolve_savable_turn_defaults_to_first_opening():
    session = SimpleNamespace(id=uuid.uuid4())
    opening = _turn(1, is_followup=False, session_id=session.id)
    db = _FakeDb(opening=opening)
    assert await sq_module._resolve_savable_turn(db, session, None) is opening


async def test_resolve_savable_turn_returns_specified_mid_session_opening():
    session = SimpleNamespace(id=uuid.uuid4())
    turn = _turn(3, is_followup=False, session_id=session.id)
    db = _FakeDb(get_turn=turn)
    assert await sq_module._resolve_savable_turn(db, session, turn.id) is turn


async def test_resolve_savable_turn_rejects_followup():
    session = SimpleNamespace(id=uuid.uuid4())
    turn = _turn(2, is_followup=True, session_id=session.id)
    db = _FakeDb(get_turn=turn)
    with pytest.raises(HTTPException) as exc:
        await sq_module._resolve_savable_turn(db, session, turn.id)
    assert exc.value.status_code == 422


async def test_resolve_savable_turn_rejects_turn_from_other_session():
    session = SimpleNamespace(id=uuid.uuid4())
    turn = _turn(1, is_followup=False, session_id=uuid.uuid4())  # different session
    db = _FakeDb(get_turn=turn)
    with pytest.raises(HTTPException) as exc:
        await sq_module._resolve_savable_turn(db, session, turn.id)
    assert exc.value.status_code == 404


async def test_resolve_savable_turn_404_when_turn_missing():
    session = SimpleNamespace(id=uuid.uuid4())
    db = _FakeDb(get_turn=None)
    with pytest.raises(HTTPException) as exc:
        await sq_module._resolve_savable_turn(db, session, uuid.uuid4())
    assert exc.value.status_code == 404
