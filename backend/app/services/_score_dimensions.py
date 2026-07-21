"""
Per-question-category identity of the five generic content score dimensions.

The five content score columns on `interview_turns` are generic
(`dimension_1..5_score`, migration 0026); what each position MEANS depends on the
turn's `QuestionCategory`. Two per-category, position-ordered tuples live here:

  - `EVALUATOR_JSON_KEYS` — the semantic keys the evaluator LLM emits in its JSON
    (kept semantic so the model scores accurately). `evaluator.evaluate_turn`
    remaps these onto `dimension_1..5` before validating `EvaluatorOutput`.
  - `CONTENT_DIMENSION_LABELS` — the human display labels (used by the Ask-Tutor
    context; the frontend mirror is `src/lib/scoreDimensions.ts`
    `SCORE_DIMENSIONS_BY_CATEGORY`). Keep the two in sync.
  - `CONTENT_DIMENSION_DESCRIPTIONS` — one minimal line per dimension, lifted
    VERBATIM from the public Scoring page's `dimensionBlurbs`
    (`frontend/src/pages/Scoring.tsx` `CATEGORY_CONTENT`). Used by the Ask-Tutor
    prompt so the model explains a score against the same rubric wording the
    candidate can read on the site. Keep the two in sync.

`QUESTION_CATEGORY_LABELS` (mirror of the frontend `types/session.ts` map) names
the category itself, for surfaces that print the type rather than a dimension.

Position 1 is Structure for every type. `delivery` is the shared 6th dimension
and is NOT part of these five content slots. Unknown / future categories fall
back to the STAR ordering via the resolver helpers, mirroring the DEFAULT_CATEGORY
fallbacks elsewhere in the codebase.
"""

from __future__ import annotations

from app.db.models.enums import QuestionCategory

# Ordered semantic JSON keys the evaluator prompt emits, per question category.
# Index i (0-based) maps to `dimension_{i+1}`.
EVALUATOR_JSON_KEYS: dict[QuestionCategory, tuple[str, str, str, str, str]] = {
    QuestionCategory.experience_star: (
        "structure",
        "problem_solving",
        "impact",
        "initiative",
        "depth",
    ),
    QuestionCategory.self_assessment_growth: (
        "structure",
        "self_awareness",
        "growth",
        "candor",
        "evidence",
    ),
    QuestionCategory.motivation_fit: (
        "structure",
        "relevance",
        "company_insight",
        "career_narrative",
        "conviction",
    ),
    QuestionCategory.situational: (
        "structure",
        "reasoning",
        "principles",
        "practicality",
        "evidence",
    ),
}

# Ordered human display labels, per question category (mirror of the frontend
# canonical list). Index i maps to `dimension_{i+1}`.
CONTENT_DIMENSION_LABELS: dict[QuestionCategory, tuple[str, str, str, str, str]] = {
    QuestionCategory.experience_star: (
        "Structure",
        "Problem-solving",
        "Impact",
        "Initiative",
        "Depth",
    ),
    QuestionCategory.self_assessment_growth: (
        "Structure",
        "Self-Awareness",
        "Growth",
        "Candor",
        "Evidence",
    ),
    QuestionCategory.motivation_fit: (
        "Structure",
        "Relevance",
        "Company Insight",
        "Career Narrative",
        "Conviction",
    ),
    QuestionCategory.situational: (
        "Structure",
        "Reasoning",
        "Principles",
        "Practicality",
        "Evidence",
    ),
}

# Shared 6th dimension label (all categories).
DELIVERY_LABEL = "Delivery"

# Human display labels for the question category itself (mirror of the frontend
# `types/session.QUESTION_CATEGORY_LABELS`; the `recommended_mix` picker sentinel
# is excluded — it is never stamped on a turn).
QUESTION_CATEGORY_LABELS: dict[QuestionCategory, str] = {
    QuestionCategory.experience_star: "Experience (STAR)",
    QuestionCategory.self_assessment_growth: "Self-Assessment & Growth",
    QuestionCategory.motivation_fit: "Motivation & Fit",
    QuestionCategory.situational: "Situational",
}

# One minimal description per content dimension, position-aligned with
# CONTENT_DIMENSION_LABELS. Taken from the Scoring page's `dimensionBlurbs` so
# the tutor grades against the wording the candidate reads, but transliterated to
# plain ASCII — the page's typographic characters (curly quotes, em dashes, →,
# accents) buy nothing in a prompt and only invite encoding noise.
CONTENT_DIMENSION_DESCRIPTIONS: dict[
    QuestionCategory, tuple[str, str, str, str, str]
] = {
    QuestionCategory.experience_star: (
        "A clear arc: situation, your actions, the result.",
        "The reasoning behind your choices is visible.",
        "The story closes with a result someone could measure.",
        "You owned the move rather than watching it happen.",
        "Specifics over generalities.",
    ),
    QuestionCategory.self_assessment_growth: (
        "Claim -> concrete example -> what it means, answered on the trait "
        "actually asked about.",
        "An honest, specific read on yourself.",
        "Concrete steps you've taken to improve, with signs of progress.",
        "You own real shortcomings without self-sabotage.",
        "Every trait claim is backed by a concrete moment.",
    ),
    QuestionCategory.motivation_fit: (
        "A deliberate arc (for 'tell me about yourself', present -> past -> "
        "future) rather than a resume recitation.",
        "Your background maps to this role's actual requirements.",
        "Evidence you've done your homework.",
        "Your story hangs together.",
        "Specific, genuine enthusiasm in what you say.",
    ),
    QuestionCategory.situational: (
        "Clarify the situation -> weigh options -> decide -> justify.",
        "The soundness of the approach you chose.",
        "Your decision is grounded in stated reasoning and values.",
        "Your answer is realistic under the scenario's constraints.",
        "You tie the hypothetical back to something real.",
    ),
}

_DEFAULT = QuestionCategory.experience_star


def evaluator_json_keys(
    category: QuestionCategory | None,
) -> tuple[str, str, str, str, str]:
    """Return the ordered semantic score keys for `category` (STAR fallback)."""
    return EVALUATOR_JSON_KEYS.get(category or _DEFAULT, EVALUATOR_JSON_KEYS[_DEFAULT])


def content_dimension_labels(
    category: QuestionCategory | None,
) -> tuple[str, str, str, str, str]:
    """Return the ordered human labels for `category` (STAR fallback)."""
    return CONTENT_DIMENSION_LABELS.get(
        category or _DEFAULT, CONTENT_DIMENSION_LABELS[_DEFAULT]
    )


def content_dimension_descriptions(
    category: QuestionCategory | None,
) -> tuple[str, str, str, str, str]:
    """Return the ordered rubric descriptions for `category` (STAR fallback)."""
    return CONTENT_DIMENSION_DESCRIPTIONS.get(
        category or _DEFAULT, CONTENT_DIMENSION_DESCRIPTIONS[_DEFAULT]
    )


def question_category_label(category: QuestionCategory | None) -> str:
    """Return the human name of the question category itself (STAR fallback)."""
    return QUESTION_CATEGORY_LABELS.get(
        category or _DEFAULT, QUESTION_CATEGORY_LABELS[_DEFAULT]
    )
