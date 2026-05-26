"""
Behavioral-interview evaluator.

Takes a question + candidate transcript (and optional prior-turn history +
browser webcam analytics), returns the five rubric scores plus an optional
6th `delivery` score and a short coaching note. Runs on
`deepseek/deepseek-v3.2` via OpenRouter. Structured output is enforced via
`response_format={"type": "json_object"}`; the brace-counting extractor
covers the occasional preamble that slips through.

`delivery` is computed deterministically from `cv_summary` when available —
camera-declined turns keep the legacy 5-score output shape.

This module intentionally does NOT touch the DB or the filler-word regex —
the route handler at T+10-12 composes them. It also does NOT generate
`next_question` or decide `is_final`; session control is a separate concern.
"""

from __future__ import annotations

import logging
from typing import Annotated, Any, Callable, Literal

from pydantic import BaseModel, BeforeValidator, Field, field_validator, model_validator

from app.services._field_rubrics import build_system_instruction
from app.services._field_prompts import FieldCategory
from app.services._openrouter import extract_json_object, get_client

logger = logging.getLogger(__name__)

EVAL_MODEL = "deepseek/deepseek-v3.2"

# Personal calibration from `backend/recordings/calibration_20260418_230315`.
# These are the bands that separated the user's normal / engaged delivery
# from clearly egregious drift during calibration capture.
CALIBRATED_EYE_BAD = 47.4
CALIBRATED_EYE_GOOD = 71.0
CALIBRATED_EXPRESSION_BAD = 54.7
CALIBRATED_EXPRESSION_GOOD = 66.4
CALIBRATED_OVERALL_BAD = 50.0
CALIBRATED_OVERALL_GOOD = 69.4


def _truncate_to(limit: int, *, ellipsis: bool) -> Callable[[Any], Any]:
    """Factory for a Pydantic BeforeValidator that hard-truncates over-long strings.

    The system prompt asks DeepSeek to stay well under each field's char budget,
    but the model occasionally overshoots. Without this, a single overlong
    string would `ValidationError` the whole `EvaluatorOutput` and the turn
    would land in the DB with all-NULL scores. Clipping in `mode="before"`
    keeps the rest of the response intact.

    `ellipsis=False` is used for `transcript_snippet` so the clipped value
    stays a substring of the candidate transcript — `_drop_unanchored_moments`
    later does a `snippet in transcript` check, and a prefix-cut preserves
    that. Prose fields use `ellipsis=True` for legibility.
    """
    def _truncate(v: Any) -> Any:
        if not isinstance(v, str) or len(v) <= limit:
            return v
        if ellipsis and limit > 3:
            return v[: limit - 3] + "..."
        return v[:limit]
    return _truncate


# Annotated string types per cap. Each carries a BeforeValidator that clips
# the string before `max_length` validation runs, so worst-case overshoot
# from the model still validates and the moment survives.
SnippetStr = Annotated[str, BeforeValidator(_truncate_to(270, ellipsis=False))]
ProseStr270 = Annotated[str, BeforeValidator(_truncate_to(270, ellipsis=True))]
ProseStr390 = Annotated[str, BeforeValidator(_truncate_to(390, ellipsis=True))]


class PositiveMoment(BaseModel):
    transcript_snippet: SnippetStr = Field(min_length=1, max_length=270)
    why_this_helped: ProseStr390 = Field(min_length=1, max_length=390)
    keep_doing: ProseStr270 = Field(min_length=1, max_length=270)


class ImprovementMoment(BaseModel):
    transcript_snippet: SnippetStr = Field(min_length=1, max_length=270)
    issue_type: Literal[
        "too_vague",
        "missing_detail",
        "missing_result",
        "missing_reasoning",
        "off_track",
        "unprofessional",
        "does_not_answer_question",
        "weak_wording",
        "missed_opportunity",
        "delivery",
    ]
    why_this_weakened: ProseStr390 = Field(min_length=1, max_length=390)
    how_to_strengthen: ProseStr390 = Field(min_length=1, max_length=390)


class FeedbackDetail(BaseModel):
    main_takeaway: ProseStr270 = Field(min_length=1, max_length=270)
    positive_moments: list[PositiveMoment] = Field(default_factory=list, max_length=3)
    improvement_moments: list[ImprovementMoment] = Field(default_factory=list, max_length=4)
    quick_wins: list[str] = Field(default_factory=list, max_length=3)

    @model_validator(mode="before")
    @classmethod
    def _legacy_coaching_moments(cls, data: object) -> object:
        if isinstance(data, dict) and "improvement_moments" not in data:
            legacy = data.get("coaching_moments")
            if legacy is not None:
                data = {**data, "improvement_moments": legacy}
        return data


