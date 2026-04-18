"""
Opening-question generator.

Produces a single tailored behavioral-interview question that references both
the candidate's profile (resume + declared target role/industry/bio) and the
company brief produced by `company_research.research_company()`. Runs on
Gemini 2.5 Flash per CLAUDE.md L95.

Output is plain text — no JSON — so we skip `response_mime_type` and the
client-side extractor. The prompt still constrains the model to a single
question, and we strip any wrapping quotes defensively.
"""

from __future__ import annotations

import logging

import google.generativeai as genai

from app.db.models.user import User
from app.services._gemini_utils import ensure_configured
from app.services.company_research import CompanyBrief

logger = logging.getLogger(__name__)

GEMINI_FLASH_MODEL = "gemini-2.5-flash"
_RESUME_CHAR_LIMIT = 1500


_SYSTEM_INSTRUCTION = """\
You are a behavioral-interview coach preparing a candidate for a mock
interview.

Generate exactly ONE opening interview question, tailored to BOTH the
candidate's background AND the target company's recent activity. The
question must be:
- Open-ended and behavioral (answerable with the STAR structure).
- 1-2 sentences, no preamble, no markdown, no surrounding quotes.
- Specific enough to hook into the candidate's real experience while
  inviting them to connect it to something the target company cares about.

Return ONLY the question text. Nothing else.
"""


def _profile_digest(user: User, job_title: str) -> str:
    resume_excerpt = (user.resume_text or "")[:_RESUME_CHAR_LIMIT]
    return (
        f"Candidate: {user.name or 'the candidate'}\n"
        f"Applying for: {job_title}\n"
        f"Declared target role: {user.target_role or 'n/a'}\n"
        f"Industry focus: {user.industry or 'n/a'}\n"
        f"Experience level: {getattr(user.experience_level, 'value', user.experience_level) or 'n/a'}\n"
        f"Short bio: {user.short_bio or 'n/a'}\n"
        f"Resume excerpt (truncated): {resume_excerpt}"
    )


def _company_digest(brief: CompanyBrief) -> str:
    headlines = "\n".join(f"  - {h}" for h in brief.headlines) or "  (none)"
    values = "\n".join(f"  - {v}" for v in brief.values) or "  (none)"
    return (
        f"Company description: {brief.description}\n"
        f"Recent headlines:\n{headlines}\n"
        f"Stated values:\n{values}"
    )


def _strip_wrapping_quotes(s: str) -> str:
    s = s.strip()
    if len(s) >= 2 and s[0] in {'"', "'"} and s[-1] == s[0]:
        return s[1:-1].strip()
    return s


async def generate_opening_question(
    user: User,
    brief: CompanyBrief,
    job_title: str,
) -> str:
    """Return a single tailored opening interview question."""
    ensure_configured()

    prompt = (
        f"{_profile_digest(user, job_title)}\n\n{_company_digest(brief)}\n\n"
        "Now write the opening question."
    )

    model = genai.GenerativeModel(
        GEMINI_FLASH_MODEL,
        system_instruction=_SYSTEM_INSTRUCTION,
    )
    response = await model.generate_content_async(
        prompt,
        generation_config={"temperature": 0.5},
        request_options={"timeout": 60},
    )
    return _strip_wrapping_quotes(response.text)
