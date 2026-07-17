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


@pytest.mark.parametrize(
    "transcript",
    [
        "Can you clarify the question?",
        "What do you mean by challenge?",
        "Can you be more explicit?",
        "Challenge regarding what?",
        # Leading politeness/filler is stripped before the anchored match,
        # including sentence punctuation between filler tokens.
        "Sorry, what do you mean?",
        "Um, can you clarify the question?",
        "Uh, sorry. Can you clarify that, please?",
        "Wait. What are you asking?",
        # Interposed "you"/"please" between the modal and the verb.
        "Wait, sorry. Can you please clarify that?",
        "Could you please be more specific?",
    ],
)
def test_clarification_detector_accepts_explicit_requests(transcript):
    assert sessions_module._is_clarification_request(transcript) is True


@pytest.mark.parametrize(
    "transcript",
    [
        "I don't know how I feel about this.",
        "I don't have an example.",
        "We clarified the requirements with the designer and shipped it.",
        "This is a long partial answer about a real project where I needed more information before deciding what to do next.",
        # Genuine — if short — answers that *narrate* a clarification. The
        # phrase is mid-utterance, not leading, so it must NOT be treated as a
        # clarification request (the detector anchors on the whole utterance).
        "I asked my manager what do you mean by scalable, and then I built it.",
        "I told the designer to be more specific about the mockups.",
        "She kept asking me to clarify the question so I rephrased it.",
        # "can you <non-clarify-verb>" openers stay out — only clarification
        # verbs match the compositional modal branch.
        "Can you imagine how hard that project was for the whole team?",
    ],
)
def test_clarification_detector_rejects_weak_or_real_answers(transcript):
    assert sessions_module._is_clarification_request(transcript) is False


def test_clarified_question_keeps_same_prompt_concrete():
    assert sessions_module._clarified_question(
        "Tell me about a time you handled conflict?"
    ) == "Tell me about a time you handled conflict using one specific work or school example."


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


def test_lazy_reaper_waits_while_a_turn_is_still_pending(monkeypatch):
    """A genuinely mid-interview session has a committed dangling (unanswered)
    turn — the question the candidate is currently on. The reaper must leave it
    alone so a slow answer isn't finalized out from under the user."""
    spawned = []
    monkeypatch.setattr(
        sessions_module,
        "_spawn_finalize",
        lambda **kwargs: spawned.append(kwargs),
    )

    session = SimpleNamespace(
        id=uuid.uuid4(),
        status=SessionStatus.in_progress,
        num_turns=6,
        updated_at=datetime.now(timezone.utc) - timedelta(minutes=10),
        company_summary=None,
        experience_level=None,
    )
    turns = [
        SimpleNamespace(id=uuid.uuid4(), turn_number=1, transcript_text="one"),
        SimpleNamespace(id=uuid.uuid4(), turn_number=2, transcript_text="two"),
        # The next question was inserted + committed but not yet answered.
        SimpleNamespace(id=uuid.uuid4(), turn_number=3, transcript_text=None),
    ]

    sessions_module._maybe_reap_stuck_session(session, turns)

    assert spawned == []


def test_lazy_reaper_spawns_for_early_ended_session(monkeypatch):
    """An early-ended session (quit after 2 of 6 turns) has had its dangling
    turn trimmed, so every remaining turn is answered. A stuck one — the
    detached finalizer died — is reaped even though it never reached num_turns,
    anchored on the highest-numbered answered turn."""
    spawned = []
    monkeypatch.setattr(
        sessions_module,
        "_spawn_finalize",
        lambda **kwargs: spawned.append(kwargs),
    )

    session = SimpleNamespace(
        id=uuid.uuid4(),
        status=SessionStatus.in_progress,
        num_turns=6,
        updated_at=datetime.now(timezone.utc) - timedelta(minutes=10),
        company_summary=None,
        experience_level=None,
    )
    last_answered = SimpleNamespace(id=uuid.uuid4(), turn_number=2, transcript_text="two")
    turns = [
        SimpleNamespace(id=uuid.uuid4(), turn_number=1, transcript_text="one"),
        last_answered,
    ]

    sessions_module._maybe_reap_stuck_session(session, turns)

    assert spawned == [
        {
            "session_id": session.id,
            "final_turn_id": last_answered.id,
            "category": None,
            "experience_level": None,
            "jd_summary": None,
        }
    ]


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
            # Threaded from the reaped session's brief (None here — no company
            # summary → no brief → no pasted-JD role facts).
            "jd_summary": None,
        }
    ]
