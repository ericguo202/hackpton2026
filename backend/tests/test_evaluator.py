"""
Unit tests for the behavioral-interview evaluator.

The OpenRouter client call is fully mocked — these tests are hermetic and
do not require a live API key. The real HTTP exchange is exercised by the
optional manual smoke test documented in the plan file.
"""

import json
from types import SimpleNamespace

import pytest

from app.services.evaluator import (
    EvaluatorOutput,
    _compute_delivery_score,
    evaluate_turn,
)
from app.services.filler_words import count_filler_words


def _fake_response(payload: dict) -> SimpleNamespace:
    """Mimic the OpenAI Chat Completions response shape.

    `response.choices[0].message.content` is the only field the evaluator
    reads. Wrapping the payload as a JSON string mirrors what the real
    model returns under `response_format={"type": "json_object"}`.
    """
    return SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=json.dumps(payload)))]
    )


def _make_fake_client(payload_or_fn):
    """Build a stand-in for `AsyncOpenAI` that only implements the one
    method our code calls: `client.chat.completions.create(...)`.

    Accepts either a static payload dict or a callable (`(**kwargs) -> dict`)
    so tests that need to inspect the prompt can capture it.
    """
    if callable(payload_or_fn):
        resolve = payload_or_fn
    else:
        def resolve(**_kwargs):
            return payload_or_fn

    async def _create(**kwargs):
        return _fake_response(resolve(**kwargs))

    return SimpleNamespace(
        chat=SimpleNamespace(completions=SimpleNamespace(create=_create))
    )


_DEFAULT_PAYLOAD = {
    "directness": 7,
    "star": 6,
    "specificity": 8,
    "impact": 5,
    "conciseness": 6,
    "notes": "Good structure, but quantify the impact to strengthen it.",
}


async def test_evaluate_turn_returns_valid_output(monkeypatch):
    monkeypatch.setattr(
        "app.services.evaluator.get_client",
        lambda: _make_fake_client(_DEFAULT_PAYLOAD),
    )

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
    monkeypatch.setattr(
        "app.services.evaluator.get_client",
        lambda: _make_fake_client(_DEFAULT_PAYLOAD),
    )

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
    # Models occasionally return out-of-range ints. Pydantic Field
    # constraints would raise; our `_clamp` before-validator squashes
    # them into [0, 10] before validation runs.
    oob_payload = {
        "directness": 15,
        "star": -3,
        "specificity": 7,
        "impact": 100,
        "conciseness": 4,
        "notes": "n/a",
    }
    monkeypatch.setattr(
        "app.services.evaluator.get_client",
        lambda: _make_fake_client(oob_payload),
    )

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


async def test_delivery_absent_when_no_cv_summary(monkeypatch):
    """When the caller passes no cv_summary, the model's 5-key response
    should round-trip with delivery=None — the camera-declined path."""
    monkeypatch.setattr(
        "app.services.evaluator.get_client",
        lambda: _make_fake_client(_DEFAULT_PAYLOAD),
    )

    result = await evaluate_turn(
        question="Tell me about a time you led a project.",
        transcript="I led a migration from Mongo to Postgres...",
        cv_summary=None,
    )
    assert result.delivery is None


async def test_delivery_roundtrips_with_cv_summary(monkeypatch):
    """With cv_summary provided, delivery is computed from analytics, not
    trusted from the model output."""
    captured_prompt: dict[str, str] = {}

    def _resolve(**kwargs):
        # The user prompt is the second message in the `messages=` list.
        captured_prompt["value"] = kwargs["messages"][1]["content"]
        return {
            "directness": 6,
            "star": 7,
            "specificity": 6,
            "impact": 5,
            "conciseness": 7,
            "delivery": 7,
            "notes": "Strong eye contact; expression could be warmer.",
        }

    monkeypatch.setattr(
        "app.services.evaluator.get_client",
        lambda: _make_fake_client(_resolve),
    )

    cv_summary = {
        "frames_processed": 4668,
        "face_visible_pct": 98.1,
        "eye_contact_score": 67.9,
        "expression_score": 55.9,
        "overall_interview_score": 63.7,
        "eye_contact_rating": "good",
        "expression_rating": "fair",
        "interview_rating": "good",
        "best_eye_contact_frame_score": 74.6,
        "best_expression_frame_score": 91.6,
        "coaching_tip": "Relax your face and add a little warmth between answers.",
    }
    result = await evaluate_turn(
        question="Walk me through how you handled a difficult teammate.",
        transcript="There was a teammate who kept missing standups...",
        cv_summary=cv_summary,
    )
    assert result.delivery == _compute_delivery_score(cv_summary)
    # The analytics block must actually reach the prompt — otherwise the
    # model can't write an analytics-aware coaching note.
    assert "Webcam analytics" in captured_prompt["value"]
    assert "67.9" in captured_prompt["value"]


async def test_delivery_falls_back_when_model_omits_it_despite_cv_summary(monkeypatch):
    missing_delivery_payload = {
        "directness": 6,
        "star": 5,
        "specificity": 6,
        "impact": 5,
        "conciseness": 7,
        "notes": "Content is decent, but delivery needs more warmth.",
    }
    monkeypatch.setattr(
        "app.services.evaluator.get_client",
        lambda: _make_fake_client(missing_delivery_payload),
    )

    cv_summary = {
        "frames_processed": 149,
        "face_visible_pct": 100.0,
        "eye_contact_score": 65.4,
        "expression_score": 32.2,
        "overall_interview_score": 53.8,
        "eye_contact_rating": "good",
        "expression_rating": "needs work",
        "interview_rating": "fair",
        "best_eye_contact_frame_score": 74.0,
        "best_expression_frame_score": 51.1,
        "coaching_tip": "Add a slight smile and keep your eyes more open to look engaged.",
    }

    result = await evaluate_turn(
        question="Tell me about a technical challenge.",
        transcript="I worked through a debugging issue with my team.",
        cv_summary=cv_summary,
    )

    assert result.delivery == _compute_delivery_score(cv_summary)


def test_compute_delivery_score_penalizes_sustained_issues():
    strong = {
        "frames_processed": 180,
        "face_visible_pct": 99.0,
        "eye_contact_score": 78.0,
        "expression_score": 72.0,
        "overall_interview_score": 75.0,
        "eye_contact_stability": 90.0,
        "expression_stability": 88.0,
        "looked_away_pct": 4.0,
        "posture_drift_pct": 5.0,
        "low_energy_pct": 6.0,
        "longest_looked_away_streak_frames": 4,
        "longest_posture_drift_streak_frames": 5,
        "longest_low_energy_streak_frames": 5,
    }
    weak = {
        "frames_processed": 180,
        "face_visible_pct": 94.0,
        "eye_contact_score": 63.0,
        "expression_score": 48.0,
        "overall_interview_score": 57.0,
        "eye_contact_stability": 58.0,
        "expression_stability": 52.0,
        "looked_away_pct": 28.0,
        "posture_drift_pct": 22.0,
        "low_energy_pct": 35.0,
        "longest_looked_away_streak_frames": 42,
        "longest_posture_drift_streak_frames": 31,
        "longest_low_energy_streak_frames": 58,
    }

    assert _compute_delivery_score(strong) > _compute_delivery_score(weak)
