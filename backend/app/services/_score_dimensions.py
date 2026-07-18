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
