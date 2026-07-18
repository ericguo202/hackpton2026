"""
Unit tests for the Motivation & Fit question type — archetype axis, opening
prompt, experience matrix, evaluator dispatch/remap/calibration-skip, and
follow-up dispatch. OpenRouter calls are mocked.
"""

import json
import random
from types import SimpleNamespace

import app.services.evaluator as ev
from app.db.models.enums import ExperienceLevel, QuestionCategory
from app.services import followup as fu
from app.services._archetypes import (
    ARCHETYPE_BY_FIELD,
    ARCHETYPE_PROFILES,
    Archetype,
    archetype_for,
)
from app.services._field_categories import FIELD_CATEGORIES
from app.services._motivation_fit_evaluator_rubric import (
    build_motivation_fit_system_instruction,
)
from app.services._motivation_fit_experience_prompts import (
    MF_EXPERIENCE_QUESTION_GUIDANCE,
    mf_experience_evaluator_block,
    mf_experience_question_block,
)
from app.services._motivation_fit_opening_prompts import (
    MF_EXAMPLES,
    build_motivation_fit_opening_prompt,
)
from app.services._score_dimensions import (
    content_dimension_labels,
    evaluator_json_keys,
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


# ── archetype axis ────────────────────────────────────────────────────────────


def test_every_field_maps_to_an_archetype():
    for c in FIELD_CATEGORIES:
        assert c in ARCHETYPE_BY_FIELD
        assert isinstance(ARCHETYPE_BY_FIELD[c], Archetype)


def test_every_archetype_has_a_profile():
    for a in Archetype:
        profile = ARCHETYPE_PROFILES[a]
        assert profile.evaluator_weighting
        assert profile.conviction_taboos
        assert profile.question_guidance


def test_archetype_mapping_matches_doc_groupings():
    assert archetype_for("Finance, Banking, and Private Capital") is Archetype.commitment_screened
    assert archetype_for("Legal, Compliance, and Advocacy") is Archetype.commitment_screened
    assert archetype_for("Healthcare and Life Sciences") is Archetype.mission_screened
    assert archetype_for("Technology, Product, and Design") is Archetype.values_codified
    assert archetype_for("Engineering (Non-Software)") is Archetype.values_codified
    assert archetype_for("Sales, Marketing, and Customer Functions") is Archetype.persuasion_demonstrated
    assert archetype_for("Startups and High-Growth Environments") is Archetype.environment_fit


def test_archetype_for_unknown_falls_back_to_default():
    # DEFAULT_CATEGORY (Tech) is values_codified.
    assert archetype_for(None) is Archetype.values_codified
    assert archetype_for("Not A Real Field") is Archetype.values_codified


# ── score-dimension identity ──────────────────────────────────────────────────


def test_evaluator_json_keys_per_category():
    assert evaluator_json_keys(QuestionCategory.experience_star)[0] == "structure"
    assert evaluator_json_keys(QuestionCategory.experience_star)[2] == "impact"
    mf = evaluator_json_keys(QuestionCategory.motivation_fit)
    assert mf == ("structure", "relevance", "company_insight", "career_narrative", "conviction")
    # Unknown/None → STAR fallback.
    assert evaluator_json_keys(None)[1] == "problem_solving"


def test_content_dimension_labels_per_category():
    assert content_dimension_labels(QuestionCategory.motivation_fit)[2] == "Company Insight"
    assert content_dimension_labels(QuestionCategory.experience_star)[1] == "Problem-solving"


# ── M&F opening prompt ────────────────────────────────────────────────────────


def test_mf_opening_prompt_has_form_clause_and_archetype():
    prompt = build_motivation_fit_opening_prompt(
        "Finance, Banking, and Private Capital",
        Archetype.commitment_screened,
        rng=random.Random(0),
    )
    assert "motivation / fit question" in prompt
    assert "retention-risk" in prompt  # archetype guidance
    assert "past-behavior story question" in prompt  # NOT a STAR story


def test_mf_opening_prompt_experience_leads_as_primary_driver():
    prompt = build_motivation_fit_opening_prompt(
        "Healthcare and Life Sciences",
        Archetype.mission_screened,
        experience_level=ExperienceLevel.entry,
        rng=random.Random(0),
    )
    assert "PRIMARY DRIVER" in prompt
    # The archetype x level experience block is present.
    assert "mission-screened field" in prompt


def test_mf_opening_prompt_samples_two_examples():
    prompt = build_motivation_fit_opening_prompt(
        "Technology, Product, and Design",
        Archetype.values_codified,
        rng=random.Random(1),
    )
    present = [e for e in MF_EXAMPLES if e in prompt]
    assert len(present) == 2


def test_mf_opening_prompt_deterministic_with_pinned_rng():
    a = build_motivation_fit_opening_prompt(
        "Technology, Product, and Design", Archetype.values_codified, rng=random.Random(42)
    )
    b = build_motivation_fit_opening_prompt(
        "Technology, Product, and Design", Archetype.values_codified, rng=random.Random(42)
    )
    assert a == b


# ── M&F experience matrix ─────────────────────────────────────────────────────


def test_mf_experience_matrix_is_complete():
    assert len(MF_EXPERIENCE_QUESTION_GUIDANCE) == len(Archetype) == 5
    for archetype in Archetype:
        assert len(MF_EXPERIENCE_QUESTION_GUIDANCE[archetype]) == len(ExperienceLevel) == 6


def test_mf_experience_blocks_empty_on_none():
    assert mf_experience_question_block(None, None) == ""
    assert mf_experience_evaluator_block(Archetype.mission_screened, None) == ""
    assert mf_experience_question_block(Archetype.mission_screened, ExperienceLevel.mid)


# ── M&F evaluator rubric ──────────────────────────────────────────────────────


def test_mf_system_instruction_has_all_layers():
    instr = build_motivation_fit_system_instruction(
        "Finance, Banking, and Private Capital", ExperienceLevel.entry
    )
    assert '"company_insight"' in instr  # M&F JSON keys
    assert "Commitment-screened" in instr  # archetype weighting
    assert "TABOOS" in instr  # conviction taboos
    assert "Company Insight by level" in instr  # level anchor
    assert "commitment-screened field" in instr  # experience block


async def test_evaluate_turn_mf_remaps_keys_and_skips_calibration(monkeypatch):
    mf_payload = {
        "structure": 7,
        "relevance": 6,
        "company_insight": 8,
        "career_narrative": 5,
        "conviction": 9,
        "feedback_detail": {
            "positive_moments": [],
            "main_takeaway": "Give one concrete company fact.",
            "improvement_moments": [],
            "quick_wins": ["Lead with a genuine reason.", "Add a specific fact."],
        },
        "notes": "ok",
    }
    monkeypatch.setattr(
        "app.services.evaluator.get_client",
        lambda: _make_fake_client(json.dumps(mf_payload)),
    )

    # A very short transcript would be capped hard under STAR calibration; the M&F
    # path must skip that so the model's scores survive.
    result = await ev.evaluate_turn(
        question="Why do you want to work here?",
        transcript="I really admire what you do.",
        category="Finance, Banking, and Private Capital",
        question_category=QuestionCategory.motivation_fit,
    )
    assert result.dimension_1 == 7
    assert result.dimension_2 == 6
    assert result.dimension_3 == 8   # would be <= 2 under STAR calibration
    assert result.dimension_4 == 5
    assert result.dimension_5 == 9


async def test_evaluate_turn_star_still_calibrates(monkeypatch):
    """Regression: the STAR path (default) still applies the evidence caps."""
    star_payload = {
        "structure": 5,
        "problem_solving": 5,
        "impact": 5,
        "initiative": 5,
        "depth": 5,
        "feedback_detail": {
            "positive_moments": [],
            "main_takeaway": "Add specifics.",
            "improvement_moments": [],
            "quick_wins": ["a", "b"],
        },
        "notes": "ok",
    }
    monkeypatch.setattr(
        "app.services.evaluator.get_client",
        lambda: _make_fake_client(json.dumps(star_payload)),
    )
    # 5-word transcript → STAR broad cap of 2 on every dimension.
    result = await ev.evaluate_turn(
        question="Tell me about a time.",
        transcript="It happened and was fine.",
    )
    assert result.dimension_3 <= 2


# ── M&F follow-up dispatch ────────────────────────────────────────────────────


def test_followup_selector_returns_distinct_sets():
    star = fu._followup_prompts(QuestionCategory.experience_star)
    mf = fu._followup_prompts(QuestionCategory.motivation_fit)
    assert star is not mf
    assert "MOTIVATION" in mf.system
    assert mf.probe_angles is fu._MF_PROBE_ANGLES


def test_followup_variety_block_uses_mf_pool():
    block = fu._render_variety_block(random.Random(0), QuestionCategory.motivation_fit)
    assert any(e in block for e in fu._MF_FOLLOWUP_EXAMPLES)


def test_followup_variety_block_defaults_to_star_pool():
    block = fu._render_variety_block(random.Random(0))
    assert any(e in block for e in fu._STAR_FOLLOWUP_EXAMPLES)


# ── M&F opening dispatch (end-to-end, company-centric assembly) ───────────────


def _fake_user():
    return SimpleNamespace(
        id="11111111-1111-1111-1111-111111111111",
        name="Eric",
        target_role="Analyst",
        industry="Finance",
        experience_level=ExperienceLevel.entry,
        short_bio="Aspiring investment banker.",
        resume_text="Finance club president; two banking internships.",
    )


async def test_generate_opening_question_mf_is_company_centric(monkeypatch):
    from app.services import opening_question as oq
    from app.services.company_research import CompanyBrief

    sink: dict = {}

    async def _create(**kwargs):
        sink.update(kwargs)
        return _fake_response("Why do you want to work at this firm specifically?")

    monkeypatch.setattr(
        oq,
        "get_client",
        lambda: SimpleNamespace(
            chat=SimpleNamespace(completions=SimpleNamespace(create=_create))
        ),
    )
    brief = CompanyBrief(
        description="Goldwell is an investment bank.",
        headlines=["Advised on a major merger"],
        values=["teamwork"],
        category="Finance, Banking, and Private Capital",
    )

    q = await oq.generate_opening_question(
        _fake_user(),
        brief,
        "Analyst",
        question_category=QuestionCategory.motivation_fit,
    )
    assert isinstance(q, str) and len(q) > 10

    user_msg = next(m["content"] for m in sink["messages"] if m["role"] == "user")
    system_msg = next(m["content"] for m in sink["messages"] if m["role"] == "system")
    # Company-centric: the company facts are surfaced (unlike STAR's standard style).
    assert "Goldwell is an investment bank." in user_msg
    assert "Ground the question in THIS company" in user_msg
    # No STAR standard/company style-rotation text leaks into the M&F prompt.
    assert "Do NOT mention the target" not in user_msg
    # The M&F system prompt drives the form.
    assert "MOTIVATION & FIT" in system_msg
