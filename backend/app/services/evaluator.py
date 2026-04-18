"""
Gemma 4 behavioral-interview evaluator.

Takes a question + candidate transcript (and optional prior-turn history),
returns the five rubric scores plus a short coaching note. Runs on
`gemma-4-26b-a4b-it` per the hackathon sponsor track. Structured output is
enforced via `response_mime_type="application/json"` + `response_schema`, so
no JSON-repair loop is needed.

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
    """

    directness: int
    star: int
    specificity: int
    impact: int
    conciseness: int
    notes: str

    @field_validator("directness", "star", "specificity", "impact", "conciseness", mode="before")
    @classmethod
    def _clamp(cls, v: int) -> int:
        try:
            n = int(v)
        except (TypeError, ValueError):
            return 0
        return max(0, min(10, n))


_SYSTEM_INSTRUCTION = """\
You are a behavioral-interview coach scoring a candidate's response.

Return ONLY a single JSON object with exactly these six keys, and nothing
else (no markdown, no prose, no thinking steps):

{
  "directness": <int 0-10>,
  "star": <int 0-10>,
  "specificity": <int 0-10>,
  "impact": <int 0-10>,
  "conciseness": <int 0-10>,
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

`notes` is written in the second person ("You could strengthen this by...").
Be direct but constructive.
"""


def _build_prompt(
    question: str,
    transcript: str,
    history: list[dict] | None,
) -> str:
    parts: list[str] = []
    if history:
        parts.append("Prior turns in this session (for context on follow-ups):")
        for i, turn in enumerate(history, start=1):
            parts.append(f"  Turn {i} question: {turn.get('question', '')}")
            parts.append(f"  Turn {i} answer:   {turn.get('transcript', '')}")
        parts.append("")
    parts.append(f"Current question: {question}")
    parts.append(f"Candidate answer: {transcript}")
    return "\n".join(parts)


async def evaluate_turn(
    question: str,
    transcript: str,
    history: list[dict] | None = None,
) -> EvaluatorOutput:
    """Score one interview turn with Gemma 4 and return structured JSON."""
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
        _build_prompt(question, transcript, history),
        generation_config={
            "response_mime_type": "application/json",
            "temperature": 0.2,
        },
        request_options={"timeout": 180},
    )
    return EvaluatorOutput.model_validate_json(extract_json_object(response.text))
