import uuid
from types import SimpleNamespace

import pytest

from app.api.v1.endpoints import sessions as sessions_module
from app.schemas.session import CompanyBriefOut
from app.services import followup as followup_module
from app.services.company_research import CompanyBrief, DEFAULT_CATEGORY


def _turn(turn_number, *, is_followup, question=None, transcript="answer"):
    return SimpleNamespace(
        id=uuid.uuid4(),
        turn_number=turn_number,
        is_followup=is_followup,
        question_text=question or f"q{turn_number}",
        transcript_text=transcript,
    )


# ── _followup_streak ─────────────────────────────────────────────────────────

def test_followup_streak_zero_when_last_turn_is_opening():
    turns = [_turn(1, is_followup=False)]
    assert sessions_module._followup_streak(turns) == 0


def test_followup_streak_counts_trailing_followups():
    turns = [_turn(1, is_followup=False), _turn(2, is_followup=True)]
    assert sessions_module._followup_streak(turns) == 1
    turns.append(_turn(3, is_followup=True))
    assert sessions_module._followup_streak(turns) == 2


def test_followup_streak_resets_after_new_opening():
    turns = [
        _turn(1, is_followup=False),
        _turn(2, is_followup=True),
        _turn(3, is_followup=False),  # pivot — new block
    ]
    assert sessions_module._followup_streak(turns) == 0


# ── _block_route (deterministic routing) ─────────────────────────────────────

@pytest.mark.parametrize(
    "fu_streak,has_brief,expected",
    [
        (0, True, "followup"),   # just answered an opening -> follow-up #1
        (1, True, "decide"),     # just answered follow-up #1 -> ask the model
        (2, True, "opening"),    # capped at 2 -> forced pivot
        (1, False, "followup"),  # no brief -> can't build an opening
        (0, False, "followup"),
        (2, False, "followup"),  # no brief -> never pivots
    ],
)
def test_block_route(fu_streak, has_brief, expected):
    assert sessions_module._block_route(fu_streak, has_brief=has_brief) == expected


# ── block pattern across num_turns 2..8 ──────────────────────────────────────

def _simulate_block_pattern(num_turns, *, always_continue):
    """Mirror submit_turn's routing to derive the is_followup sequence.

    `always_continue` stands in for the model decision at streak 1: True keeps
    probing (follow-up #2), False pivots. `has_brief=True` throughout.
    """
    turns = [_turn(1, is_followup=False)]
    while len(turns) < num_turns:
        streak = sessions_module._followup_streak(turns)
        route = sessions_module._block_route(streak, has_brief=True)
        if route == "decide":
            route = "followup" if always_continue else "opening"
        turns.append(
            _turn(len(turns) + 1, is_followup=(route == "followup"))
        )
    return [t.is_followup for t in turns]


def test_num_turns_two_is_single_followup():
    # num_turns=2 must stay byte-identical to the legacy flow: opening + 1 follow-up.
    assert _simulate_block_pattern(2, always_continue=True) == [False, True]
    assert _simulate_block_pattern(2, always_continue=False) == [False, True]


@pytest.mark.parametrize("num_turns", [3, 4, 5, 6, 7, 8])
def test_block_pattern_never_exceeds_two_consecutive_followups(num_turns):
    for always_continue in (True, False):
        pattern = _simulate_block_pattern(num_turns, always_continue=always_continue)
        assert len(pattern) == num_turns
        assert pattern[0] is False  # always opens on an opening
        # No block ever runs 3+ follow-ups in a row.
        run = 0
        for is_fu in pattern:
            run = run + 1 if is_fu else 0
            assert run <= 2


def test_block_pattern_full_probe_is_blocks_of_three():
    # always continue -> opening, fu, fu, opening, fu, fu, ...
    assert _simulate_block_pattern(8, always_continue=True) == [
        False, True, True, False, True, True, False, True,
    ]


def test_block_pattern_always_pivot_alternates():
    # always pivot -> opening, fu, opening, fu, ...
    assert _simulate_block_pattern(8, always_continue=False) == [
        False, True, False, True, False, True, False, True,
    ]


# ── _block_opening_id ────────────────────────────────────────────────────────

def test_block_opening_id_is_current_when_current_is_opening():
    opening = _turn(1, is_followup=False)
    assert sessions_module._block_opening_id([opening]) == opening.id


def test_block_opening_id_walks_back_past_followups():
    opening = _turn(3, is_followup=False)
    fu1 = _turn(4, is_followup=True)
    turns = [
        _turn(1, is_followup=False),
        _turn(2, is_followup=True),
        opening,
        fu1,
    ]
    # follow-up #2 after fu1 should parent to `opening`, not the earlier block.
    assert sessions_module._block_opening_id(turns) == opening.id


# ── _service_brief_from_out ──────────────────────────────────────────────────

def test_service_brief_from_out_none_input():
    assert sessions_module._service_brief_from_out(None) is None


def test_service_brief_from_out_roundtrips_category():
    category = "Finance, Banking, and Private Capital"
    out = CompanyBriefOut(
        description="d",
        headlines=["h"],
        values=["v"],
        category=category,
        role_signals=["rs"],
        sample_question_themes=["t"],
    )
    brief = sessions_module._service_brief_from_out(out)
    assert isinstance(brief, CompanyBrief)
    assert brief.category == category
    assert brief.role_signals == ["rs"]
    assert brief.sample_question_themes == ["t"]


