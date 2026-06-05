"""
Forward-coaching generator (OpenRouter → `google/gemini-2.5-flash`).

Separate from the evaluator on purpose. The evaluator's job is scoring +
retrospective feedback against a long (~22k-char) field/experience rubric; this
call's job is one focused, forward-looking synthesis: "what to fix first and how
to deliver a stronger answer next time." Keeping it a distinct, short prompt
avoids stitching a second cognitive task onto the already-long evaluator prompt
(which would raise hallucination risk) and leaves the evaluator's LOCKED schema
untouched.

It is deliberately GROUNDED in the evaluator's already-validated output: the
input is the question + transcript + the evaluator's `main_takeaway` and top
`improvement_moments` (issue + how_to_strengthen). So it builds on weaknesses the
evaluator already anchored to the transcript rather than re-deriving them.

Runs in the background eval path (see `sessions.py`), so its latency is hidden
behind the "Scoring in progress" spinner. Fails soft: any error / parse failure
/ missing field returns `None`, and the caller simply leaves `next_take` unset.
"""

from __future__ import annotations

import json
import logging

from pydantic import ValidationError

from app.db.models.enums import ExperienceLevel
from app.services._field_prompts import FieldCategory
from app.services._openrouter import extract_json_object, get_client
from app.services.evaluator import EvaluatorOutput, NextTake

logger = logging.getLogger(__name__)

COACHING_MODEL = "google/gemini-2.5-flash"

_SYSTEM_PROMPT = """\
You are a behavioral-interview coach. The candidate just answered a question and \
has already been scored. Using their actual answer and the evaluator's notes, \
write ONE short, forward-looking coaching tip for their NEXT attempt.

Return ONLY a JSON object with exactly these two string fields:
- "focus": one plain sentence naming the single most important thing to change \
next time (<= 240 characters).
- "approach": two to three plain sentences on how to deliver a stronger version, \
built on the candidate's own example (<= 360 characters).

Hard rules:
- Use ONLY what the candidate actually said. Never invent names, numbers, \
companies, results, or events they did not state.
- When a specific is missing, tell them what KIND of detail to add (e.g. "name \
the result you reached" or "add the constraint you were under") — do NOT \
fabricate the specific itself.
- Be concrete and actionable, not generic. The advice must fit THIS answer, not \
any answer.
- Plain, adult, direct prose. No hype, no exclamation marks, no praise padding, \
no second-person pep talk.
- No markdown, no asterisks, no labels, no meta-reasoning about your own \
process or the candidate's state.
- If the answer was off-topic, a non-answer, or unintelligible, "focus" should \
plainly say to actually answer the question with a real example, and "approach" \
should describe how to pick and structure one.

Output JSON only. No preamble."""


def _render_context_block(
    category: FieldCategory | None,
    experience_level: ExperienceLevel | None,
) -> str:
    """One-line tone calibration, empty-omission like `followup._render_context_block`.

    Rendering "Field: None" would cue the model to invent framing from priors,
    so absent values drop their line entirely.
    """
    lines: list[str] = []
    if category is not None:
        lines.append(f"Field: {category}")
    if isinstance(experience_level, ExperienceLevel):
        lines.append(
            f"Candidate's experience level: {experience_level.value} — "
            "calibrate the depth and scope of the advice to this seniority."
        )
    if not lines:
        return ""
    return "\n".join(lines) + "\n\n"


def _build_user_prompt(
    question: str,
    transcript: str,
    eval_out: EvaluatorOutput,
    category: FieldCategory | None,
    experience_level: ExperienceLevel | None,
) -> str:
    detail = eval_out.feedback_detail
    parts: list[str] = [_render_context_block(category, experience_level)]
    parts.append(f"Interview question: {question}")
    parts.append(f"Candidate's answer: {transcript}")
    if detail.main_takeaway:
        parts.append(f"\nEvaluator's main takeaway: {detail.main_takeaway}")
    # The top 1-2 improvement moments are already transcript-anchored by the
    # evaluator; surfacing them keeps the coaching grounded in real weaknesses.
    moments = detail.improvement_moments[:2]
    if moments:
        rendered = "; ".join(
            f"{m.issue_type}: {m.how_to_strengthen}" for m in moments
        )
        parts.append(f"Evaluator's improvement notes: {rendered}")
    return "\n".join(p for p in parts if p)


async def generate_next_take(
    question: str,
    transcript: str,
    eval_out: EvaluatorOutput,
    category: FieldCategory | None = None,
    experience_level: ExperienceLevel | None = None,
) -> NextTake | None:
    """Return forward coaching for the next attempt, or `None` on any failure.

    Grounded in the evaluator's already-validated feedback. Never raises — the
    caller leaves `next_take` unset on `None`.
    """
    if not transcript or not transcript.strip():
        return None

    user_prompt = _build_user_prompt(
        question, transcript, eval_out, category, experience_level,
    )
    try:
        client = get_client()
        response = await client.chat.completions.create(
            model=COACHING_MODEL,
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.3,
            max_tokens=400,
            timeout=30.0,
            response_format={"type": "json_object"},
        )
        raw = response.choices[0].message.content or ""
        data = json.loads(extract_json_object(raw))
        # The ProseStr* BeforeValidators clip any overshoot before max_length runs.
        next_take = NextTake.model_validate(data)
        logger.info(
            "next_take generated (focus_len=%d, approach_len=%d)",
            len(next_take.focus), len(next_take.approach),
        )
        return next_take
    except (ValidationError, ValueError, KeyError, json.JSONDecodeError) as exc:
        logger.warning("next_take parse/validation failed: %s", exc)
        return None
    except Exception:  # noqa: BLE001 — network/SDK errors must fail soft
        logger.exception("next_take generation failed")
        return None
