"""
Self-Assessment & Growth opening-question prompts — the Self-Assessment & Growth
question type (the 4th and final type in the taxonomy).

Sibling of `_star_opening_prompts.py` / `_motivation_fit_opening_prompts.py`,
scoped to the **Self-Assessment & Growth** question category (greatest
strength/weakness, biggest failure, feedback received, "how would your teammates
describe you", "what are you working on improving right now"). Unlike STAR these
questions do NOT ask for a single past story in STAR form — they probe how
clearly the candidate sees themselves and whether they act on that self-knowledge.

Per `self_assess_growth_implementation.md` this type is **level-DOMINANT and
industry-LIGHT**, so this module is deliberately **field-independent** (like M&F's
opening pool) and the EXPERIENCE LEVEL is the PRIMARY driver of the question:

  - internship / entry  → coachability (seek-receive-implement feedback);
  - mid / senior        → applied learning agility (extract the lesson and reuse it);
  - staff / executive   → the failure/weakness question is the most diagnostic
                          question in the interview, scored for owning failure at
                          scale without externalizing blame.

The field axis does NOT enter question generation at all (it lives only in the
evaluator's per-field "load-bearing competency" line). There is NO experience
MATRIX (no field×level / archetype×level grid, no generated module) — the level
driver is a hand-written 6-entry dict, mirroring situational's hand-written
`_ESCALATION_FLIP_LEVEL_ANCHOR`.

**Probe-type rotation (load-bearing).** Eurich's research splits self-awareness
into two uncorrelated kinds: INTERNAL (how clearly you see your own values,
strengths, weaknesses, impact) and EXTERNAL (understanding how others view you).
"What's your greatest weakness" probes internal; "how would your teammates
describe you" probes external and demands the candidate cite others' actual words.
To keep both equally likely, each call randomly injects ONE probe type with an
example pool for THAT type only. The chosen type is NOT threaded to the evaluator
— the evaluator infers it from the answer and carries both anchors.

Source-of-truth markdown: `backend/prompts/self_assessment_opening_question_prompts.md`.
Keep that file and this module in sync.
"""

from __future__ import annotations

import random

from app.db.models.enums import ExperienceLevel


# Human-readable labels for the experience-level driver note (a touch friendlier
# than the raw enum values, e.g. "entry-level" not "entry").
_LEVEL_LABEL: dict[ExperienceLevel, str] = {
    ExperienceLevel.internship: "internship",
    ExperienceLevel.entry: "entry-level",
    ExperienceLevel.mid: "mid-level",
    ExperienceLevel.senior: "senior",
    ExperienceLevel.staff: "staff",
    ExperienceLevel.executive: "executive",
}


_SELF_ASSESS_OPENING_INTRO = """\
You are an interview coach preparing a candidate for a SELF-ASSESSMENT & GROWTH question in a mock interview. Generate exactly ONE opening question.

Hard constraints:
- Output ONLY the question text — exactly ONE sentence, no preamble, markdown, or surrounding quotes.
- Ideally 12-22 words. Never exceed 28 words.
- Natural, conversational phrasing a human interviewer would use.\
"""


# Self-assessment-specific form clause — the single hard constraint that defines
# the Self-Assessment & Growth shape. Kept separate from the (form-neutral) intro
# exactly as `_STAR_OPENING_FORM_CLAUSE` / `_MF_OPENING_FORM_CLAUSE` are.
_SELF_ASSESS_OPENING_FORM_CLAUSE = (
    "- A self-assessment / growth question — invites the candidate to assess "
    "themselves honestly: a genuine strength or weakness, a real failure or "
    "mistake, feedback they have received, how others would describe them, or "
    "what they are actively working to improve. A strong ANSWER makes a claim, "
    "grounds it in a concrete example, and points at what they took from it or "
    "are doing about it. It is NOT a 'tell me about a time…' STAR story question "
    "and NOT a motivation/fit question."
)


# The two probe types (Eurich's internal vs external self-awareness). Each carries
# its own example pool; ONE type is injected per call so both stay equally likely.
_INTERNAL_PROBE_GUIDANCE = (
    "Probe type for THIS question: INTERNAL self-awareness — how clearly the "
    "candidate sees their own strengths, weaknesses, failures, and what they are "
    "improving. Ask about the candidate's own view of themselves."
)
_INTERNAL_PROBE_EXAMPLES: list[str] = [
    "What would you say is your single greatest weakness, and how do you manage it?",
    "Tell me about the biggest failure or mistake of your career so far.",
    "What is a real weakness you're actively working to improve right now?",
    "What's one skill or habit you're deliberately trying to get better at these days?",
    "Where do you think you have the most room to grow professionally?",
    "Tell me about a time you realized you were wrong about something important.",
    "What's a strength of yours that you think is genuinely underrated?",
    "What part of your last role did you find hardest, and why?",
]

_EXTERNAL_PROBE_GUIDANCE = (
    "Probe type for THIS question: EXTERNAL self-awareness — whether the candidate "
    "knows how OTHERS see them. A strong answer cites what others have actually "
    "said (a manager's words, peer feedback, a 360), not just self-image with "
    "'my teammates would say' stapled on. Ask about others' view of the candidate."
)
_EXTERNAL_PROBE_EXAMPLES: list[str] = [
    "How would your teammates or manager describe you if I asked them right now?",
    "What's the most useful piece of feedback you've received, and what did you do with it?",
    "Tell me about a time you got critical feedback you didn't expect.",
    "What would your last manager say you most need to work on?",
    "What do people consistently come to you for on a team?",
    "Describe a piece of feedback that changed how you work.",
    "If your closest colleague were being honest, what would they say frustrates them about working with you?",
    "What's something a mentor or manager helped you see about yourself?",
]


