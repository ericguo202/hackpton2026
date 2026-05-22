"""
Opening-question generator.

Produces a single tailored behavioral-interview question that references both
the candidate's profile (resume + declared target role/industry/bio) and the
company brief produced by `company_research.research_company()`. Runs on
`google/gemini-2.5-flash` via OpenRouter.

The system prompt is selected from `_field_prompts.FIELD_PROMPTS` based on
`brief.category` — a 15-bucket field/industry classification produced by
the research agent — so questions get field-appropriate tone and example
shapes (e.g. healthcare prompts are empathetic, ops/manufacturing prompts
reference Lean/Six Sigma, etc.).

Output is plain text — no JSON — so we skip JSON mode and the client-side
extractor. The prompt still constrains the model to a single question, and
we strip any wrapping quotes defensively.
"""

from __future__ import annotations

import logging
import random

from app.db.models.user import User
from app.services._field_prompts import DEFAULT_CATEGORY, FIELD_PROMPTS
from app.services._openrouter import get_client
from app.services.company_research import CompanyBrief

logger = logging.getLogger(__name__)

OPENING_MODEL = "google/gemini-2.5-flash"
_RESUME_CHAR_LIMIT = 1500


# Two distinct styles we rotate between so the demo doesn't feel like
# "every question namedrops the company". Roughly 50/50 keeps the mix
# recognizable without needing stateful tracking across sessions.
_STYLE_STANDARD = (
    "STYLE: Classic behavioral question. Do NOT mention the target "
    "company or its recent activity. Focus on the candidate's experience "
    "such as background information listed in their short bio or resume, "
    "level and domain (e.g. teamwork, conflict, failure, ownership, "
    "ambiguity, learning). Examples of shape: 'Tell me about a time you "
    "...', 'Describe a situation where ...', 'Walk me through how you ...'."
)
_STYLE_COMPANY = (
    "STYLE: Lightly company-flavored. You MAY reference ONE concrete "
    "thing about the target company (a product area, a stated value, or "
    "a recent initiative) as a gentle hook — but the question itself is "
    "still a standard behavioral prompt about the candidate's past "
    "experience. Do not quiz them on the company."
)


def _profile_digest(user: User, job_title: str) -> str:
    resume_excerpt = (user.resume_text or "")[:_RESUME_CHAR_LIMIT]
    return (
        f"Candidate: \n"
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
    """Return a single opening interview question — standard or company-flavored."""
    client = get_client()

    system_prompt = FIELD_PROMPTS.get(brief.category) or FIELD_PROMPTS[DEFAULT_CATEGORY]

    style = random.choice([_STYLE_STANDARD, _STYLE_COMPANY])
    prompt = (
        f"{_profile_digest(user, job_title)}\n\n"
        f"{_company_digest(brief)}\n\n"
        f"{style}\n\n"
        "Now write the opening question."
    )

    response = await client.chat.completions.create(
        model=OPENING_MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt},
        ],
        temperature=0.7,
        timeout=60.0,
    )
    text = response.choices[0].message.content or ""
    return _strip_wrapping_quotes(text)
