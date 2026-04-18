"""
Unit tests for opening_question — Gemini call mocked.
"""

from types import SimpleNamespace

import pytest

from app.services import opening_question
from app.services.company_research import CompanyBrief
from app.services.opening_question import (
    _strip_wrapping_quotes,
    generate_opening_question,
)


class _FakeResponse:
    def __init__(self, text: str):
        self.text = text


def _fake_user():
    return SimpleNamespace(
        name="Eric",
        target_role="Backend Engineer",
        industry="AI Infrastructure",
        experience_level=SimpleNamespace(value="mid"),
        short_bio="4 years on data platforms.",
        resume_text="Led a team that shipped an LLM eval harness processing 10k reqs/s.",
    )


def _fake_brief():
    return CompanyBrief(
        description="Anthropic builds frontier AI systems focused on safety.",
        headlines=["Claude 4.6 released", "Expanded enterprise Claude Code tier"],
        values=["helpful, harmless, honest"],
    )


async def test_generate_opening_question_returns_plain_string(monkeypatch):
    class _Model:
        def __init__(self, *args, **kwargs):
            pass

        async def generate_content_async(self, *args, **kwargs):
            return _FakeResponse(
                "Tell me about a time you designed an evaluation system under "
                "safety constraints, and how you'd approach similar tradeoffs "
                "at Anthropic."
            )

    monkeypatch.setattr(opening_question.genai, "GenerativeModel", _Model)
    monkeypatch.setattr(
        "app.services._gemini_utils.ensure_configured", lambda: None
    )

    q = await generate_opening_question(
        _fake_user(), _fake_brief(), "Applied AI Engineer"
    )

    assert isinstance(q, str)
    assert len(q) > 20
    assert not q.startswith('"')
    assert not q.endswith('"')


async def test_wrapping_quotes_stripped(monkeypatch):
    class _Model:
        def __init__(self, *args, **kwargs):
            pass

        async def generate_content_async(self, *args, **kwargs):
            return _FakeResponse('"Walk me through a project you led."')

    monkeypatch.setattr(opening_question.genai, "GenerativeModel", _Model)
    monkeypatch.setattr(
        "app.services._gemini_utils.ensure_configured", lambda: None
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