# Experience level as the PRIMARY driver of the question (hand-written 6-entry
# dict — NOT a generated matrix). Describes the bar and which genres to lean on,
# leaving the probe-type rotation free to compose with it. Empty-omission when the
# level is unknown (legacy).
_LEVEL_QUESTION_DRIVER: dict[ExperienceLevel, str] = {
    ExperienceLevel.internship: (
        "This candidate is at the internship level, so COACHABILITY is what to "
        "probe: lean toward feedback-received and what-are-you-improving "
        "questions. The bar is whether they seek feedback, take it without "
        "defensiveness, and act on it. Coursework, clubs, and projects are "
        "legitimate material — do not expect a long professional track record."
    ),
    ExperienceLevel.entry: (
        "This candidate is at the entry level, so COACHABILITY is what to probe: "
        "lean toward feedback-received and what-are-you-improving questions. The "
        "bar is whether they seek feedback, take it non-defensively, and change "
        "something as a result. Coursework, internships, and projects are fully "
        "legitimate material."
    ),
    ExperienceLevel.mid: (
        "This candidate is at the mid level, so LEARNING AGILITY is what to probe: "
        "a weakness, failure, or feedback question where a strong answer extracts "
        "the lesson and shows it applied in a DIFFERENT later situation — not just "
        "'I took the feedback', but 'I took it and it changed how I handled the "
        "next thing.'"
    ),
    ExperienceLevel.senior: (
        "This candidate is at the senior level, so LEARNING AGILITY under real "
        "stakes is what to probe: a failure or weakness question where the strong "
        "answer extracts a transferable lesson and shows it reused. Expect "
        "ownership and a credible account of what changed afterward."
    ),
    ExperienceLevel.staff: (
        "This candidate is at the staff level, where the FAILURE / WEAKNESS "
        "question is the most diagnostic in the interview. Ask about a significant "
        "failure or a real limitation. The strong answer owns a failure at scale "
        "without externalizing blame and shows systems for hearing hard truths "
        "(soliciting dissent, 360s, someone who pushes back on them)."
    ),
    ExperienceLevel.executive: (
        "This candidate is at the executive level, where the FAILURE / WEAKNESS "
        "question is the most diagnostic in the interview and self-awareness tends "
        "to decay with power. Ask about a major failure or who struggles to work "
        "with them. The strong answer owns failure at scale without blaming market "
        "headwinds or uncooperative teams, and shows real mechanisms for external "
        "self-awareness."
    ),
}


def _probe_block(
    which: str,
    sampler: random.Random,
) -> tuple[str, str]:
    """Return the (guidance, examples-block) for one probe type.

    `which` is 'internal' or 'external'. Two example questions are sampled 2-of-N
    (the same anti-'fixed-attractor' rotation as the sibling builders).
    """
    if which == "external":
        guidance = _EXTERNAL_PROBE_GUIDANCE
        pool = _EXTERNAL_PROBE_EXAMPLES
    else:
        guidance = _INTERNAL_PROBE_GUIDANCE
        pool = _INTERNAL_PROBE_EXAMPLES
    sampled = sampler.sample(pool, 2) if len(pool) >= 2 else list(pool)
    examples_block = "\n".join(f"  - {e}" for e in sampled)
    return guidance, examples_block


def build_self_assessment_opening_prompt(
    experience_level: ExperienceLevel | None = None,
    rng: random.Random | None = None,
) -> str:
    """Assemble the per-call system prompt for a Self-Assessment & Growth opening.

    - Intro is the constant template (field-INDEPENDENT — no category), followed
      by the self-assessment form clause.
    - When `experience_level` is known it LEADS as the PRIMARY driver
      (coachability → learning-agility → derailment-aware failure focus); omitted
      when None (legacy).
    - A probe type (internal vs external self-awareness) is chosen at random and
      injected with an example pool for that type ONLY, so both kinds of
      self-awareness stay equally likely across sessions.
    - Two example questions are sampled per call (2-of-N rotation, mirroring the
      sibling builders) to break the "same question every time" attractor.

    `rng` is injectable so tests can pin both the probe-type choice and the sample
    deterministically; production callers pass `None`.
    """
    sampler = rng if rng is not None else random
    probe_which = sampler.choice(["internal", "external"])
    probe_guidance, examples_block = _probe_block(probe_which, sampler)

    intro = _SELF_ASSESS_OPENING_INTRO + "\n" + _SELF_ASSESS_OPENING_FORM_CLAUSE

    style_cues = (
        "Style cues (concrete shapes for this probe type — emulate the spirit, "
        f"not the wording):\n{examples_block}"
    )

    # Empty-omission: legacy (None) sessions keep the level-free prompt.
    if isinstance(experience_level, ExperienceLevel):
        level = _LEVEL_LABEL.get(experience_level, experience_level.value)
        driver = _LEVEL_QUESTION_DRIVER.get(experience_level, "")
        level_block = (
            "PRIMARY DRIVER — match the question's focus and bar to this "
            f"candidate's experience level ({level}). Let this dominate the "
            f"question you choose:\n{driver}"
        )
        return (
            f"{intro}\n\n"
            f"{level_block}\n\n"
            f"{probe_guidance}\n\n"
            f"{style_cues}"
        )

    return (
        f"{intro}\n\n"
        f"{probe_guidance}\n\n"
        f"{style_cues}"
    )
