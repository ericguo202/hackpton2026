"""
Motivation & Fit **archetype** axis (M&F-ONLY).

Research indicates Motivation & Fit questions barely change across industries;
what changes is *which rubric dimension is decisive* and *what counts as a
disqualifying answer*. So the 15 field categories collapse into **5 archetypes**
for the Motivation & Fit question type — a fourth prompt fragment layered on top
of field + experience level (see `motivation_fit_implementation.md`).

The archetype conditions two things:
  1. the M&F question generator (e.g. Archetype A intern/entry sessions sometimes
     ask "why this industry" rather than only "why this company"); and
  2. the M&F evaluator's dimension WEIGHTING and the Conviction TABOO anchors
     (the clearest documented insta-fail signals).

**This axis is Motivation & Fit specific — it does NOT carry over to STAR** (or
the other question types). The mapping below is the fixed 15→5 map from the
implementation doc.
"""

from __future__ import annotations

import enum
from dataclasses import dataclass

from app.services._field_categories import (
    DEFAULT_CATEGORY,
    FIELD_CATEGORIES,
    FieldCategory,
)


class Archetype(str, enum.Enum):
    """The five Motivation & Fit fit-culture archetypes."""

    commitment_screened = "commitment_screened"   # A
    mission_screened = "mission_screened"          # B
    values_codified = "values_codified"            # C
    persuasion_demonstrated = "persuasion_demonstrated"  # D
    environment_fit = "environment_fit"            # E


@dataclass(frozen=True)
class ArchetypeProfile:
    """The prompt fragments an archetype contributes to the M&F stack."""

    label: str
    # Injected into the M&F opening-question generator: what this archetype's
    # fit questions probe and how to slant them.
    question_guidance: str
    # Injected into the M&F evaluator: which of the five content dimensions are
    # decisive for this archetype (steers weighting, not the rubric definitions).
    evaluator_weighting: str
    # Low-anchor Conviction taboos — the documented insta-fail framings. Rendered
    # as scoring guidance so the evaluator drops Conviction hard when they appear.
    conviction_taboos: str


ARCHETYPE_PROFILES: dict[Archetype, ArchetypeProfile] = {
    Archetype.commitment_screened: ArchetypeProfile(
        label="Commitment-screened",
        question_guidance=(
            "These firms treat fit questions as retention-risk screens: they want "
            "proof the candidate's expectations match the reality of the job and "
            "career path, because turnover is expensive. Favor questions that "
            "surface genuine, specific homework (people they've spoken to, deals or "
            "cases they've followed, relevant courses) and that test coherence — "
            "\"does wanting this make sense given who they are?\". Treat \"why this "
            "INDUSTRY\" and \"why this FIRM\" as distinct questions, and lean toward "
            "\"why this industry / why not the adjacent one (consulting vs. banking "
            "vs. PE vs. trading)\" for internship / entry candidates who are choosing "
            "a career path."
        ),
        evaluator_weighting=(
            "ARCHETYPE — Commitment-screened (finance / consulting / legal): "
            "Career Narrative and Company Insight are the DECISIVE dimensions. The "
            "strongest answers prove they did real homework and that this choice is "
            "coherent with their history; reward specific evidence of research over "
            "generic enthusiasm."
        ),
        conviction_taboos=(
            "Conviction TABOOS for this archetype (drop Conviction to the 0-3 band "
            "when present): naming exit opportunities / \"a stepping stone\" as the "
            "main reason for wanting the job; framing motivation around compensation, "
            "prestige, or brand-name polish. These read as opportunistic, not "
            "committed."
        ),
    ),
    Archetype.mission_screened: ArchetypeProfile(
        label="Mission-screened",
        question_guidance=(
            "Here mission passion is the PRIMARY screen, not a nice-to-have. Favor "
            "questions that draw out a personal connection to this organization's "
            "cause and values in particular, and that invite a realistic picture of "
            "the work — its stressors and emotional toll, not only its rewards. A "
            "personal catalyst story (a formative service or lived experience) is the "
            "expected narrative shape for this archetype."
        ),
        evaluator_weighting=(
            "ARCHETYPE — Mission-screened (government / healthcare / nonprofit / "
            "education): Conviction (genuine, values-driven motivation) is the "
            "DECISIVE dimension. Reward a credible personal connection to the mission "
            "and awareness of the role's real demands; a purely transactional answer "
            "fails here even if polished."
        ),
        conviction_taboos=(
            "Conviction TABOOS for this archetype (drop Conviction to the 0-3 band "
            "when present): mercenary or purely transactional framing (pay, hours, "
            "resume value) with no connection to the mission; enthusiasm that could "
            "apply to any employer and shows no engagement with THIS cause."
        ),
    ),
    Archetype.values_codified: ArchetypeProfile(
        label="Values-codified corporate",
        question_guidance=(
            "Big-tech fit questions screen for PUBLISHED, NAMED values (e.g. Amazon's "
            "Leadership Principles). The company-specificity requirement is explicit: "
            "a \"why this company\" answer must be about THIS company's actual values, "
            "mission, and products — not a generic pitch. Favor questions that ask the "
            "candidate to connect their own motivation to a specific, documented value "
            "or product of the company."
        ),
        evaluator_weighting=(
            "ARCHETYPE — Values-codified corporate (tech / data / cybersecurity / "
            "engineering): Company Insight is graded HARDEST here and against the "
            "researched company brief — for these firms the brief's role values are "
            "close to the literal documented scoring criteria. A correct-but-generic "
            "\"great culture\" answer caps Company Insight in the mid band; specific, "
            "accurate alignment with the brief's values scores highest."
        ),
        conviction_taboos=(
            "Conviction TABOOS for this archetype (drop Conviction to the 0-3 band "
            "when present): scripted flattery with no specific company particular; "
            "interest that names no concrete product, value, or initiative of THIS "
            "company."
        ),
    ),
    Archetype.persuasion_demonstrated: ArchetypeProfile(
        label="Persuasion-demonstrated",
        question_guidance=(
            "For customer-facing roles the answer is itself a WORK SAMPLE — the "
            "candidate is expected to sell themselves as the best candidate. Favor "
            "questions that give them room to make a persuasive, evidence-backed case "
            "for why they fit and want the role."
        ),
        evaluator_weighting=(
            "ARCHETYPE — Persuasion-demonstrated (sales / marketing / customer): the "
            "answer's OWN persuasiveness feeds Conviction — reward a compelling, "
            "structured, benefit-led case (the reasoning behind wanting the role), "
            "not just stated enthusiasm. Money motivation is acknowledged as real but "
            "insufficient alone; the modern preference is motivation rooted in helping "
            "buyers, not only earning commission."
        ),
        conviction_taboos=(
            "Conviction TABOOS for this archetype (drop Conviction to the 0-3 band "
            "when present): money / commission as the SOLE stated motivation with no "
            "reasoning behind the decision; a flat, unpersuasive pitch that does not "
            "make a case for the candidate."
        ),
    ),
    Archetype.environment_fit: ArchetypeProfile(
        label="Environment-fit",
        question_guidance=(
            "Here fit questions probe tolerance for the OPERATING ENVIRONMENT rather "
            "than a mission or a specific firm: ability to work collaboratively, "
            "operate autonomously, accept ownership, and embrace ambiguity. Favor "
            "questions that surface what actually motivates the individual and how "
            "they handle a fast-changing, high-ownership environment. Even a little "
            "homework (having looked at the website/product) signals initiative here."
        ),
        evaluator_weighting=(
            "ARCHETYPE — Environment-fit (startups / operations / retail): "
            "motivation-REALISM about the operating environment is decisive. Reward "
            "self-aware answers about thriving under autonomy, ownership, and "
            "ambiguity; treat a stated need for stability and structure as "
            "disqualifying for fit."
        ),
        conviction_taboos=(
            "Conviction TABOOS for this archetype (drop Conviction to the 0-3 band "
            "when present): framing motivation around wanting stability, structure, "
            "predictability, or a slow pace; expecting a fixed, narrowly-scoped role."
        ),
    ),
}


