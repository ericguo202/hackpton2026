"""
Unit tests for opening_question — OpenRouter call mocked.
"""

import random
from types import SimpleNamespace

import pytest

from app.db.models.enums import ExperienceLevel
from app.services._field_prompts import (
    DEFAULT_CATEGORY,
    FIELD_EXAMPLES,
    FIELD_THEMES,
    build_field_system_prompt,
)
from app.services.company_research import CompanyBrief
from app.services.opening_question import (
    _company_digest,
    _recent_questions_block,
    _strip_wrapping_quotes,
    generate_opening_question,
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


def _make_capturing_client(text: str, sink: dict):
    """Fake client that records the kwargs (incl. messages) of the call."""
    async def _create(**kwargs):
        sink.update(kwargs)
        return _fake_response(text)

    return SimpleNamespace(
        chat=SimpleNamespace(completions=SimpleNamespace(create=_create))
    )


def _user_prompt(sink: dict) -> str:
    return next(m["content"] for m in sink["messages"] if m["role"] == "user")


def _fake_user():
    return SimpleNamespace(
        name="Eric",
        target_role="Backend Engineer",
        industry="AI Infrastructure",
        experience_level=ExperienceLevel.mid,
        short_bio="4 years on data platforms.",
        resume_text="Led a team that shipped an LLM eval harness processing 10k reqs/s.",
    )


def _fake_brief(**overrides):
    base = dict(
        description="Anthropic builds frontier AI systems focused on safety.",
        headlines=["Claude 4.6 released", "Expanded enterprise Claude Code tier"],
        values=["helpful, harmless, honest"],
    )
    base.update(overrides)
    return CompanyBrief(**base)


async def test_generate_opening_question_returns_plain_string(monkeypatch):
    monkeypatch.setattr(
        "app.services.opening_question.get_client",
        lambda: _make_fake_client(
            "Tell me about a time you designed an evaluation system under "
            "safety constraints, and how you'd approach similar tradeoffs "
            "at Anthropic."
        ),
    )

    q = await generate_opening_question(
        _fake_user(), _fake_brief(), "Applied AI Engineer"
    )

    assert isinstance(q, str)
    assert len(q) > 20
    assert not q.startswith('"')
    assert not q.endswith('"')


async def test_wrapping_quotes_stripped(monkeypatch):
    monkeypatch.setattr(
        "app.services.opening_question.get_client",
        lambda: _make_fake_client('"Walk me through a project you led."'),
    )

    q = await generate_opening_question(
        _fake_user(), _fake_brief(), "Backend Engineer"
    )
    assert q == "Walk me through a project you led."


def test_strip_wrapping_quotes_unit():
    assert _strip_wrapping_quotes('"hello"') == "hello"
    assert _strip_wrapping_quotes("'hello'") == "hello"
    assert _strip_wrapping_quotes("hello") == "hello"
    assert _strip_wrapping_quotes('  "hello"  ') == "hello"
    # Mismatched quotes left alone.
    assert _strip_wrapping_quotes("\"hello'") == "\"hello'"


# ── _recent_questions_block (avoid-list) ─────────────────────────────────────


def test_recent_questions_block_empty_omitted():
    """No avoid-list section for first session (None / empty) — keeps the
    legacy prompt byte-identical, same empty-omission discipline as
    _company_digest."""
    assert _recent_questions_block(None) == ""
    assert _recent_questions_block([]) == ""


def test_recent_questions_block_lists_each_question():
    block = _recent_questions_block(
        ["Tell me about a conflict you resolved.", "Walk me through a failure."]
    )
    assert "AVOID REPETITION" in block
    assert "Tell me about a conflict you resolved." in block
    assert "Walk me through a failure." in block


async def test_generate_opening_question_injects_avoid_list(monkeypatch):
    sink: dict = {}
    monkeypatch.setattr(
        "app.services.opening_question.get_client",
        lambda: _make_capturing_client("A fresh, distinct question?", sink),
    )

    await generate_opening_question(
        _fake_user(), _fake_brief(), "Backend Engineer",
        recent_questions=["Tell me about a time you led under ambiguity."],
    )

    prompt = _user_prompt(sink)
    assert "AVOID REPETITION" in prompt
    assert "Tell me about a time you led under ambiguity." in prompt


async def test_generate_opening_question_no_avoid_list_when_empty(monkeypatch):
    """First-session path: no recent questions → no avoid-list section."""
    sink: dict = {}
    monkeypatch.setattr(
        "app.services.opening_question.get_client",
        lambda: _make_capturing_client("A question?", sink),
    )

    await generate_opening_question(
        _fake_user(), _fake_brief(), "Backend Engineer", recent_questions=[],
    )

    assert "AVOID REPETITION" not in _user_prompt(sink)


# ── _field_prompts.build_field_system_prompt ──────────────────────────────────


def test_build_field_system_prompt_interpolates_category():
    prompt = build_field_system_prompt(
        "Healthcare and Life Sciences", rng=random.Random(0),
    )
    # Category name is in the canonical preamble.
    assert "field/industry of Healthcare and Life Sciences" in prompt
    # Hard constraints survive.
    assert "Exactly ONE sentence" in prompt
    assert "15-22 words" in prompt


def test_build_field_system_prompt_shows_all_themes():
    """Themes catalog is shown in full (all 5) regardless of example rotation."""
    category = "Cybersecurity and Risk"
    prompt = build_field_system_prompt(category, rng=random.Random(0))
    for theme in FIELD_THEMES[category]:
        assert theme in prompt


def test_build_field_system_prompt_samples_two_examples_per_call():
    """Only 2 of the 5 examples show up in any single assembled prompt."""
    category = DEFAULT_CATEGORY
    prompt = build_field_system_prompt(category, rng=random.Random(0))
    present = [e for e in FIELD_EXAMPLES[category] if e in prompt]
    assert len(present) == 2


def test_build_field_system_prompt_rotates_examples_across_calls():
    """Different seeds produce different example slices — the rotation
    is the load-bearing fix for "same opening question over and over"."""
    category = DEFAULT_CATEGORY
    prompt_a = build_field_system_prompt(category, rng=random.Random(0))
    prompt_b = build_field_system_prompt(category, rng=random.Random(7))

    examples = FIELD_EXAMPLES[category]
    slice_a = {e for e in examples if e in prompt_a}
    slice_b = {e for e in examples if e in prompt_b}
    # At least one example differs across the two seeded calls. With
    # C(5,2) = 10 possible 2-sets, two random seeds picking the exact
    # same pair is unlikely; if this ever flakes, pin different seeds.
    assert slice_a != slice_b


def test_build_field_system_prompt_deterministic_with_pinned_rng():
    """Identical seeds produce identical prompts — the seam tests use."""
    prompt_a = build_field_system_prompt(DEFAULT_CATEGORY, rng=random.Random(42))
    prompt_b = build_field_system_prompt(DEFAULT_CATEGORY, rng=random.Random(42))
    assert prompt_a == prompt_b


# ── _company_digest ──────────────────────────────────────────────────────────


def test_company_digest_renders_baseline_fields():
    digest = _company_digest(_fake_brief())
    assert "Anthropic builds frontier AI systems" in digest
    assert "Claude 4.6 released" in digest
    assert "helpful, harmless, honest" in digest


def test_company_digest_omits_role_sections_when_empty():
    """Empty role_signals / sample_question_themes must NOT render a
    section header. Rendering "Role signals: (none)" would cue the
    model to fill it in — exactly the hallucination we're guarding."""
    digest = _company_digest(_fake_brief())
    assert "What this company values in applicants" not in digest
    assert "Themes drawn from published interview questions" not in digest


def test_company_digest_includes_role_signals_when_present():
    digest = _company_digest(
        _fake_brief(role_signals=["strong written communication", "ownership mindset"])
    )
    assert "What this company values in applicants" in digest
    assert "strong written communication" in digest
    assert "ownership mindset" in digest


def test_company_digest_includes_sample_question_themes_when_present():
    digest = _company_digest(
        _fake_brief(sample_question_themes=["incident response under pressure"])
    )
    assert "Themes drawn from published interview questions" in digest
    assert "incident response under pressure" in digest
    # The "inspiration only — dissect the theme, do NOT copy" instruction
    # must be co-located with the themes block, not pulled out.
    assert "dissect the theme" in digest
