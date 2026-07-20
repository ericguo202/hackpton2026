"""
Unit tests for the Situational (Hypothetical) question type — opening prompt
(field-keyed, dilemma requirement, no level driver), evaluator dispatch/remap/
calibration-skip + escalation-flip level anchor, follow-up dispatch, score-
dimension identity, and the company_research situational variant. OpenRouter
calls are mocked.
"""

import json
import random
from types import SimpleNamespace

import app.services.evaluator as ev
from app.db.models.enums import ExperienceLevel, QuestionCategory
from app.services import company_research as cr
from app.services import followup as fu
from app.services._field_categories import DEFAULT_CATEGORY, FIELD_CATEGORIES
from app.services._score_dimensions import (
    content_dimension_labels,
    evaluator_json_keys,
)
from app.services._situational_evaluator_rubric import (
    SITUATIONAL_INDUSTRY_GUIDANCE,
    build_situational_system_instruction,
)
from app.services._situational_opening_prompts import (
    SITUATIONAL_FIELD_EXAMPLES,
    SITUATIONAL_FIELD_SCENARIOS,
    build_situational_opening_prompt,
)


def _fake_response(text: str) -> SimpleNamespace:
    return SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=text))]
    )


def _make_fake_client(text: str):
    async def _create(**kwargs):
        return _fake_response(text)

    return SimpleNamespace(
        chat=SimpleNamespace(completions=SimpleNamespace(create=_create))
    )


# ── score-dimension identity ──────────────────────────────────────────────────


def test_situational_evaluator_json_keys():
    keys = evaluator_json_keys(QuestionCategory.situational)
    assert keys == ("structure", "reasoning", "principles", "practicality", "evidence")


def test_situational_content_dimension_labels():
    labels = content_dimension_labels(QuestionCategory.situational)
    assert labels == ("Structure", "Reasoning", "Principles", "Practicality", "Evidence")


# ── opening prompt ────────────────────────────────────────────────────────────


def test_situational_field_dicts_are_complete():
    assert set(SITUATIONAL_FIELD_SCENARIOS) == set(FIELD_CATEGORIES)
    assert set(SITUATIONAL_FIELD_EXAMPLES) == set(FIELD_CATEGORIES)
    for c in FIELD_CATEGORIES:
        assert len(SITUATIONAL_FIELD_SCENARIOS[c]) == 5
        assert len(SITUATIONAL_FIELD_EXAMPLES[c]) >= 2


def test_situational_opening_prompt_has_dilemma_form_clause():
    prompt = build_situational_opening_prompt(
        "Healthcare and Life Sciences", rng=random.Random(0)
    )
    assert "SITUATIONAL" in prompt
    assert "DILEMMA" in prompt  # load-bearing dilemma requirement
    assert "mutually exclusive courses of action" in prompt
    assert "tell me about a time" in prompt.lower()  # explicitly excluded


def test_situational_opening_prompt_has_no_experience_primary_driver():
    # Situational question generation is field-DRIVEN — unlike STAR/M&F there is
    # no "PRIMARY DRIVER" experience block even when a level is supplied.
    prompt = build_situational_opening_prompt(
        "Finance, Banking, and Private Capital",
        experience_level=ExperienceLevel.entry,
        rng=random.Random(0),
    )
    assert "PRIMARY DRIVER" not in prompt


def test_situational_opening_prompt_adds_level_fit_note():
    prompt = build_situational_opening_prompt(
        "Finance, Banking, and Private Capital",
        experience_level=ExperienceLevel.internship,
        rng=random.Random(0),
    )
    assert "Experience-level fit" in prompt
    assert "internship level" in prompt
    assert "subordinate" in prompt  # the concrete guard example


def test_situational_opening_prompt_omits_level_note_when_none():
    prompt = build_situational_opening_prompt(
        "Finance, Banking, and Private Capital", rng=random.Random(0)
    )
    assert "Experience-level fit" not in prompt


def test_situational_opening_prompt_samples_two_examples():
    prompt = build_situational_opening_prompt(
        "Technology, Product, and Design", rng=random.Random(1)
    )
    present = [
        e for e in SITUATIONAL_FIELD_EXAMPLES["Technology, Product, and Design"]
        if e in prompt
    ]
    assert len(present) == 2


