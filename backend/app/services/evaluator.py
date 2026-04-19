"""
Gemma 4 behavioral-interview evaluator.

Takes a question + candidate transcript (and optional prior-turn history +
browser webcam analytics), returns the five rubric scores plus an optional
6th `delivery` score and a short coaching note. Runs on `gemma-4-26b-a4b-it`
per the hackathon sponsor track. Structured output is enforced via
`response_mime_type="application/json"`, so no JSON-repair loop is needed.

`delivery` is computed deterministically from `cv_summary` when available —
camera-declined turns keep the legacy 5-score output shape.

This module intentionally does NOT touch the DB or the filler-word regex —
the route handler at T+10-12 composes them. It also does NOT generate
`next_question` or decide `is_final`; session control is a separate concern.
"""

from __future__ import annotations

import logging

import google.generativeai as genai
from pydantic import BaseModel, field_validator

from app.services._gemini_utils import ensure_configured, extract_json_object

logger = logging.getLogger(__name__)

GEMMA_EVAL_MODEL = "gemma-4-26b-a4b-it"

# Personal calibration from `backend/recordings/calibration_20260418_230315`.
# These are the bands that separated the user's normal / engaged delivery
# from clearly egregious drift during calibration capture.
CALIBRATED_EYE_BAD = 47.4
CALIBRATED_EYE_GOOD = 71.0
CALIBRATED_EXPRESSION_BAD = 54.7
CALIBRATED_EXPRESSION_GOOD = 66.4
CALIBRATED_OVERALL_BAD = 50.0
CALIBRATED_OVERALL_GOOD = 69.4


def _normalize_band(value: float, bad: float, good: float) -> float:
    if good <= bad:
        return max(0.0, min(100.0, value))
    normalized = ((value - bad) / (good - bad)) * 100.0
    return max(0.0, min(100.0, normalized))


class EvaluatorOutput(BaseModel):
    """Structured output the Gemma 4 evaluator returns for one interview turn.

    Field names match the `interview_turns` columns (minus the `_score`
    suffix) so the route handler can map directly without a translation
    layer. Score bounds (0-10) are enforced by the `_clamp` validator, not
    JSON-Schema `minimum`/`maximum` — the google-generativeai Schema proto
    rejects those keywords when passed as `response_schema`. The system
    prompt tells Gemma the intended range; `_clamp` is the safety net.

    `delivery` is nullable: when the caller passes no `cv_summary`, the
    prompt instructs the model to omit the key, preserving the original
    5-score shape for camera-declined turns.
    """

    directness: int
    star: int
    specificity: int
    impact: int
    conciseness: int
    delivery: int | None = None
    notes: str

    @field_validator(
        "directness", "star", "specificity", "impact", "conciseness",
        mode="before",
    )
    @classmethod
    def _clamp(cls, v: int) -> int:
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
    overall = float(cv_summary.get("overall_interview_score", 0.0) or 0.0)
    eye = float(cv_summary.get("eye_contact_score", overall) or overall)
    expression = float(cv_summary.get("expression_score", overall) or overall)
    face_visible = float(cv_summary.get("face_visible_pct", 100.0) or 100.0)
    eye_stability = float(cv_summary.get("eye_contact_stability", 100.0) or 100.0)
    expression_stability = float(cv_summary.get("expression_stability", 100.0) or 100.0)
    looked_away_pct = float(cv_summary.get("looked_away_pct", 0.0) or 0.0)
    posture_drift_pct = float(cv_summary.get("posture_drift_pct", 0.0) or 0.0)
    low_energy_pct = float(cv_summary.get("low_energy_pct", 0.0) or 0.0)
    looked_away_streak = float(cv_summary.get("longest_looked_away_streak_frames", 0.0) or 0.0)
    posture_streak = float(cv_summary.get("longest_posture_drift_streak_frames", 0.0) or 0.0)
    low_energy_streak = float(cv_summary.get("longest_low_energy_streak_frames", 0.0) or 0.0)
    frames = float(cv_summary.get("frames_processed", 0.0) or 0.0)

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

    base_score = (
        (eye_quality * 0.35)
        + (expression_quality * 0.30)
        + (overall_quality * 0.20)
        + (visual_stability * 0.15)
    )

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

    @field_validator("delivery", mode="before")
    @classmethod
    def _clamp_optional(cls, v: int | None) -> int | None:
        if v is None:
            return None
        try:
            n = int(v)
        except (TypeError, ValueError):
            return None
        return max(0, min(10, n))


_SYSTEM_INSTRUCTION = """\
You are a behavioral-interview coach scoring a candidate's response.

Return ONLY a single JSON object with the following keys, and nothing else
(no markdown, no prose, no thinking steps):

{
  "directness": <int 0-10>,
  "star": <int 0-10>,
  "specificity": <int 0-10>,
  "impact": <int 0-10>,
  "conciseness": <int 0-10>,
  "delivery": <int 0-10>,        // OPTIONAL. The application computes the
                                 // authoritative delivery score itself from
                                 // webcam analytics; include only if helpful.
  "notes": "<2-3 sentence coaching note>"
}

Rubric:
- directness: Did the candidate answer the actual question asked, without
  meandering or deflecting?
- star: Did the answer follow the STAR structure (Situation, Task, Action,
  Result)? Award high marks only when all four elements are present.
- specificity: Did the answer cite concrete details (names, numbers,
  timelines, tools) rather than generic platitudes?
- impact: Did the answer articulate a measurable outcome or business result?
- conciseness: Was the answer appropriately scoped — neither rambling nor
  skeletal?
- delivery: Optional. The application computes the official delivery score
  from webcam analytics. If you include this field, keep it consistent with
  the analytics, but prioritize using the analytics to write a precise note.

`notes` is written in the second person ("You could strengthen this by...").
Be direct but constructive. When webcam analytics are provided AND the
delivery score is below 6, reference the specific weakness (eye contact
drift, flat expression, off-center posture) in the note; otherwise stay
focused on content.

"""


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


async def evaluate_turn(
    question: str,
    transcript: str,
    history: list[dict] | None = None,
    cv_summary: dict | None = None,
) -> EvaluatorOutput:
    """Score one interview turn with Gemma 4 and return structured JSON.

    When `cv_summary` is provided (browser-computed MediaPipe analytics),
    the model also returns a `delivery` 0-10 score and may reference
    on-camera behaviour in `notes`.
    """
    ensure_configured()
    model = genai.GenerativeModel(
        GEMMA_EVAL_MODEL,
        system_instruction=_SYSTEM_INSTRUCTION,
    )
    # We pass `response_mime_type` but NOT `response_schema`. Gemma 4 has
    # extended-reasoning behavior that interacts badly with the schema
    # constraint (server-side DEADLINE_EXCEEDED on plain eval prompts).
    # The system prompt spells the shape out explicitly and Pydantic
    # validates on the client side — equivalent guarantee, fast response.
    response = await model.generate_content_async(
        _build_prompt(question, transcript, history, cv_summary),
        generation_config={
            "response_mime_type": "application/json",
            "temperature": 0.2,
        },
        request_options={"timeout": 180},
    )
    result = EvaluatorOutput.model_validate_json(extract_json_object(response.text))
    if cv_summary is not None:
        result.delivery = _compute_delivery_score(cv_summary)
    return result
