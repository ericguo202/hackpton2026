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
  - `CATEGORY_SUBTITLES` / `CATEGORY_COACHING_TIPS` — the same Scoring page's
    per-category `subtitle` and `tips`, for the general-mode Ask-Tutor
    `get_rubric` tool. The page's tips are JSX (several embed `<Cite>` research
    links), so they CANNOT be imported — these are hand-mirrored, with the
    citation links dropped and the prose transliterated to plain ASCII. Keep the
    two in sync.

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

# One-line description of what each question category ASKS, mirroring the
# Scoring page's per-category `subtitle`. ASCII-transliterated, same rationale as
# CONTENT_DIMENSION_DESCRIPTIONS above.
CATEGORY_SUBTITLES: dict[QuestionCategory, str] = {
    QuestionCategory.experience_star: (
        '"Tell me about a time..." - questions about what you actually did.'
    ),
    QuestionCategory.self_assessment_growth: (
        "Strengths and weaknesses, biggest failure, feedback you've received."
    ),
    QuestionCategory.motivation_fit: (
        '"Tell me about yourself," "why this company," "why this field."'
    ),
    QuestionCategory.situational: (
        '"What would you do if..." - hypotheticals that test your reasoning '
        "before you have lived the situation."
    ),
}

# The Scoring page's per-category coaching `tips` - what a strong answer of this
# type actually does. Hand-mirrored from the JSX (research citation links
# dropped, typographic characters flattened to ASCII). Consumed by the
# general-mode Ask-Tutor `get_rubric` tool so the coach answers "how do I get
# better at this question type" in the same words the candidate can go read.
CATEGORY_COACHING_TIPS: dict[QuestionCategory, tuple[str, ...]] = {
    QuestionCategory.experience_star: (
        "Spend the least time on setup and the most on what you did.",
        'Say "I," not only "we." Credit your team, but be precise about which '
        "decision or action was yours.",
        "Be specific - give a few concrete details that prove you were actually "
        "there.",
        "Name trade-offs you considered and alternatives you rejected, and why, "
        "to show critical thinking.",
        "Numbers (a percentage or a count) beat adjectives. Top companies grade "
        "whether the scope of your impact matches your level.",
        "Close out strong - connect the result to your action: interviewers "
        "listen for whether your contribution caused the outcome.",
    ),
    QuestionCategory.self_assessment_growth: (
        "One trait, well-evidenced, beats a list of five.",
        "Name a real, role-relevant weakness a manager would recognize. Skip the "
        "cliches and the strengths-in-disguise - interviewers assess honesty, "
        "and disguised strengths read as evasive.",
        "Know how others see you - it can differ from how you see yourself. "
        "Quote feedback you have actually received.",
        "Anchor each claim to a specific incident - when, what you did, what was "
        "said.",
        "A growth mindset is good but not enough. Describe the mechanism - a "
        "habit, a system, a feedback loop - then the change it produced.",
        "Own your part plainly, without blaming circumstances. Do not claim a "
        'weakness is fully "fixed"; show it is managed.',
    ),
    QuestionCategory.motivation_fit: (
        "Select the two or three high-impact experiences from your resume "
        "specific to your target role.",
        'Make the connection out loud. "I did X, which is why I can do this '
        "role's Y\" is much stronger than just \"I did X.\"",
        "Cite something specific and accurate - a product, a documented value, a "
        "recent move - and link it to your own motivation. Employers screen "
        "candidates against the specific skills and values they have published.",
        "Research the company and your role at the company. Generic praise "
        '("great culture") comes off as unprepared.',
        "Explain career transitions. Interviewers test your stated motivation "
        "against choices you have actually made.",
        "Be enthusiastic, but attach your enthusiasm to at least one specific "
        "motivator: what you would want to work on first, why this team, why "
        "now.",
    ),
    QuestionCategory.situational: (
        "Commit to a decision. Playing both sides without ever choosing comes "
        "off as evasive.",
        "Acknowledge the trade-off - what your choice costs, who it affects, and "
        "what could go wrong downstream.",
        'Say the "why" behind the "what." Justifying why the rejected option '
        "lost is the fastest way to show judgment rather than reflex.",
        "Give a concrete first step based on your experience level and the "
        "information you are given. Do not assume authority, resources, or facts "
        "the scenario did not provide.",
        'Ground decisions in prior experience - "I would do X, because when Y '
        'happened, Z worked." Recruiters discount purely theoretical answers '
        "when you have real experience to draw on - and if you are early-career, "
        "coursework, clubs, and projects count fully.",
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


def category_subtitle(category: QuestionCategory | None) -> str:
    """Return the one-line "what this type asks" subtitle (STAR fallback)."""
    return CATEGORY_SUBTITLES.get(category or _DEFAULT, CATEGORY_SUBTITLES[_DEFAULT])


def category_coaching_tips(category: QuestionCategory | None) -> tuple[str, ...]:
    """Return the Scoring page's coaching tips for `category` (STAR fallback)."""
    return CATEGORY_COACHING_TIPS.get(
        category or _DEFAULT, CATEGORY_COACHING_TIPS[_DEFAULT]
    )