def _normalize_band(value: float, bad: float, good: float) -> float:
    if good <= bad:
        return max(0.0, min(100.0, value))
    normalized = ((value - bad) / (good - bad)) * 100.0
    return max(0.0, min(100.0, normalized))


def _summary_float(cv_summary: dict, key: str, default: float) -> float:
    value = cv_summary.get(key, default)
    if value is None or value == "":
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


class EvaluatorOutput(BaseModel):
    """Structured output the evaluator returns for one interview turn.

    Field names match the `interview_turns` columns (minus the `_score`
    suffix) so the route handler can map directly without a translation
    layer. Score bounds (0-10) are enforced by the `_clamp` validator; the
    system prompt tells the model the intended range and `_clamp` is the
    safety net for any fractional / out-of-range drift.

    `delivery` is nullable: when the caller passes no `cv_summary`, the
    prompt instructs the model to omit the key, preserving the original
    5-score shape for camera-declined turns.
    """

    structure: int
    problem_solving: int
    impact: int
    initiative: int
    depth: int
    delivery: int | None = None
    feedback_detail: FeedbackDetail
    notes: str

    @field_validator(
        "structure", "problem_solving", "impact", "initiative", "depth", "delivery",
        mode="before",
    )
    @classmethod
    def _clamp(cls, v: int | float | None) -> int | None:
        # `mode="before"` lets us accept the float scores models sometimes
        # return (e.g. `5.6`) instead of the integers the prompt asks
        # for — Pydantic 2's strict int validation would otherwise raise
        # on any fractional value and 500 the whole turn.
        if v is None:
            return None
        try:
            n = int(v)
        except (TypeError, ValueError):
            return 0
        return max(0, min(10, n))


def _compute_delivery_score(cv_summary: dict) -> int:
    """Derive a more stable 0-10 delivery score from webcam analytics.

    The browser now sends not just averaged eye/expression scores, but also
    issue coverage, streak length, and stability metrics. We use those
    directly so delivery scoring is deterministic and less sensitive to LLM
    variance or a single unusually strong frame.
    """
    overall = _summary_float(cv_summary, "overall_interview_score", 0.0)
    eye = _summary_float(cv_summary, "eye_contact_score", overall)
    expression = _summary_float(cv_summary, "expression_score", overall)
    face_visible = _summary_float(cv_summary, "face_visible_pct", 100.0)
    eye_stability = _summary_float(cv_summary, "eye_contact_stability", 100.0)
    expression_stability = _summary_float(cv_summary, "expression_stability", 100.0)
    looked_away_pct = _summary_float(cv_summary, "looked_away_pct", 0.0)
    posture_drift_pct = _summary_float(cv_summary, "posture_drift_pct", 0.0)
    low_energy_pct = _summary_float(cv_summary, "low_energy_pct", 0.0)
    looked_away_streak = _summary_float(
        cv_summary, "longest_looked_away_streak_frames", 0.0
    )
    posture_streak = _summary_float(
        cv_summary, "longest_posture_drift_streak_frames", 0.0
    )
    low_energy_streak = _summary_float(
        cv_summary, "longest_low_energy_streak_frames", 0.0
    )
    frames = _summary_float(cv_summary, "frames_processed", 0.0)

    eye_quality = _normalize_band(eye, CALIBRATED_EYE_BAD, CALIBRATED_EYE_GOOD)
    expression_quality = _normalize_band(
        expression,
        CALIBRATED_EXPRESSION_BAD,
        CALIBRATED_EXPRESSION_GOOD,
    )
    overall_quality = _normalize_band(
        overall,
        CALIBRATED_OVERALL_BAD,
        CALIBRATED_OVERALL_GOOD,
    )
    visual_stability = max(
        0.0,
        min(
            100.0,
            (face_visible * 0.35)
            + (eye_stability * 0.35)
            + (expression_stability * 0.30),
        ),
    )

    calibrated_quality = (
        (eye_quality * 0.34)
        + (expression_quality * 0.24)
        + (overall_quality * 0.22)
        + (visual_stability * 0.20)
    )
    raw_quality = (
        (eye * 0.30)
        + (expression * 0.25)
        + (overall * 0.25)
        + (visual_stability * 0.20)
    )
    base_score = (calibrated_quality * 0.65) + (raw_quality * 0.35)

    # Coverage penalties: how much of the answer felt off, not just whether
    # a weak frame happened to occur.
    base_score -= looked_away_pct * 0.10
    base_score -= posture_drift_pct * 0.07
    base_score -= low_energy_pct * 0.10

    # Streak penalties: sustained issues should matter more than scattered
    # blips. Normalize against total analyzed frames when possible.
    if frames > 0:
        looked_away_streak_pct = (looked_away_streak / frames) * 100
        posture_streak_pct = (posture_streak / frames) * 100
        low_energy_streak_pct = (low_energy_streak / frames) * 100
        base_score -= min(8.0, looked_away_streak_pct * 0.12)
        base_score -= min(6.0, posture_streak_pct * 0.08)
        base_score -= min(8.0, low_energy_streak_pct * 0.12)

    # Face visibility matters disproportionately; below this threshold the
    # interviewer cannot reliably read the candidate at all.
    if face_visible < 96:
        base_score -= min(12.0, (96 - face_visible) * 0.55)

    return max(0, min(10, round(base_score / 10)))


