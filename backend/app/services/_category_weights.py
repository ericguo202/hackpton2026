"""
Question-category calibration weights (the "Recommended Mix" draw).

A calibrated ("Recommended Mix") session draws a *different* `QuestionCategory` at
each story-block **opening**, weighted by the candidate's experience level (the
primary axis) and their researched field category (the modifier axis), rather than
being locked to one type for the whole session.

This module is pure and self-contained (mirrors `_score_dimensions.py` /
`_archetypes.py`): a level baseline table + additive industry modifiers + a few
explicit overrides produce a normalized weight vector, and `draw_opening_category`
turns that vector into a concrete category with the two documented short-session
rules (turn-1 "tell me about yourself" M&F bias + within-session no-repeat).

Source of truth for the numbers: `question_category_calibration.md`.
"""

from __future__ import annotations

import random

from app.db.models.enums import ExperienceLevel, QuestionCategory
from app.services._field_categories import FieldCategory

# Short aliases for the four categories (in canonical position order:
# STAR / Motivation & Fit / Situational / Self-Assessment & Growth).
_STAR = QuestionCategory.experience_star
_MF = QuestionCategory.motivation_fit
_SIT = QuestionCategory.situational
_SAG = QuestionCategory.self_assessment_growth

_CATEGORIES: tuple[QuestionCategory, ...] = (_STAR, _MF, _SIT, _SAG)

# Probability the FIRST opening of a >2-turn Mix session is Motivation & Fit
# ("tell me about yourself" is near-universal as turn one). See rule (a).
P_FIRST_MF = 0.65

# When experience level is unknown, lean to the entry baseline (student-leaning
# target user base).
_DEFAULT_LEVEL = ExperienceLevel.entry

# Level baselines (before industry modifiers). Each row sums to 1.0.
_LEVEL_BASELINES: dict[ExperienceLevel, dict[QuestionCategory, float]] = {
    ExperienceLevel.internship: {_STAR: 0.20, _MF: 0.30, _SIT: 0.35, _SAG: 0.15},
    ExperienceLevel.entry: {_STAR: 0.25, _MF: 0.30, _SIT: 0.30, _SAG: 0.15},
    ExperienceLevel.mid: {_STAR: 0.45, _MF: 0.20, _SIT: 0.20, _SAG: 0.15},
    ExperienceLevel.senior: {_STAR: 0.50, _MF: 0.15, _SIT: 0.20, _SAG: 0.15},
    ExperienceLevel.staff: {_STAR: 0.45, _MF: 0.15, _SIT: 0.25, _SAG: 0.15},
    ExperienceLevel.executive: {_STAR: 0.40, _MF: 0.15, _SIT: 0.25, _SAG: 0.20},
}

# --- Field groups (the 15 FieldCategory literals bucketed for the modifier rules) ---
_MISSION_FIELDS: frozenset[FieldCategory] = frozenset(
    {
        "Nonprofit, NGO, and Social Impact",
        "Government and Public Sector",
        "Healthcare and Life Sciences",
        "Education and EdTech",
    }
)
_COMMITMENT_FIELDS: frozenset[FieldCategory] = frozenset(
    {
        "Finance, Banking, and Private Capital",
        "Consulting and Professional Services",
        "Legal, Compliance, and Advocacy",
    }
)
_STAR_HEAVY_FIELDS: frozenset[FieldCategory] = frozenset(
    {
        "Technology, Product, and Design",
        "Data, AI/ML, and Analytics",
        "Cybersecurity and Risk",
    }
)
_SALES_FIELDS: frozenset[FieldCategory] = frozenset(
    {"Sales, Marketing, and Customer Functions"}
)
_STARTUP_FIELDS: frozenset[FieldCategory] = frozenset(
    {"Startups and High-Growth Environments"}
)
_SITUATIONAL_HEAVY_FIELDS: frozenset[FieldCategory] = frozenset(
    {
        "Retail, Hospitality, and Service",
        "Operations, Supply Chain, and Manufacturing",
        "Engineering (Non-Software)",
    }
)

_HEALTHCARE: FieldCategory = "Healthcare and Life Sciences"
_GOVERNMENT: FieldCategory = "Government and Public Sector"
_RETAIL: FieldCategory = "Retail, Hospitality, and Service"

_EARLY_LEVELS: frozenset[ExperienceLevel] = frozenset(
    {ExperienceLevel.internship, ExperienceLevel.entry}
)

