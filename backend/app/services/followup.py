"""
Gemini 2.5 Flash follow-up question generator.

Separate from the Gemma 4 evaluator so both can run in parallel —
follow-up generation only needs the question + transcript and uses a
plain-text prompt (no JSON schema), keeping latency to ~0.5-1 s.
"""

from __future__ import annotations

import logging

import google.generativeai as genai

from app.services._gemini_utils import ensure_configured

logger = logging.getLogger(__name__)

GEMINI_FLASH_MODEL = "gemini-2.0-flash"

_PROMPT = """\
You are a behavioral interviewer conducting a mock interview. The candidate \
just answered a question. Write ONE follow-up question that probes a specific \
detail or gap in their answer.

Rules:
- Must be a complete question ending with "?"
- 10-25 words total
- Optionally open with a brief acknowledgment (2-4 words) before the question
- Reference something concrete the candidate actually said
- Do NOT ask a generic question that could apply to any answer

Good examples:
  You mentioned the deadline was tight — how did you prioritize when everything felt urgent?
  Interesting. What did you learn from that outcome that changed how you work?
  How did you handle the disagreement with your manager once it escalated?

Bad examples (do not do these):
  Okay.
  Can you tell me more?
  That's interesting, tell me more about that.

Return ONLY the follow-up question. No quotes. No other text.

Interview question: {question}
Candidate's answer: {transcript}"""


async def generate_followup(question: str, transcript: str) -> str:
    """Return a probing follow-up question via Gemini 2.5 Flash."""
    ensure_configured()
    model = genai.GenerativeModel(GEMINI_FLASH_MODEL)
    prompt = _PROMPT.format(question=question, transcript=transcript)
    logger.warning("Followup prompt sent (question=%r, transcript_len=%d)", question, len(transcript))
    response = await model.generate_content_async(
        prompt,
        generation_config={"temperature": 0.4, "max_output_tokens": 256},
        request_options={"timeout": 30},
    )
    raw = response.text
    logger.warning("Followup raw response: %r", raw)
    result = raw.strip().strip('"')
    if "?" not in result or len(result) < 15:
        logger.warning("Followup fallback triggered (result=%r)", result)
        result = "Can you walk me through a specific challenge you faced and how you resolved it?"
    logger.info("Followup generated: %d chars", len(result))
    return result