def _delivery_quick_win(cv_summary: dict, delivery_score: int) -> str | None:
    face_visible = _summary_float(cv_summary, "face_visible_pct", 100.0)
    eye = _summary_float(cv_summary, "eye_contact_score", 0.0)
    expression = _summary_float(cv_summary, "expression_score", 0.0)
    looked_away_pct = _summary_float(cv_summary, "looked_away_pct", 0.0)
    posture_drift_pct = _summary_float(cv_summary, "posture_drift_pct", 0.0)
    low_energy_pct = _summary_float(cv_summary, "low_energy_pct", 0.0)

    if face_visible < 85:
        return (
            "Delivery: keep your face centered; it was visible for "
            f"{face_visible:.0f}% of analyzed frames."
        )

    issue_tips = [
        (
            looked_away_pct,
            "hold your gaze closer to the camera lens",
        ),
        (
            low_energy_pct,
            "add a little facial warmth while you speak",
        ),
        (
            posture_drift_pct,
            "keep your head centered and posture steady",
        ),
    ]
    top_pct, top_tip = max(issue_tips, key=lambda item: item[0])
    if top_pct >= 12:
        return f"Delivery: {top_tip}; this showed up in {top_pct:.0f}% of analyzed face frames."

    if delivery_score > 6:
        return None

    hint = str(cv_summary.get("coaching_tip") or "").strip()
    if hint and "nice balance" not in hint.lower():
        return f"Delivery: {hint.rstrip('.')}."
    if eye < CALIBRATED_EYE_BAD:
        return "Delivery: look closer to the camera lens before starting each main point."
    if expression < CALIBRATED_EXPRESSION_BAD:
        return "Delivery: add a little facial warmth so the answer reads as more engaged."
    return "Delivery: keep your gaze, expression, and posture steadier through the answer."


def _add_delivery_quick_win(
    feedback: FeedbackDetail,
    cv_summary: dict,
    delivery_score: int | None,
) -> None:
    if delivery_score is None:
        return
    tip = _delivery_quick_win(cv_summary, delivery_score)
    if not tip:
        return
    existing = [quick_win for quick_win in feedback.quick_wins if quick_win != tip]
    feedback.quick_wins = [tip, *existing][:3]


def _format_cv_block(cv_summary: dict) -> str:
    """Render the browser-computed webcam summary as a compact text block.

    Shape mirrors `backend/interview_feedback_latest.json`. Missing keys
    fall back to 'n/a' so a partial summary (e.g. face dropped for the
    entire turn) is still legible to the model.
    """
    face_pct = cv_summary.get("face_visible_pct", "n/a")
    eye = cv_summary.get("eye_contact_score", "n/a")
    eye_rating = cv_summary.get("eye_contact_rating", "")
    expr = cv_summary.get("expression_score", "n/a")
    expr_rating = cv_summary.get("expression_rating", "")
    overall = cv_summary.get("overall_interview_score", "n/a")
    overall_rating = cv_summary.get("interview_rating", "")
    best_eye = cv_summary.get("best_eye_contact_frame_score", "n/a")
    best_expr = cv_summary.get("best_expression_frame_score", "n/a")
    eye_stability = cv_summary.get("eye_contact_stability", "n/a")
    expr_stability = cv_summary.get("expression_stability", "n/a")
    looked_away_pct = cv_summary.get("looked_away_pct", "n/a")
    posture_drift_pct = cv_summary.get("posture_drift_pct", "n/a")
    low_energy_pct = cv_summary.get("low_energy_pct", "n/a")
    longest_looked_away = cv_summary.get("longest_looked_away_streak_frames", "n/a")
    longest_posture = cv_summary.get("longest_posture_drift_streak_frames", "n/a")
    longest_low_energy = cv_summary.get("longest_low_energy_streak_frames", "n/a")
    tip = cv_summary.get("coaching_tip", "")

    def _tag(rating: str) -> str:
        return f" ({rating})" if rating else ""

    return (
        "Webcam analytics (for delivery score + coaching prose):\n"
        f"  Face visible: {face_pct}% of frames\n"
        f"  Eye contact score (0-100): {eye}{_tag(eye_rating)}\n"
        f"  Expression score (0-100): {expr}{_tag(expr_rating)}\n"
        f"  Overall: {overall}{_tag(overall_rating)}\n"
        f"  Best eye-contact frame: {best_eye}\n"
        f"  Best expression frame: {best_expr}\n"
        f"  Eye-contact stability: {eye_stability}\n"
        f"  Expression stability: {expr_stability}\n"
        f"  Looked-away coverage: {looked_away_pct}% of analyzed face frames\n"
        f"  Posture-drift coverage: {posture_drift_pct}% of analyzed face frames\n"
        f"  Low-energy coverage: {low_energy_pct}% of analyzed face frames\n"
        f"  Longest looked-away streak: {longest_looked_away} frames\n"
        f"  Longest posture-drift streak: {longest_posture} frames\n"
        f"  Longest low-energy streak: {longest_low_energy} frames\n"
        f"  Heuristic coaching hint: \"{tip}\""
    )


