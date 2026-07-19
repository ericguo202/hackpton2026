"""
Unit tests for the Self-Assessment & Growth question type — opening prompt
(field-INDEPENDENT, level-DOMINANT primary driver, internal/external probe-type
rotation), evaluator dispatch/remap/calibration-skip + growth level anchor +
per-field load-bearing-competency line, the résumé→Evidence injection gate,
follow-up dispatch, and score-dimension identity. OpenRouter calls are mocked.
"""

import json
import random
from types import SimpleNamespace

import app.services.evaluator as ev
from app.db.models.enums import ExperienceLevel, QuestionCategory
from app.services import followup as fu
from app.services._field_categories import DEFAULT_CATEGORY, FIELD_CATEGORIES
from app.services._score_dimensions import (
    content_dimension_labels,
    evaluator_json_keys,
)
from app.services._self_assessment_evaluator_rubric import (
    SELF_ASSESSMENT_INDUSTRY_GUIDANCE,
    build_self_assessment_system_instruction,
)
from app.services._self_assessment_opening_prompts import (
    _EXTERNAL_PROBE_EXAMPLES,
    _INTERNAL_PROBE_EXAMPLES,
    build_self_assessment_opening_prompt,
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


def test_self_assessment_evaluator_json_keys():
    keys = evaluator_json_keys(QuestionCategory.self_assessment_growth)
    assert keys == ("structure", "self_awareness", "growth", "candor", "evidence")


def test_self_assessment_content_dimension_labels():
    labels = content_dimension_labels(QuestionCategory.self_assessment_growth)
    assert labels == ("Structure", "Self-Awareness", "Growth", "Candor", "Evidence")


# ── opening prompt ────────────────────────────────────────────────────────────


def test_self_assessment_opening_prompt_has_form_clause():
    prompt = build_self_assessment_opening_prompt(rng=random.Random(0))
    assert "SELF-ASSESSMENT & GROWTH" in prompt
    assert "assess themselves honestly" in prompt
    assert "tell me about a time" in prompt.lower()  # explicitly excluded (STAR)


def test_self_assessment_opening_prompt_level_is_primary_driver():
    prompt = build_self_assessment_opening_prompt(
        experience_level=ExperienceLevel.internship, rng=random.Random(0)
    )
    assert "PRIMARY DRIVER" in prompt
    assert "internship level" in prompt
    assert "COACHABILITY" in prompt


def test_self_assessment_opening_prompt_executive_is_derailment_aware():
    prompt = build_self_assessment_opening_prompt(
        experience_level=ExperienceLevel.executive, rng=random.Random(0)
    )
    assert "PRIMARY DRIVER" in prompt
    assert "FAILURE / WEAKNESS" in prompt


def test_self_assessment_opening_prompt_omits_level_when_none():
    prompt = build_self_assessment_opening_prompt(rng=random.Random(0))
    assert "PRIMARY DRIVER" not in prompt


def test_self_assessment_opening_prompt_rotates_probe_type():
    # Across many seeds both probe types must appear (rotation isn't stuck).
    internal_seen = external_seen = False
    for seed in range(30):
        p = build_self_assessment_opening_prompt(rng=random.Random(seed))
        if "INTERNAL self-awareness" in p:
            internal_seen = True
        if "EXTERNAL self-awareness" in p:
            external_seen = True
    assert internal_seen and external_seen


def test_self_assessment_opening_prompt_injects_matching_examples():
    # The injected example pool matches the chosen probe type only.
    for seed in range(20):
        p = build_self_assessment_opening_prompt(rng=random.Random(seed))
        if "INTERNAL self-awareness" in p:
            present = [e for e in _INTERNAL_PROBE_EXAMPLES if e in p]
            assert len(present) == 2
            assert not any(e in p for e in _EXTERNAL_PROBE_EXAMPLES)
        else:
            present = [e for e in _EXTERNAL_PROBE_EXAMPLES if e in p]
            assert len(present) == 2
            assert not any(e in p for e in _INTERNAL_PROBE_EXAMPLES)


def test_self_assessment_opening_prompt_deterministic_with_pinned_rng():
    a = build_self_assessment_opening_prompt(
        experience_level=ExperienceLevel.mid, rng=random.Random(42)
    )
    b = build_self_assessment_opening_prompt(
        experience_level=ExperienceLevel.mid, rng=random.Random(42)
    )
    assert a == b


# ── evaluator rubric ──────────────────────────────────────────────────────────


def test_self_assessment_industry_guidance_complete():
    assert set(SELF_ASSESSMENT_INDUSTRY_GUIDANCE) == set(FIELD_CATEGORIES)


def test_self_assessment_system_instruction_has_layers_and_level_anchor():
    instr = build_self_assessment_system_instruction(
        "Healthcare and Life Sciences", ExperienceLevel.executive
    )
    # self-assessment semantic keys
    assert '"self_awareness"' in instr and '"candor"' in instr
    # internal vs external judgment
    assert "INTERNAL self-awareness" in instr and "EXTERNAL self-awareness" in instr
    # field competency line (healthcare gets the richer safety overlay)
    assert "load-bearing competenc" in instr.lower()
    assert "safety" in instr.lower()
    # level anchor
    assert "Experience-level calibration" in instr


def test_self_assessment_level_anchor_inverts_by_level():
    entry = build_self_assessment_system_instruction(
        "Startups and High-Growth Environments", ExperienceLevel.entry
    )
    execu = build_self_assessment_system_instruction(
        "Startups and High-Growth Environments", ExperienceLevel.executive
    )
    assert "COACHABILITY" in entry  # three-verb coachability guide at entry
    assert "blame-externalization" in execu  # derailment low anchor at exec


def test_self_assessment_system_instruction_omits_anchor_when_no_level():
    instr = build_self_assessment_system_instruction("Government and Public Sector")
    assert "Experience-level calibration" not in instr


def test_self_assessment_system_instruction_unknown_field_falls_back():
    instr = build_self_assessment_system_instruction("Not A Real Field")
    default = build_self_assessment_system_instruction(DEFAULT_CATEGORY)
    assert instr == default


def test_self_assessment_resume_rules_present():
    instr = build_self_assessment_system_instruction("Legal, Compliance, and Advocacy")
    assert "candidate_resume" in instr
    assert "ABSENCE of a résumé must NEVER" in instr
    assert "resume_mismatch" in instr


# ── evaluate_turn remap + calibration skip ────────────────────────────────────


async def test_evaluate_turn_self_assessment_remaps_and_skips_calibration(monkeypatch):
    payload = {
        "structure": 8,
        "self_awareness": 9,
        "growth": 7,
        "candor": 8,
        "evidence": 6,
        "feedback_detail": {
            "positive_moments": [],
            "main_takeaway": "Name the concrete step you took.",
            "improvement_moments": [],
            "quick_wins": ["Own it plainly.", "Add the fix you made."],
        },
        "notes": "ok",
    }
    monkeypatch.setattr(
        "app.services.evaluator.get_client",
        lambda: _make_fake_client(json.dumps(payload)),
    )
    # A short, metric-free self-assessment would be capped hard under STAR
    # calibration; the self-assessment path must skip that so scores survive.
    result = await ev.evaluate_turn(
        question="What's your greatest weakness?",
        transcript="I tend to over-commit; I've started blocking focus time to fix it.",
        category="Technology, Product, and Design",
        question_category=QuestionCategory.self_assessment_growth,
    )
    assert result.dimension_1 == 8
    assert result.dimension_2 == 9   # would be capped under STAR calibration
    assert result.dimension_3 == 7
    assert result.dimension_4 == 8
    assert result.dimension_5 == 6


async def test_evaluate_turn_self_assessment_accepts_new_issue_types(monkeypatch):
    payload = {
        "structure": 3,
        "self_awareness": 2,
        "growth": 2,
        "candor": 4,
        "evidence": 2,
        "feedback_detail": {
            "positive_moments": [],
            "main_takeaway": "That reads like a canned non-weakness.",
            "improvement_moments": [
                {
                    "transcript_snippet": "I'm a perfectionist",
                    "issue_type": "cliche_weakness",
                    "why_this_weakened": "It's a rehearsed non-answer.",
                    "how_to_strengthen": "Name a real weakness with a concrete example.",
                }
            ],
            "quick_wins": ["Pick a real weakness.", "Add the fix."],
        },
        "notes": "ok",
    }
    monkeypatch.setattr(
        "app.services.evaluator.get_client",
        lambda: _make_fake_client(json.dumps(payload)),
    )
    result = await ev.evaluate_turn(
        question="What's your greatest weakness?",
        transcript="Honestly, I'm a perfectionist, I just care too much.",
        category="Consulting and Professional Services",
        question_category=QuestionCategory.self_assessment_growth,
    )
    assert (
        result.feedback_detail.improvement_moments[0].issue_type == "cliche_weakness"
    )


# ── résumé → Evidence injection gate ──────────────────────────────────────────


def test_build_prompt_injects_resume_when_present():
    prompt = ev._build_prompt(
        "What's your greatest weakness?",
        "I tend to over-commit.",
        None,
        resume_excerpt="B.S. Computer Science, Rutgers University; SWE intern at Acme.",
    )
    assert "<candidate_resume>" in prompt
    assert "Rutgers University" in prompt


def test_build_prompt_omits_resume_when_absent():
    prompt = ev._build_prompt(
        "What's your greatest weakness?", "I tend to over-commit.", None
    )
    assert "<candidate_resume>" not in prompt


async def test_evaluate_turn_sends_resume_only_for_self_assessment(monkeypatch):
    def _payload(*keys: str) -> dict:
        p = {k: 5 for k in keys}
        p["feedback_detail"] = {
            "positive_moments": [], "main_takeaway": "ok",
            "improvement_moments": [], "quick_wins": ["a", "b"],
        }
        p["notes"] = "ok"
        return p

    sa_payload = _payload(
        "structure", "self_awareness", "growth", "candor", "evidence"
    )
    star_payload = _payload(
        "structure", "problem_solving", "impact", "initiative", "depth"
    )
    sink: dict = {}
    # The response is keyed to whichever question_category the call passes; the
    # opening user message is captured regardless.
    responses = iter([json.dumps(sa_payload), json.dumps(star_payload)])

    async def _create(**kwargs):
        sink.update(kwargs)
        return _fake_response(next(responses))

    monkeypatch.setattr(
        "app.services.evaluator.get_client",
        lambda: SimpleNamespace(
            chat=SimpleNamespace(completions=SimpleNamespace(create=_create))
        ),
    )

    # Self-assessment → the résumé rides in the user prompt.
    await ev.evaluate_turn(
        question="What's your greatest weakness?",
        transcript="I over-commit.",
        category="Technology, Product, and Design",
        question_category=QuestionCategory.self_assessment_growth,
        resume_excerpt="Rutgers University; SWE intern at Acme.",
    )
    sa_user = next(m["content"] for m in sink["messages"] if m["role"] == "user")
    assert "<candidate_resume>" in sa_user and "Rutgers" in sa_user

    # STAR → the same résumé is ignored (never injected).
    await ev.evaluate_turn(
        question="Tell me about a time you led a project.",
        transcript="I led a migration to a new system.",
        category="Technology, Product, and Design",
        question_category=QuestionCategory.experience_star,
        resume_excerpt="Rutgers University; SWE intern at Acme.",
    )
    star_user = next(m["content"] for m in sink["messages"] if m["role"] == "user")
    assert "<candidate_resume>" not in star_user


# ── follow-up dispatch ────────────────────────────────────────────────────────


def test_followup_selector_returns_self_assessment_set():
    star = fu._followup_prompts(QuestionCategory.experience_star)
    sa = fu._followup_prompts(QuestionCategory.self_assessment_growth)
    assert star is not sa
    assert sa is fu._SELF_ASSESS_FOLLOWUP_PROMPTS
    assert "SELF-ASSESSMENT & GROWTH" in sa.system
    assert "EVIDENCE" in sa.system  # the evidence-demand genre
    assert sa.probe_angles is fu._SELF_ASSESS_PROBE_ANGLES


def test_followup_variety_block_uses_self_assessment_pool():
    block = fu._render_variety_block(
        random.Random(0), QuestionCategory.self_assessment_growth
    )
    assert any(e in block for e in fu._SELF_ASSESS_FOLLOWUP_EXAMPLES)


# ── opening dispatch (profile-centric, no company facts) ──────────────────────


def _fake_user():
    return SimpleNamespace(
        id="11111111-1111-1111-1111-111111111111",
        name="Eric",
        target_role="Software Engineer",
        industry="Technology",
        experience_level=ExperienceLevel.entry,
        short_bio="Aspiring backend engineer.",
        resume_text="B.S. CS, Rutgers; SWE intern at Acme.",
        recent_opening_questions=[],
    )


async def test_generate_opening_question_self_assessment_is_profile_centric(monkeypatch):
    from app.services import opening_question as oq
    from app.services.company_research import CompanyBrief

    sink: dict = {}

    async def _create(**kwargs):
        sink.update(kwargs)
        return _fake_response("What's a real weakness you're actively working on?")

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
        values=["patient safety first"],
        category="Technology, Product, and Design",
    )

    q = await oq.generate_opening_question(
        _fake_user(),
        brief,
        "Software Engineer",
        question_category=QuestionCategory.self_assessment_growth,
    )
    assert isinstance(q, str) and len(q) > 10

    user_msg = next(m["content"] for m in sink["messages"] if m["role"] == "user")
    system_msg = next(m["content"] for m in sink["messages"] if m["role"] == "system")
    # Profile-centric: the candidate résumé is present…
    assert "Rutgers" in user_msg
    # …but the company facts are NOT surfaced (self-assessment isn't about the company).
    assert "Mercy Health" not in user_msg
    assert "trauma center" not in user_msg
    # The self-assessment system prompt drives the form + level primary driver.
    assert "SELF-ASSESSMENT & GROWTH" in system_msg
    assert "PRIMARY DRIVER" in system_msg  # entry-level candidate
