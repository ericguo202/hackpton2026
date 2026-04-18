"""
Unit tests for the Gemma 4 evaluator.

The Gemma SDK call is fully mocked — these tests are hermetic and do not
require a live API key. The real HTTP exchange is exercised by the optional
manual smoke test documented in the plan file.
"""

import json
from types import SimpleNamespace

import pytest

from app.services.evaluator import EvaluatorOutput, evaluate_turn
from app.services.filler_words import count_filler_words


def _fake_response(payload: dict) -> SimpleNamespace:
    return SimpleNamespace(text=json.dumps(payload))


class _FakeModel:
    def __init__(self, *args, **kwargs):
        pass

    async def generate_content_async(self, *args, **kwargs):
        return _fake_response(
            {
                "directness": 7,
                "star": 6,
                "specificity": 8,
                "impact": 5,
                "conciseness": 6,
                "notes": "Good structure, but quantify the impact to strengthen it.",
            }
        )


async def test_evaluate_turn_returns_valid_output(monkeypatch):
    monkeypatch.setattr("app.services.evaluator.genai.GenerativeModel", _FakeModel)

    result = await evaluate_turn(
        question="Tell me about a time you resolved a conflict.",
        transcript="I disagreed with a teammate about the design...",
    )

    assert isinstance(result, EvaluatorOutput)
    for field in ("directness", "star", "specificity", "impact", "conciseness"):
        value = getattr(result, field)
        assert isinstance(value, int)
        assert 0 <= value <= 10
    assert result.notes
    assert isinstance(result.notes, str)


async def test_claude_md_verification_three_ums(monkeypatch):
    """CLAUDE.md L175: canned transcript with 3 'um's -> filler_word_count == 3,
    all scores are ints 0-10."""
    monkeypatch.setattr("app.services.evaluator.genai.GenerativeModel", _FakeModel)

    transcript = "So um, I led the project. Um, we hit um the deadline."

    total, breakdown = count_filler_words(transcript)
    assert total == 3
    assert breakdown == {"um": 3}

    scores = await evaluate_turn(
        question="Tell me about a project you led.",
        transcript=transcript,
    )
    for field in ("directness", "star", "specificity", "impact", "conciseness"):
        value = getattr(scores, field)
        assert isinstance(value, int)
        assert 0 <= value <= 10


async def test_scores_clamped_to_range(monkeypatch):
    class _OOBModel:
        def __init__(self, *args, **kwargs):
            pass

        async def generate_content_async(self, *args, **kwargs):
            # Gemma occasionally returns out-of-range ints. Pydantic Field
            # constraints would raise; our `_clamp` before-validator squashes
            # them into [0, 10] before validation runs.
            return _fake_response(
                {
                    "directness": 15,
                    "star": -3,
                    "specificity": 7,
                    "impact": 100,
                    "conciseness": 4,
                    "notes": "n/a",
                }
            )

    monkeypatch.setattr("app.services.evaluator.genai.GenerativeModel", _OOBModel)

    result = await evaluate_turn(question="q", transcript="a")
    assert result.directness == 10
    assert result.star == 0
    assert result.specificity == 7
    assert result.impact == 10
    assert result.conciseness == 4


def test_history_included_in_prompt():
    """Prior-turn history should be threaded through so follow-ups see context."""
    from app.services.evaluator import _build_prompt

    prompt = _build_prompt(
        question="Tell me more.",
        transcript="Well...",
        history=[{"question": "First Q", "transcript": "First A"}],
    )
    assert "First Q" in prompt
    assert "First A" in prompt
    assert "Tell me more." in prompt
    assert "Well..." in prompt