def _build_prompt(
    question: str,
    transcript: str,
    history: list[dict] | None,
    cv_summary: dict | None = None,
) -> str:
    parts: list[str] = []
    if history:
        parts.append("Prior turns in this session (for context):")
        for i, turn in enumerate(history, start=1):
            parts.append(f"  Turn {i} question: {turn.get('question', '')}")
            parts.append(f"  Turn {i} answer:   {turn.get('transcript', '')}")
        parts.append("")
    parts.append(f"Current question: {question}")
    parts.append(f"Candidate answer: {transcript}")
    if cv_summary:
        parts.append("")
        parts.append(_format_cv_block(cv_summary))
    return "\n".join(parts)


def _feedback_text(feedback: FeedbackDetail) -> str:
    parts = [feedback.main_takeaway]
    if feedback.positive_moments:
        moment = feedback.positive_moments[0]
        parts.append(
            f"What worked: you said \"{moment.transcript_snippet}\". "
            f"{moment.why_this_helped}"
        )
    if feedback.improvement_moments:
        moment = feedback.improvement_moments[0]
        parts.append(
            f"You said: \"{moment.transcript_snippet}\" "
            f"{moment.why_this_weakened} {moment.how_to_strengthen}"
        )
    if feedback.quick_wins:
        parts.append("Quick win: " + feedback.quick_wins[0])
    return " ".join(part.strip() for part in parts if part.strip())


def _drop_unanchored_moments(result: EvaluatorOutput, transcript: str) -> EvaluatorOutput:
    """Keep only feedback moments tied to exact transcript text.

    The model is prompted to quote exact snippets, but this keeps the
    product promise enforceable at the backend boundary.
    """
    positive = [
        moment
        for moment in result.feedback_detail.positive_moments[:3]
        if moment.transcript_snippet.strip()
        and moment.transcript_snippet.strip() in transcript
    ]
    improvements = [
        moment
        for moment in result.feedback_detail.improvement_moments[:4]
        if moment.transcript_snippet.strip()
        and moment.transcript_snippet.strip() in transcript
    ]
    result.feedback_detail.positive_moments = positive
    result.feedback_detail.improvement_moments = improvements
    result.feedback_detail.quick_wins = result.feedback_detail.quick_wins[:3]
    if not result.notes.strip():
        result.notes = _feedback_text(result.feedback_detail)
    return result


async def evaluate_turn(
    question: str,
    transcript: str,
    history: list[dict] | None = None,
    cv_summary: dict | None = None,
    category: FieldCategory | None = None,
) -> EvaluatorOutput:
    """Score one interview turn and return structured JSON.

    When `cv_summary` is provided (browser-computed MediaPipe analytics),
    the caller-side `_compute_delivery_score` replaces any model-returned
    `delivery` with a deterministic derivation from the analytics.

    `category` selects the field-tailored rubric appendix; None or an
    unknown category falls back to the DEFAULT_CATEGORY prompt — same
    fallback policy as the opening-question agent.
    """
    client = get_client()
    response = await client.chat.completions.create(
        model=EVAL_MODEL,
        messages=[
            {"role": "system", "content": build_system_instruction(category)},
            {
                "role": "user",
                "content": _build_prompt(question, transcript, history, cv_summary),
            },
        ],
        temperature=0.2,
        response_format={"type": "json_object"},
        timeout=180.0,
    )
    text = response.choices[0].message.content or ""
    result = EvaluatorOutput.model_validate_json(extract_json_object(text))
    if cv_summary is not None:
        result.delivery = _compute_delivery_score(cv_summary)
        _add_delivery_quick_win(result.feedback_detail, cv_summary, result.delivery)
    return _drop_unanchored_moments(result, transcript)
