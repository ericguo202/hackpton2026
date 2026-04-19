"""
Gemma 4 behavioral-interview evaluator.

Takes a question + candidate transcript (and optional prior-turn history +
browser webcam analytics), returns the five rubric scores plus an optional
6th `delivery` score and a short coaching note. Runs on `gemma-4-26b-a4b-it`
per the hackathon sponsor track. Structured output is enforced via
`response_mime_type="application/json"`, so no JSON-repair loop is needed.

`delivery` is only emitted when `cv_summary` is provided — camera-declined
turns keep the legacy 5-score output shape.

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


def _compute_delivery_fallback(cv_summary: dict) -> int:
    """Derive a stable 0-10 delivery score from webcam analytics.

    The prompt already tells Gemma to map the overall 0-100 webcam score
    linearly while also considering eye contact vs expression separately.
    When the model omits `delivery` despite having `cv_summary`, we apply
    that same logic deterministically instead of returning null.
    """
    overall = float(cv_summary.get("overall_interview_score", 0.0) or 0.0)
    eye = float(cv_summary.get("eye_contact_score", overall) or overall)
    expression = float(cv_summary.get("expression_score", overall) or overall)
    face_visible = float(cv_summary.get("face_visible_pct", 100.0) or 100.0)

    # Start from the overall heuristic, then temper it with the split
    # between eye contact and expression so a flat face doesn't receive
    # an unrealistically high delivery score.
    blended = (overall * 0.5) + (eye * 0.3) + (expression * 0.2)
    if face_visible < 90:
        blended -= min(15.0, (90 - face_visible) * 0.35)

    return max(0, min(10, round(blended / 10)))

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
  "delivery": <int 0-10>,        // ONLY include when "Webcam analytics"
                                 // appears in the user message. Otherwise
                                 // OMIT this key entirely.
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
- delivery: How composed did the candidate look on camera — eye contact,
  posture, and facial engagement — based on the webcam-analytics block
  in the user message. Map the provided 0-100 overall score linearly to
  0-10, but ALSO consider eye-contact vs expression separately; a strong
  eye-contact reading with a flat expression should land mid-range, not
  high.

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
    if cv_summary is not None and result.delivery is None:
        result.delivery = _compute_delivery_fallback(cv_summary)
        logger.info(
            "Evaluator omitted delivery despite cv_summary; using fallback delivery=%s",
            result.delivery,
        )
    return result