# Fixed 15→5 field→archetype map (from the implementation doc). Fields with thin
# direct evidence are mapped to their nearest archetype rather than inventing
# unsupported criteria (Legal → A; Engineering (Non-Software) → C; Ops & Retail → E).
ARCHETYPE_BY_FIELD: dict[FieldCategory, Archetype] = {
    "Finance, Banking, and Private Capital": Archetype.commitment_screened,
    "Consulting and Professional Services": Archetype.commitment_screened,
    "Legal, Compliance, and Advocacy": Archetype.commitment_screened,
    "Government and Public Sector": Archetype.mission_screened,
    "Healthcare and Life Sciences": Archetype.mission_screened,
    "Nonprofit, NGO, and Social Impact": Archetype.mission_screened,
    "Education and EdTech": Archetype.mission_screened,
    "Data, AI/ML, and Analytics": Archetype.values_codified,
    "Cybersecurity and Risk": Archetype.values_codified,
    "Technology, Product, and Design": Archetype.values_codified,
    "Engineering (Non-Software)": Archetype.values_codified,
    "Sales, Marketing, and Customer Functions": Archetype.persuasion_demonstrated,
    "Operations, Supply Chain, and Manufacturing": Archetype.environment_fit,
    "Retail, Hospitality, and Service": Archetype.environment_fit,
    "Startups and High-Growth Environments": Archetype.environment_fit,
}


# Fail-loud completeness guard (mirrors `_star_evaluator_rubric.INDUSTRY_GUIDANCE`):
# every FieldCategory must map to an archetype, and every archetype must have a
# profile, else importing this module raises instead of silently degrading M&F
# tailoring at request time.
_missing_fields = [c for c in FIELD_CATEGORIES if c not in ARCHETYPE_BY_FIELD]
if _missing_fields:
    raise RuntimeError(
        f"ARCHETYPE_BY_FIELD is missing entries for: {_missing_fields}. "
        "Every FieldCategory must map to an Archetype."
    )
_missing_profiles = [a for a in Archetype if a not in ARCHETYPE_PROFILES]
if _missing_profiles:
    raise RuntimeError(
        f"ARCHETYPE_PROFILES is missing entries for: {_missing_profiles}."
    )


# The archetype of the default field — used when the resolved category is unknown.
_DEFAULT_ARCHETYPE = ARCHETYPE_BY_FIELD[DEFAULT_CATEGORY]


def archetype_for(category: FieldCategory | None) -> Archetype:
    """Resolve the Motivation & Fit archetype for a field category.

    Unknown / None categories fall back to the default field's archetype, the
    same DEFAULT_CATEGORY fallback posture used by the opening/evaluator builders.
    """
    if category is None:
        return _DEFAULT_ARCHETYPE
    return ARCHETYPE_BY_FIELD.get(category, _DEFAULT_ARCHETYPE)


def archetype_profile(category: FieldCategory | None) -> ArchetypeProfile:
    """Resolve the full archetype profile (fragments) for a field category."""
    return ARCHETYPE_PROFILES[archetype_for(category)]
