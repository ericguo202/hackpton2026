"""
Motivation & Fit opening-question prompts — the Motivation & Fit question type.

Sibling of `_star_opening_prompts.py`, scoped to the **Motivation & Fit**
question category ("why this company", "why this role", "tell me about
yourself", career goals, "why this industry", environment/values fit). Unlike
STAR, these questions do NOT ask for a single past story in STAR form — they
probe self-presentation, motivation, and fit, and they are company-centric.

Research shows Motivation & Fit questions barely change across industries; what
changes is the fit-culture ARCHETYPE (see `_archetypes.py`) and the experience
level. So this module is deliberately **field-independent** at the example/theme
level: a single shared pool of M&F question shapes, conditioned per call by the
archetype's question guidance and (as the PRIMARY driver) the archetype x level
experience block.

The system prompt is assembled per-call by `build_motivation_fit_opening_prompt`:
  1. A shared intro template + the M&F form clause (`_MF_OPENING_FORM_CLAUSE`).
  2. The archetype's question guidance (what this archetype's fit questions
     probe and how to slant them).
  3. When the experience level is known, the archetype x level experience block
     leads as the PRIMARY driver (mirrors the STAR builder), with the M&F theme
     catalog demoted to background; otherwise the themes stay primary.
  4. Two example questions sampled at random from `MF_EXAMPLES` (2-of-N, the
     same anti-"fixed-attractor" rotation as `_star_opening_prompts`).

Source-of-truth markdown: `backend/prompts/motivation_fit_opening_question_prompts.md`.
Keep that file and this module in sync.
"""

from __future__ import annotations

import random

from app.db.models.enums import ExperienceLevel
from app.services._archetypes import Archetype, archetype_profile
from app.services._field_categories import FieldCategory


_MF_OPENING_INTRO_TEMPLATE = """\
You are an interview coach preparing a candidate for a MOTIVATION & FIT question in a mock interview for a role in the field/industry of {category}. Generate exactly ONE opening question.

Hard constraints:
- Output ONLY the question text — exactly ONE sentence, no preamble, markdown, or surrounding quotes.
- Ideally 15-25 words. Never exceed 30 words.
- Natural, conversational phrasing a human interviewer would use.\
"""


# M&F-specific form clause — the single hard constraint that defines the
# Motivation & Fit shape. Kept separate from the (question-form-neutral) intro
# template exactly as `_STAR_OPENING_FORM_CLAUSE` is, so the two builders share
# the same structure and only their form clause differs.
_MF_OPENING_FORM_CLAUSE = (
    "- A motivation / fit question — invites the candidate to explain their "
    "motivation, self-presentation, or fit (e.g. why this company, why this "
    "role, tell me about yourself, career goals, why this field, or the "
    "environment they thrive in). It is NOT a 'tell me about a time…' "
    "past-behavior story question."
)


# Field-independent Motivation & Fit theme catalog (the breadth of what these
# questions can probe). Shown in full so the model knows the bucket; the
# archetype guidance and experience block steer which theme fits this candidate.
MF_THEMES: list[str] = [
    "self-presentation — a concise 'tell me about yourself' pointed at this role",
    "why this role in particular (and what they'd want to work on first)",
    "why this company in particular (specific products, values, or mission)",
    "why this field / industry (the career-path choice)",
    "career goals and trajectory — how this role fits where they're heading",
    "preferred work environment and what personally motivates them",
    "values / mission alignment with the organization",
]


# Shared pool of M&F question shapes. 2 are sampled per call (the same 2-of-N
# rotation as `_star_opening_prompts.STAR_FIELD_EXAMPLES`) so successive openings
# don't converge on one attractor. Field-independent by design.
MF_EXAMPLES: list[str] = [
    "To start, tell me a little about yourself and what brought you to this point.",
    "Why are you interested in this particular role right now?",
    "Why do you want to work at this company specifically?",
    "What draws you to this field in the first place?",
    "Where do you hope to be a few years from now, and how does this role fit that?",
    "What kind of work environment helps you do your best work?",
    "What matters most to you in your next role?",
    "What about what we do here resonates with you personally?",
    "Walk me through what has motivated the moves you've made so far.",
    "Of all the directions you could take, why this one?",
    "What do you already know about us, and why does it interest you?",
    "What are you hoping to grow into if you join us?",
]


def build_motivation_fit_opening_prompt(
    category: FieldCategory,
    archetype: Archetype,
    experience_level: ExperienceLevel | None = None,
    rng: random.Random | None = None,
) -> str:
    """Assemble the per-call system prompt for a Motivation & Fit opening question.

    - Intro is the constant template with the category name substituted,
      followed by the M&F form clause.
    - The archetype's question guidance conditions what the fit question probes.
    - When `experience_level` is known, the archetype x level experience block
      (from `_motivation_fit_experience_prompts`) leads as the PRIMARY driver and
      the M&F themes are demoted to background (mirrors the STAR builder). When
      it's None (legacy users) the themes stay primary and the block is omitted.
    - Two example shapes are sampled at random per call (2-of-N rotation).

    `rng` is injectable so tests can pin the sample deterministically; production
    callers pass `None` for fresh randomness per call.
    """
    # Lazy import to avoid any import cycle, mirroring the STAR builder's lazy
    # import of `_experience_prompts`.
    from app.services._motivation_fit_experience_prompts import (
        mf_experience_question_block,
    )

    profile = archetype_profile(category)
    sampler = rng if rng is not None else random
    sampled = sampler.sample(MF_EXAMPLES, 2) if len(MF_EXAMPLES) >= 2 else list(MF_EXAMPLES)

    intro = (
        _MF_OPENING_INTRO_TEMPLATE.format(category=category)
        + "\n"
        + _MF_OPENING_FORM_CLAUSE
    )
    themes_block = "\n".join(f"  - {t}" for t in MF_THEMES)
    examples_block = "\n".join(f"  - {e}" for e in sampled)
    style_cues = (
        "Style cues (concrete shapes — emulate the spirit, not the wording):\n"
        f"{examples_block}"
    )
    archetype_block = (
        "Fit-culture archetype (how this field screens Motivation & Fit — let "
        f"this shape what the question probes):\n{profile.question_guidance}"
    )

    experience_block = mf_experience_question_block(archetype, experience_level)
    if experience_block:
        # Experience-level path: seniority guidance is the PRIMARY driver and the
        # M&F themes are demoted to background — same discipline as the STAR
        # builder so an intern and an executive get differently-calibrated
        # motivation/fit questions.
        return (
            f"{intro}\n\n"
            f"{archetype_block}\n\n"
            "PRIMARY DRIVER — match the question's focus, scope, and bar to this "
            "candidate's experience level. Let this dominate the question you "
            f"choose:\n{experience_block}\n\n"
            "Motivation & Fit breadth (BACKGROUND only — what these questions can "
            "probe). Stay on-type, but do NOT choose a theme that ignores or "
            f"contradicts the experience-level focus above:\n{themes_block}\n\n"
            f"{style_cues}"
        )

    # Legacy path (no experience level): themes stay primary.
    return (
        f"{intro}\n\n"
        f"{archetype_block}\n\n"
        "These Motivation & Fit questions probe the following themes (use this as "
        "the breadth of what you can probe — do NOT limit yourself to the two "
        f"examples below):\n{themes_block}\n\n"
        f"{style_cues}"
    )
