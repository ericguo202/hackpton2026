"""Tests for `POST /sessions/{id}/end` — grade an interrupted session on the
turns the candidate actually completed.

Unit-level: `end_session_early` is invoked directly with a fake async DB and a
monkeypatched `_spawn_finalize`, mirroring the reaper tests in
`test_session_turn_count.py`. The finalize itself (`_run_background_finalize` /
`_complete_session_from_turns`) already grades over whatever transcript-bearing
turns exist, so the endpoint's job is just: gate, trim the dangling turn, and
spawn the detached finalizer anchored on the last answered turn.
"""

import uuid
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.api.v1.endpoints import sessions as sessions_module
from app.db.models.enums import SessionStatus
from app.schemas.session import CompanyBriefOut


def _turn(turn_number, *, transcript):
    return SimpleNamespace(
        id=uuid.uuid4(),
        turn_number=turn_number,
        transcript_text=transcript,
    )


class _FakeResult:
    def __init__(self, rows):
        self._rows = rows

    def scalars(self):
        return self

    def all(self):
        return self._rows


class _FakeDb:
    def __init__(self, session, turns):
        self._session = session
        self._turns = turns
        self.deleted = []
        self.commits = 0

    async def get(self, _model, _pk):
        return self._session

    async def execute(self, _stmt):
        return _FakeResult(list(self._turns))

    async def delete(self, obj):
        self.deleted.append(obj)

    async def commit(self):
        self.commits += 1


def _session(user_id, *, status=SessionStatus.in_progress, company_summary=None):
    return SimpleNamespace(
        id=uuid.uuid4(),
        user_id=user_id,
        status=status,
        num_turns=6,
        company_summary=company_summary,
        experience_level=None,
        updated_at=None,
    )


async def test_end_early_404_when_not_owner(monkeypatch):
    spawned = []
    monkeypatch.setattr(sessions_module, "_spawn_finalize", lambda **kw: spawned.append(kw))

    owner = uuid.uuid4()
    session = _session(owner)
    db = _FakeDb(session, [_turn(1, transcript="a")])
    caller = SimpleNamespace(id=uuid.uuid4())  # different user

    with pytest.raises(HTTPException) as exc:
        await sessions_module.end_session_early(session.id, user=caller, db=db)
    assert exc.value.status_code == 404
    assert spawned == []


async def test_end_early_400_when_not_in_progress(monkeypatch):
    spawned = []
    monkeypatch.setattr(sessions_module, "_spawn_finalize", lambda **kw: spawned.append(kw))

    user = SimpleNamespace(id=uuid.uuid4())
    session = _session(user.id, status=SessionStatus.completed)
    db = _FakeDb(session, [_turn(1, transcript="a")])

    with pytest.raises(HTTPException) as exc:
        await sessions_module.end_session_early(session.id, user=user, db=db)
    assert exc.value.status_code == 400
    assert spawned == []


async def test_end_early_422_when_no_answered_turns(monkeypatch):
    spawned = []
    monkeypatch.setattr(sessions_module, "_spawn_finalize", lambda **kw: spawned.append(kw))

    user = SimpleNamespace(id=uuid.uuid4())
    session = _session(user.id)
    # Only the current, unanswered opening exists — nothing to grade.
    db = _FakeDb(session, [_turn(1, transcript=None)])

    with pytest.raises(HTTPException) as exc:
        await sessions_module.end_session_early(session.id, user=user, db=db)
    assert exc.value.status_code == 422
    assert spawned == []
    assert db.commits == 0


async def test_end_early_trims_dangling_turn_and_spawns_finalize(monkeypatch):
    spawned = []
    monkeypatch.setattr(sessions_module, "_spawn_finalize", lambda **kw: spawned.append(kw))

    user = SimpleNamespace(id=uuid.uuid4())
    session = _session(user.id)
    t1 = _turn(1, transcript="answer one")
    t2 = _turn(2, transcript="answer two")
    dangling = _turn(3, transcript=None)  # next question, never answered
    db = _FakeDb(session, [t1, t2, dangling])

    out = await sessions_module.end_session_early(session.id, user=user, db=db)

    # Dangling turn deleted; answered turns kept.
    assert db.deleted == [dangling]
    assert db.commits == 1
    # Reaper clock stamped before spawn.
    assert session.updated_at is not None
    # Finalizer anchored on the highest-numbered ANSWERED turn.
    assert spawned == [
        {
            "session_id": session.id,
            "final_turn_id": t2.id,
            "category": None,
            "experience_level": None,
            "jd_summary": None,
        }
    ]
    # Response reports the graded turn count; status is still in_progress
    # (the detached finalizer flips it to completed out of band).
    assert out.session_id == session.id
    assert out.status == SessionStatus.in_progress.value
    assert out.graded_turns == 2


async def test_end_early_threads_brief_category_and_jd_summary(monkeypatch):
    spawned = []
    monkeypatch.setattr(sessions_module, "_spawn_finalize", lambda **kw: spawned.append(kw))

    category = "Finance, Banking, and Private Capital"
    brief = CompanyBriefOut(
        description="d",
        headlines=["h"],
        values=["v"],
        category=category,
        role_signals=["rs"],
        sample_question_themes=["t"],
        jd_summary=["Solo IC role — no team"],
    )
    user = SimpleNamespace(id=uuid.uuid4())
    session = _session(user.id, company_summary=brief.model_dump_json())
    t1 = _turn(1, transcript="answer one")
    db = _FakeDb(session, [t1])

    await sessions_module.end_session_early(session.id, user=user, db=db)

    assert spawned[0]["category"] == category
    assert spawned[0]["jd_summary"] == ["Solo IC role — no team"]
    assert spawned[0]["final_turn_id"] == t1.id
