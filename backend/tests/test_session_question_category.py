"""Single-category-per-session routing.

The Setup picker sends `question_category` on `POST /sessions`; the backend
(1) validates it against the built allowlist, (2) stamps it on turn 1 at create,
and (3) in `submit_turn` inherits it onto every later turn — so a whole session
runs one question form. These tests cover all three without a real DB/network:
the schema validator directly, `_persist_session_and_turn` with a fake DB, and
`submit_turn` driven through the follow-up branch with monkeypatched I/O (the
same style as `test_session_clarification_retry.py`).
"""

import uuid
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from app.api.v1.endpoints import sessions as sessions_module
from app.db.models.enums import ExperienceLevel, QuestionCategory, SessionStatus
from app.schemas.session import CompanyBriefOut, SessionCreateIn
from app.services.stt import Transcription


# ── SessionCreateIn.question_category validator ──────────────────────────────


def test_session_create_defaults_to_star():
    body = SessionCreateIn(company="Acme", job_title="Analyst")
    assert body.question_category is QuestionCategory.experience_star


@pytest.mark.parametrize(
    "value",
    [
        "experience_star",
        "motivation_fit",
        "situational",
        "self_assessment_growth",
    ],
)
def test_session_create_accepts_built_categories(value):
    body = SessionCreateIn(
        company="Acme", job_title="Analyst", question_category=value
    )
    assert body.question_category.value == value


@pytest.mark.parametrize("value", ["totally_made_up", "behavioral", ""])
def test_session_create_rejects_unknown_categories(value):
    # All four taxonomy types are built now, so there is no real-but-unbuilt
    # member to reject; the gate still rejects any value that isn't a known
    # built category (an unknown string, a typo, etc.).
    with pytest.raises(ValidationError):
        SessionCreateIn(
            company="Acme", job_title="Analyst", question_category=value
        )


# ── _persist_session_and_turn stamps turn 1 ──────────────────────────────────


class _PersistDb:
    def __init__(self):
        self.added = []

    def add(self, obj):
        self.added.append(obj)

    async def flush(self):
        pass

    async def commit(self):
        pass

    async def refresh(self, _obj):
        pass


def _persist_user():
    return SimpleNamespace(
        id=uuid.uuid4(),
        experience_level=ExperienceLevel.entry,
        recent_opening_questions=[],
    )


def _turn1_of(db):
    turns = [o for o in db.added if getattr(o, "turn_number", None) == 1]
    assert len(turns) == 1
    return turns[0]


async def test_persist_stamps_turn1_with_chosen_category():
    db = _PersistDb()
    user = _persist_user()
    await sessions_module._persist_session_and_turn(
        db,
        user,
        company="Acme",
        job_title="Analyst",
        company_summary="{}",
        opening_q="Why do you want to work here?",
        session_id=uuid.uuid4(),
        voice_id="v",
        experience_level=user.experience_level,
        question_category=QuestionCategory.motivation_fit,
    )
    assert _turn1_of(db).question_category is QuestionCategory.motivation_fit


async def test_persist_defaults_turn1_to_star():
    # Callers that don't pass it (re-practice, custom questions) keep STAR.
    db = _PersistDb()
    user = _persist_user()
    await sessions_module._persist_session_and_turn(
        db,
        user,
        company="Acme",
        job_title="Analyst",
        company_summary="{}",
        opening_q="Tell me about a time.",
        session_id=uuid.uuid4(),
        voice_id="v",
        experience_level=user.experience_level,
    )
    assert _turn1_of(db).question_category is QuestionCategory.experience_star


# ── submit_turn inherits the session category onto the next turn ──────────────


class _Result:
    def __init__(self, *, one=None, rows=None):
        self._one = one
        self._rows = rows or []

    def scalar_one_or_none(self):
        return self._one

    def scalars(self):
        return self

    def all(self):
        return self._rows


class _SubmitDb:
    """Serves the two SELECTs submit_turn issues on the non-final path: the
    locking current-turn SELECT, then the prior-answered-turns SELECT."""

    def __init__(self, session, current_turn, prior_turns):
        self._session = session
        self._results = [
            _Result(one=current_turn),  # locking current-turn SELECT
            _Result(rows=prior_turns),  # prior evaluated turns SELECT
        ]
        self._i = 0
        self.added = []
        self.commits = 0

    async def get(self, _model, _pk):
        return self._session

    async def execute(self, _stmt):
        r = self._results[self._i]
        self._i += 1
        return r

    async def flush(self):
        pass

    async def commit(self):
        self.commits += 1

    def add(self, obj):
        self.added.append(obj)


def _submit_session(user_id, *, company_summary):
    return SimpleNamespace(
        id=uuid.uuid4(),
        user_id=user_id,
        job_title="Analyst",
        status=SessionStatus.in_progress,
        num_turns=4,
        company_summary=company_summary,
        experience_level=None,
        voice_id="voice-x",
        speech_speed=None,
        clarification_retry_used=False,
    )


def _opening_turn(category):
    return SimpleNamespace(
        id=uuid.uuid4(),
        turn_number=1,
        question_text="Why do you want to work here?",
        transcript_text=None,
        is_followup=False,
        question_category=category,
    )


def _patch_submit_io(monkeypatch):
    async def _fake_transcribe(_bytes, _filename):
        return Transcription(
            text="I admire the firm's work and want to contribute meaningfully.",
            duration_seconds=12.0,
        )

    async def _fake_read_audio(_audio):
        return b"x"

    async def _fake_moderation(*_a, **_k):
        return SimpleNamespace(flagged=False, categories=[])

    async def _fake_followup_and_tts(*_a, **_k):
        return ("Tell me more about that motivation?", "data:audio/mp3;base64,AA")

    async def _noop_eval(**_k):
        return None

    monkeypatch.setattr(sessions_module, "transcribe_audio", _fake_transcribe)
    monkeypatch.setattr(sessions_module, "_read_audio_bounded", _fake_read_audio)
    monkeypatch.setattr(sessions_module, "check_moderation", _fake_moderation)
    monkeypatch.setattr(sessions_module, "_followup_and_tts", _fake_followup_and_tts)
    monkeypatch.setattr(sessions_module, "_run_background_eval", _noop_eval)


@pytest.mark.parametrize(
    "category",
    [QuestionCategory.motivation_fit, QuestionCategory.experience_star],
)
async def test_submit_turn_inherits_session_category(monkeypatch, category):
    _patch_submit_io(monkeypatch)

    user = SimpleNamespace(id=uuid.uuid4())
    brief_json = CompanyBriefOut(
        description="An investment bank.",
        headlines=[],
        values=[],
        category="Finance, Banking, and Private Capital",
    ).model_dump_json()
    session = _submit_session(user.id, company_summary=brief_json)
    current_turn = _opening_turn(category)
    db = _SubmitDb(session, current_turn, prior_turns=[])

    out = await sessions_module.submit_turn(
        session.id,
        audio=SimpleNamespace(filename="a.webm"),
        cv_summary=None,
        user=user,
        db=db,
    )

    # A fresh opening → follow-up #1; the next question is the SAME category.
    assert out.next_question_is_followup is True
    assert out.next_question_category == category.value

    # The persisted next turn carries the inherited category too.
    inserted = [o for o in db.added if getattr(o, "turn_number", None) == 2]
    assert len(inserted) == 1
    assert inserted[0].question_category is category