# Explicit override vectors that REPLACE the modifier path for specific cells.
_HEALTHCARE_EARLY_VECTOR: dict[QuestionCategory, float] = {
    _STAR: 0.15,
    _MF: 0.25,
    _SIT: 0.475,
    _SAG: 0.125,
}


def _normalize(weights: dict[QuestionCategory, float]) -> dict[QuestionCategory, float]:
    """Clamp negatives to 0 and renormalize to sum 1 (uniform on all-zero)."""
    clamped = {cat: max(0.0, weights.get(cat, 0.0)) for cat in _CATEGORIES}
    total = sum(clamped.values())
    if total <= 0.0:
        return {cat: 1.0 / len(_CATEGORIES) for cat in _CATEGORIES}
    return {cat: value / total for cat, value in clamped.items()}


def category_weights(
    field: FieldCategory | None,
    level: ExperienceLevel | None,
) -> dict[QuestionCategory, float]:
    """Return the normalized draw weights for a (field, level) pair.

    Level is the primary axis (baseline); field applies additive point modifiers
    and a few explicit overrides. `level is None` -> entry baseline; `field is
    None` -> no industry modifier.
    """
    resolved_level = level if isinstance(level, ExperienceLevel) else _DEFAULT_LEVEL

    # Override: Healthcare at internship/entry is a full explicit vector.
    if field == _HEALTHCARE and resolved_level in _EARLY_LEVELS:
        return _normalize(dict(_HEALTHCARE_EARLY_VECTOR))

    weights = dict(_LEVEL_BASELINES[resolved_level])

    if field is not None:
        # Group modifiers (points, pre-normalize).
        if field in _MISSION_FIELDS:
            weights[_MF] += 0.10
        if field in _COMMITMENT_FIELDS:
            if resolved_level in _EARLY_LEVELS:
                weights[_MF] += 0.10
            weights[_SIT] -= 0.05
        if field in _STAR_HEAVY_FIELDS:
            weights[_STAR] += 0.05
        if field in _SALES_FIELDS:
            weights[_MF] += 0.05
            weights[_SIT] += 0.05
        if field in _STARTUP_FIELDS and resolved_level in (
            ExperienceLevel.internship,
            ExperienceLevel.entry,
            ExperienceLevel.mid,
        ):
            weights[_MF] += 0.05
            weights[_SAG] += 0.05
        if field in _SITUATIONAL_HEAVY_FIELDS:
            weights[_SIT] += 0.05

        # Large override modifiers (applied on top of the group modifiers above).
        if field == _GOVERNMENT and resolved_level != ExperienceLevel.executive:
            # Government through Staff: heavy situational tilt.
            weights[_SIT] += 0.125
        if field == _RETAIL and resolved_level in _EARLY_LEVELS:
            weights[_SIT] += 0.15

    return _normalize(weights)


def _weighted_choice(
    weights: dict[QuestionCategory, float],
    rng: random.Random | None,
) -> QuestionCategory:
    """Draw one category from a (already restricted) weight map."""
    normalized = _normalize(weights)
    categories = list(normalized.keys())
    chances = [normalized[cat] for cat in categories]
    picker = rng if rng is not None else random
    return picker.choices(categories, weights=chances, k=1)[0]


def draw_opening_category(
    field: FieldCategory | None,
    level: ExperienceLevel | None,
    num_turns: int,
    used: set[QuestionCategory] | frozenset[QuestionCategory],
    is_first_opening: bool,
    rng: random.Random | None = None,
) -> QuestionCategory:
    """Draw a question category for one story-block opening.

    Rules (from `question_category_calibration.md`):
      (a) turn-1 M&F bias: the FIRST opening of a >2-turn session is Motivation &
          Fit with probability `P_FIRST_MF` ("tell me about yourself" convention).
      (b) 2-turn exception: a single-opening session applies the weights
          immediately (no bias).
      (c) without replacement: never repeat a category already used by this
          session's openings (renormalize over what's left).
    """
    picker = rng if rng is not None else random

    # Rule (a)/(b): turn-1 M&F bias only for multi-opening (>2-turn) sessions.
    if (
        is_first_opening
        and num_turns > 2
        and _MF not in used
        and picker.random() < P_FIRST_MF
    ):
        return _MF

    weights = category_weights(field, level)

    # Rule (c): restrict to unused categories; fall back to the full vector only if
    # every category is exhausted (unreachable at <=4 openings).
    remaining = {cat: w for cat, w in weights.items() if cat not in used}
    if not remaining:
        remaining = weights

    return _weighted_choice(remaining, rng)