def test_situational_opening_prompt_deterministic_with_pinned_rng():
    a = build_situational_opening_prompt("Cybersecurity and Risk", rng=random.Random(42))
    b = build_situational_opening_prompt("Cybersecurity and Risk", rng=random.Random(42))
    assert a == b


def test_situational_opening_prompt_unknown_field_falls_back():
    # An unknown category resolves to DEFAULT_CATEGORY's pools rather than raising.
    prompt = build_situational_opening_prompt("Not A Real Field", rng=random.Random(0))
    present = [
        e for e in SITUATIONAL_FIELD_EXAMPLES[DEFAULT_CATEGORY] if e in prompt
    ]
    assert len(present) == 2


# ── evaluator rubric ──────────────────────────────────────────────────────────


def test_situational_industry_guidance_complete():
    assert set(SITUATIONAL_INDUSTRY_GUIDANCE) == set(FIELD_CATEGORIES)


def test_situational_system_instruction_has_layers_and_escalation_flip():
    instr = build_situational_system_instruction(
        "Healthcare and Life Sciences", ExperienceLevel.executive
    )
    assert '"reasoning"' in instr and '"principles"' in instr  # situational keys
    assert "bioethics" in instr  # field guidance
    assert "escalation flip" in instr.lower()  # level anchor section
    assert "escalation point" in instr  # executive anchor text


def test_situational_escalation_flip_inverts_by_level():
    intern = build_situational_system_instruction(
        "Government and Public Sector", ExperienceLevel.internship
    )
    execu = build_situational_system_instruction(
        "Government and Public Sector", ExperienceLevel.executive
    )
    assert "HIGH anchor" in intern  # escalating is a strength for an intern
    assert "LOW anchor" in execu  # deferring upward is a weakness for an exec


def test_situational_system_instruction_omits_anchor_when_no_level():
    instr = build_situational_system_instruction("Government and Public Sector")
    assert "escalation flip" not in instr.lower()


async def test_evaluate_turn_situational_remaps_keys_and_skips_calibration(monkeypatch):
    payload = {
        "structure": 8,
        "reasoning": 7,
        "principles": 9,
        "practicality": 6,
        "evidence": 5,
        "feedback_detail": {
            "positive_moments": [],
            "main_takeaway": "Commit to a decision sooner.",
            "improvement_moments": [],
            "quick_wins": ["Name the trade-off.", "Actually decide."],
        },
        "notes": "ok",
    }
    monkeypatch.setattr(
        "app.services.evaluator.get_client",
        lambda: _make_fake_client(json.dumps(payload)),
    )
    # A short, metric-free hypothetical answer would be capped hard under STAR
    # calibration; the situational path must skip that so scores survive.
    result = await ev.evaluate_turn(
        question="Your teammate misses a blocking deadline — what do you do?",
        transcript="I would talk to them first, then flag it to my manager.",
        category="Technology, Product, and Design",
        question_category=QuestionCategory.situational,
    )
    assert result.dimension_1 == 8
    assert result.dimension_2 == 7
    assert result.dimension_3 == 9   # would be capped under STAR calibration
    assert result.dimension_4 == 6
    assert result.dimension_5 == 5


async def test_evaluate_turn_situational_accepts_new_issue_types(monkeypatch):
    payload = {
        "structure": 3,
        "reasoning": 4,
        "principles": 2,
        "practicality": 3,
        "evidence": 2,
        "feedback_detail": {
            "positive_moments": [],
            "main_takeaway": "You never committed to a course of action.",
            "improvement_moments": [
                {
                    "transcript_snippet": "I guess it depends",
                    "issue_type": "no_decision",
                    "why_this_weakened": "You weighed options but never chose.",
                    "how_to_strengthen": "State the call plainly.",
                }
            ],
            "quick_wins": ["Commit to a decision.", "Name the principle."],
        },
        "notes": "ok",
    }
    monkeypatch.setattr(
        "app.services.evaluator.get_client",
        lambda: _make_fake_client(json.dumps(payload)),
    )
    result = await ev.evaluate_turn(
        question="What would you do?",
        transcript="I guess it depends on the situation, hard to say.",
        category="Consulting and Professional Services",
        question_category=QuestionCategory.situational,
    )
    assert result.feedback_detail.improvement_moments[0].issue_type == "no_decision"


