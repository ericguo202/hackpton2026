import asyncio
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
import uuid

import pytest
from pydantic import ValidationError

from app.api.v1.endpoints import sessions as sessions_module
from app.db.models.enums import SessionStatus
from app.schemas.session import SessionCreateIn
from app.services import eval_registry


def test_session_create_defaults_to_two_turns():
    body = SessionCreateIn(company="Acme", job_title="Product Manager")

    assert body.num_turns == 2


def test_session_create_accepts_two_to_eight_turns():
    assert SessionCreateIn(
        company="Acme",
        job_title="Product Manager",
        num_turns=2,
    ).num_turns == 2
    assert SessionCreateIn(
        company="Acme",
        job_title="Product Manager",
        num_turns=8,
    ).num_turns == 8


@pytest.mark.parametrize("num_turns", [1, 9])
def test_session_create_rejects_out_of_range_turn_counts(num_turns):
    with pytest.raises(ValidationError):
        SessionCreateIn(
            company="Acme",
            job_title="Product Manager",
            num_turns=num_turns,
        )


async def test_eval_registry_tracks_multiple_pending_turns_per_session():
    async def _wait():
        await asyncio.sleep(0.01)

    session_id = uuid.uuid4()
    turn_1 = uuid.uuid4()
    turn_2 = uuid.uuid4()
    task_1 = asyncio.create_task(_wait())
    task_2 = asyncio.create_task(_wait())
    try:
        eval_registry.register(session_id, turn_1, task_1)
        eval_registry.register(session_id, turn_2, task_2)

        popped = eval_registry.pop_session(session_id)

        assert set(popped) == {task_1, task_2}
        assert eval_registry.pop_session(session_id) == []
    finally:
        await asyncio.gather(task_1, task_2, return_exceptions=True)
        eval_registry.discard(session_id, turn_1)
        eval_registry.discard(session_id, turn_2)


async def test_insert_followup_turn_uses_next_turn_number():
    class FakeDb:
        def __init__(self):
            self.added = None
            self.flushed = False

        def add(self, value):
            self.added = value

        async def flush(self):
            self.flushed = True

    db = FakeDb()
    session_id = uuid.uuid4()
    parent_turn_id = uuid.uuid4()

    await sessions_module._insert_followup_turn(
        db,
        session_id=session_id,
        parent_turn_id=parent_turn_id,
        turn_number=4,
        question="What happened next?",
    )

    assert db.flushed is True
    assert db.added.session_id == session_id
    assert db.added.parent_turn_id == parent_turn_id
    assert db.added.turn_number == 4
    assert db.added.is_followup is True


def test_lazy_reaper_waits_for_configured_final_turn(monkeypatch):
    spawned = []
    monkeypatch.setattr(
        sessions_module,
        "_spawn_finalize",
        lambda **kwargs: spawned.append(kwargs),
    )

    session = SimpleNamespace(
        id=uuid.uuid4(),
        status=SessionStatus.in_progress,
        num_turns=4,
        updated_at=datetime.now(timezone.utc) - timedelta(minutes=10),
        company_summary=None,
        experience_level=None,
    )
    turns = [
        SimpleNamespace(id=uuid.uuid4(), turn_number=1, transcript_text="one"),
        SimpleNamespace(id=uuid.uuid4(), turn_number=2, transcript_text="two"),
        SimpleNamespace(id=uuid.uuid4(), turn_number=3, transcript_text="three"),
    ]

    sessions_module._maybe_reap_stuck_session(session, turns)

    assert spawned == []


def test_lazy_reaper_spawns_after_configured_final_turn(monkeypatch):
    spawned = []
    monkeypatch.setattr(
        sessions_module,
        "_spawn_finalize",
        lambda **kwargs: spawned.append(kwargs),
    )

    session = SimpleNamespace(
        id=uuid.uuid4(),
        status=SessionStatus.in_progress,
        num_turns=4,
        updated_at=datetime.now(timezone.utc) - timedelta(minutes=10),
        company_summary=None,
        experience_level=None,
    )
    final_turn = SimpleNamespace(
        id=uuid.uuid4(),
        turn_number=4,
        transcript_text="final",
    )

    sessions_module._maybe_reap_stuck_session(session, [final_turn])

    assert spawned == [
        {
            "session_id": session.id,
            "final_turn_id": final_turn.id,
            "category": None,
            "experience_level": None,
        }
    ]