def test_service_brief_from_out_coalesces_null_category():
    out = CompanyBriefOut(description="d", headlines=[], category=None)
    brief = sessions_module._service_brief_from_out(out)
    assert brief is not None
    assert brief.category == DEFAULT_CATEGORY


# ── _session_opening_avoid_list ──────────────────────────────────────────────

def test_session_opening_avoid_list_dedupes_preserving_order():
    prior = [_turn(1, is_followup=False, question="q1"),
             _turn(2, is_followup=True, question="q2")]
    current = _turn(3, is_followup=True, question="q3")
    user = SimpleNamespace(recent_opening_questions=["q3", "qx"])

    result = sessions_module._session_opening_avoid_list(prior, current, user)

    assert result == ["q1", "q2", "q3", "qx"]


def test_session_opening_avoid_list_tolerates_empty_user_recents():
    prior = [_turn(1, is_followup=False, question="q1")]
    current = _turn(2, is_followup=True, question="q2")
    user = SimpleNamespace(recent_opening_questions=None)
    assert sessions_module._session_opening_avoid_list(prior, current, user) == [
        "q1", "q2",
    ]


# ── _current_block_history ───────────────────────────────────────────────────

def test_current_block_history_is_block_scoped():
    # Two blocks: block A (turns 1-2), block B opening (turn 3), current = fu#1 (turn 4).
    prior = [
        _turn(1, is_followup=False, question="A-open", transcript="a1"),
        _turn(2, is_followup=True, question="A-fu", transcript="a2"),
        _turn(3, is_followup=False, question="B-open", transcript="b1"),
    ]
    current = _turn(4, is_followup=True, question="B-fu")
    history = sessions_module._current_block_history(prior, current, "b2")
    # Only block B's opening + the just-answered follow-up.
    assert history == [
        {"question": "B-open", "transcript": "b1"},
        {"question": "B-fu", "transcript": "b2"},
    ]


# ── _roll_session_openings_into_recent ───────────────────────────────────────

def test_roll_adds_mid_session_openings_newest_first():
    session = SimpleNamespace(saved_question_id=None)
    user = SimpleNamespace(recent_opening_questions=["q1"])  # turn-1 already rolled
    turns = [
        _turn(1, is_followup=False, question="q1"),
        _turn(2, is_followup=True, question="fu"),
        _turn(3, is_followup=False, question="q3"),
        _turn(5, is_followup=False, question="q5"),
    ]
    sessions_module._roll_session_openings_into_recent(session, user, turns)
    # newest-first, deduped, capped at 3.
    assert user.recent_opening_questions == ["q5", "q3", "q1"]


def test_roll_noop_when_no_mid_session_openings():
    session = SimpleNamespace(saved_question_id=None)
    sentinel = ["q1"]
    user = SimpleNamespace(recent_opening_questions=sentinel)
    turns = [
        _turn(1, is_followup=False, question="q1"),
        _turn(2, is_followup=True, question="fu"),
    ]
    sessions_module._roll_session_openings_into_recent(session, user, turns)
    # unchanged object (no reassignment) -> no spurious DB write.
    assert user.recent_opening_questions is sentinel


def test_roll_skipped_for_saved_question_sessions():
    session = SimpleNamespace(saved_question_id=uuid.uuid4())
    user = SimpleNamespace(recent_opening_questions=["q1"])
    turns = [
        _turn(1, is_followup=False, question="q1"),
        _turn(3, is_followup=False, question="q3"),
    ]
    sessions_module._roll_session_openings_into_recent(session, user, turns)
    assert user.recent_opening_questions == ["q1"]


# ── should_continue_followup fail-soft ───────────────────────────────────────

async def test_should_continue_followup_fails_soft_to_false(monkeypatch):
    async def _boom(*args, **kwargs):
        raise RuntimeError("openrouter down")

    monkeypatch.setattr(followup_module, "get_client", lambda: object())
    monkeypatch.setattr(followup_module, "create_chat_with_fallback", _boom)

    block = [
        {"question": "opening", "transcript": "answer"},
        {"question": "fu1", "transcript": "answer"},
    ]
    assert await followup_module.should_continue_followup(block) is False


async def test_should_continue_followup_true_on_explicit_yes(monkeypatch):
    async def _fake(*args, **kwargs):
        msg = SimpleNamespace(content='{"more_followup": true}')
        return SimpleNamespace(choices=[SimpleNamespace(message=msg)])

    monkeypatch.setattr(followup_module, "get_client", lambda: object())
    monkeypatch.setattr(followup_module, "create_chat_with_fallback", _fake)

    block = [{"question": "opening", "transcript": "answer"}]
    assert await followup_module.should_continue_followup(block) is True


async def test_should_continue_followup_false_on_explicit_no(monkeypatch):
    async def _fake(*args, **kwargs):
        msg = SimpleNamespace(content='{"more_followup": false}')
        return SimpleNamespace(choices=[SimpleNamespace(message=msg)])

    monkeypatch.setattr(followup_module, "get_client", lambda: object())
    monkeypatch.setattr(followup_module, "create_chat_with_fallback", _fake)

    block = [{"question": "opening", "transcript": "answer"}]
    assert await followup_module.should_continue_followup(block) is False