# ── follow-up dispatch ────────────────────────────────────────────────────────


def test_followup_selector_returns_situational_set():
    star = fu._followup_prompts(QuestionCategory.experience_star)
    sit = fu._followup_prompts(QuestionCategory.situational)
    assert star is not sit
    assert sit is fu._SITUATIONAL_FOLLOWUP_PROMPTS
    assert "SITUATIONAL" in sit.system
    assert sit.probe_angles is fu._SITUATIONAL_PROBE_ANGLES


def test_followup_variety_block_uses_situational_pool():
    block = fu._render_variety_block(random.Random(0), QuestionCategory.situational)
    assert any(e in block for e in fu._SITUATIONAL_FOLLOWUP_EXAMPLES)


# ── opening dispatch (end-to-end, scenario-centric assembly) ──────────────────


def _fake_user():
    return SimpleNamespace(
        id="11111111-1111-1111-1111-111111111111",
        name="Eric",
        target_role="Nurse",
        industry="Healthcare",
        experience_level=ExperienceLevel.entry,
        short_bio="Aspiring registered nurse.",
        resume_text="Clinical rotations; patient-care volunteering.",
    )


async def test_generate_opening_question_situational_assembly(monkeypatch):
    from app.services import opening_question as oq
    from app.services.company_research import CompanyBrief

    sink: dict = {}

    async def _create(**kwargs):
        sink.update(kwargs)
        return _fake_response(
            "A competent patient refuses urgent care — how do you weigh their "
            "autonomy against their safety, and what do you do?"
        )

    monkeypatch.setattr(
        oq,
        "get_client",
        lambda: SimpleNamespace(
            chat=SimpleNamespace(completions=SimpleNamespace(create=_create))
        ),
    )
    brief = CompanyBrief(
        description="Mercy Health is a hospital system.",
        headlines=["Opened a new trauma center"],
        values=["patient safety first", "compassion"],
        category="Healthcare and Life Sciences",
    )

    q = await oq.generate_opening_question(
        _fake_user(),
        brief,
        "Nurse",
        question_category=QuestionCategory.situational,
    )
    assert isinstance(q, str) and len(q) > 10

    user_msg = next(m["content"] for m in sink["messages"] if m["role"] == "user")
    system_msg = next(m["content"] for m in sink["messages"] if m["role"] == "system")
    # Scenario-centric: the company principles/values are surfaced for grounding.
    assert "patient safety first" in user_msg
    assert "GENUINE" in user_msg and "TENSION" in user_msg
    # The situational system prompt drives the form (dilemma requirement).
    assert "DILEMMA" in system_msg


# ── company_research situational variant ──────────────────────────────────────


def test_research_selects_situational_instruction():
    sc = QuestionCategory.situational
    assert cr._serper_system_instruction(sc) is cr._SITUATIONAL_SYSTEM_INSTRUCTION
    assert cr._jd_system_instruction(sc) is cr._SITUATIONAL_JD_SYSTEM_INSTRUCTION
    # The situational variant seeks principles + situational themes.
    assert "principles" in cr._SITUATIONAL_SYSTEM_INSTRUCTION.lower()
    assert "SCENARIO / DILEMMA" in cr._SITUATIONAL_SYSTEM_INSTRUCTION


def test_research_star_and_mf_use_behavioral_instruction():
    # No regression: non-situational types keep the byte-identical behavioral block.
    assert cr._serper_system_instruction(QuestionCategory.experience_star) is cr._SYSTEM_INSTRUCTION
    assert cr._serper_system_instruction(QuestionCategory.motivation_fit) is cr._SYSTEM_INSTRUCTION
    assert cr._jd_system_instruction(QuestionCategory.experience_star) is cr._JD_SYSTEM_INSTRUCTION
