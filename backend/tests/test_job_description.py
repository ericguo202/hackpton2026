"""
Unit tests for the pasted-job-description feature:
  * `looks_like_gibberish` — conservative long-text junk gate.
  * `check_job_description_match` — fail-open profile/JD consistency check.
  * `company_research.research_company(job_description=...)` — Serper-skipping
    research branch.

All OpenRouter calls are fully mocked.
"""

import json
from types import SimpleNamespace

import pytest

from app.services import company_research, incidents, job_description
from app.services.company_research import CompanyBrief, research_company
from app.services.job_description import (
    JdMatchResult,
    check_job_description_match,
    looks_like_gibberish,
)

_REAL_JD = (
    "We are hiring a Software Engineer to join our platform team. You will "
    "design, build, and operate backend services, collaborate across teams, "
    "and mentor junior engineers. Strong written communication and a bias for "
    "action are essential. Requirements: 3+ years of experience shipping "
    "production software, ownership of outcomes, and comfort with ambiguity."
)


def _fake_response(text: str) -> SimpleNamespace:
    return SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=text))]
    )


def _make_fake_client(text: str | list[str]):
    responses = [text] if isinstance(text, str) else list(text)
    calls: list[dict] = []

    async def _create(**kwargs):
        calls.append(kwargs)
        index = min(len(calls) - 1, len(responses) - 1)
        return _fake_response(responses[index])

    return SimpleNamespace(
        chat=SimpleNamespace(completions=SimpleNamespace(create=_create)),
        calls=calls,
    )


# ── looks_like_gibberish ──────────────────────────────────────────────────────

def test_gibberish_passes_a_real_posting():
    assert looks_like_gibberish(_REAL_JD) is False


def test_gibberish_passes_bullet_heavy_posting():
    bullets = (
        "Responsibilities:\n"
        "- Build and ship features\n"
        "- Own reliability and on-call\n"
        "- Partner with product and design\n"
        "Requirements:\n"
        "- 3+ years experience\n"
        "- Strong communication"
    )
    assert looks_like_gibberish(bullets) is False


@pytest.mark.parametrize(
    "value",
    [
        "",
        "   ",
        "1234567890 !!! @@@ ### $$$ %%%",  # no letters / symbol soup
        "asdfasdfasdfasdfasdfasdfasdfasdf",  # long low-entropy keysmash
        "////////============++++++++++ 999",  # mostly non-letters
    ],
)
def test_gibberish_rejects_junk(value):
    assert looks_like_gibberish(value) is True


# ── check_job_description_match ───────────────────────────────────────────────

async def test_match_returns_true_on_consistent_pairing(monkeypatch):
    fake = _make_fake_client(json.dumps({"match": True, "reason": "aligned"}))
    monkeypatch.setattr(job_description, "get_client", lambda: fake)

    result = await check_job_description_match(
        company="Acme",
        job_title="Software Engineer",
        industry="Software",
        job_description=_REAL_JD,
    )

    assert isinstance(result, JdMatchResult)
    assert result.match is True
    # The JD is wrapped in untrusted-data delimiters.
    sent = fake.calls[0]["messages"][-1]["content"]
    assert "<job_description>" in sent


async def test_match_returns_false_on_mismatch(monkeypatch):
    fake = _make_fake_client(
        json.dumps({"match": False, "reason": "IB role, not software"})
    )
    monkeypatch.setattr(job_description, "get_client", lambda: fake)

    result = await check_job_description_match(
        company="Goldman Sachs",
        job_title="Software Engineer",
        industry="Software",
        job_description="Investment banking analyst, M&A advisory...",
    )

    assert result.match is False
    assert result.reason == "IB role, not software"


async def test_match_fails_open_on_llm_error(monkeypatch):
    async def _boom(**kwargs):
        raise RuntimeError("rate limited")

    fake = SimpleNamespace(
        chat=SimpleNamespace(completions=SimpleNamespace(create=_boom))
    )
    monkeypatch.setattr(job_description, "get_client", lambda: fake)

    result = await check_job_description_match(
        company="Acme",
        job_title="Software Engineer",
        industry="Software",
        job_description=_REAL_JD,
    )

    # Outage must not block a legitimate session.
    assert result.match is True


async def test_match_fails_open_on_malformed_json(monkeypatch):
    fake = _make_fake_client("not json, just chain of thought")
    monkeypatch.setattr(job_description, "get_client", lambda: fake)

    result = await check_job_description_match(
        company="Acme",
        job_title="Software Engineer",
        industry=None,
        job_description=_REAL_JD,
    )

    assert result.match is True


# ── research_company JD branch ────────────────────────────────────────────────

_JD_BRIEF_JSON = json.dumps(
    {
        "description": "Platform engineering role building backend services.",
        "headlines": ["Backend services", "Cross-team collaboration"],
        "values": ["bias for action"],
        "category": "Technology, Product, and Design",
        "role_signals": ["ownership of outcomes", "strong written communication"],
        "sample_question_themes": ["mentoring junior engineers"],
    }
)


async def test_research_from_jd_skips_serper(monkeypatch):
    """With a JD present, no Serper call fires — proven by leaving the key
    unset (the Serper path would raise RuntimeError before any LLM call)."""
    monkeypatch.setattr(company_research.settings, "SERPER_API_KEY", None)

    async def _fail_serper(query):
        raise AssertionError("Serper must not be called in JD mode")

    monkeypatch.setattr(company_research, "_serper_search", _fail_serper)
    monkeypatch.setattr(
        "app.services.company_research.get_client",
        lambda: _make_fake_client(_JD_BRIEF_JSON),
    )

    brief = await research_company(
        "Acme", "Software Engineer", job_description=_REAL_JD,
    )

    assert isinstance(brief, CompanyBrief)
    assert "backend services" in brief.description.lower()
    assert brief.role_signals == [
        "ownership of outcomes",
        "strong written communication",
    ]


async def test_research_from_jd_uses_jd_system_instruction(monkeypatch):
    monkeypatch.setattr(company_research.settings, "SERPER_API_KEY", None)
    fake = _make_fake_client(_JD_BRIEF_JSON)
    monkeypatch.setattr(
        "app.services.company_research.get_client", lambda: fake,
    )

    await research_company("Acme", "Software Engineer", job_description=_REAL_JD)

    messages = fake.calls[0]["messages"]
    assert messages[0]["content"] == company_research._JD_SYSTEM_INSTRUCTION
    assert "<job_description>" in messages[1]["content"]


async def test_research_from_jd_falls_back_on_malformed(monkeypatch):
    monkeypatch.setattr(company_research.settings, "SERPER_API_KEY", None)
    fake = _make_fake_client(["no json", "still no json"])
    monkeypatch.setattr(
        "app.services.company_research.get_client", lambda: fake,
    )

    brief = await research_company(
        "Acme", "Software Engineer", job_description=_REAL_JD,
    )

    # Fallback uses the company name (no knowledge-graph description in JD mode).
    assert brief.description == "Acme"
    assert brief.role_signals == []


async def test_empty_job_description_uses_serper_path(monkeypatch):
    """An empty/whitespace JD must fall through to the legacy Serper path —
    which raises when the key is unset, proving the branch wasn't taken."""
    monkeypatch.setattr(company_research.settings, "SERPER_API_KEY", None)
    monkeypatch.setattr(
        "app.services.company_research.get_client",
        lambda: _make_fake_client(_JD_BRIEF_JSON),
    )

    with pytest.raises(RuntimeError, match="SERPER_API_KEY"):
        await research_company("Acme", "Software Engineer", job_description="   ")


# ── log_jd_mismatch_acknowledged ──────────────────────────────────────────────

async def test_jd_mismatch_ack_logs_warning_incident(monkeypatch):
    """Acknowledging a flagged mismatch records a WARNING incident carrying the
    offending JD + declared company/title, for after-the-fact abuse visibility."""
    captured: dict = {}

    async def _capture(**kwargs):
        captured.update(kwargs)

    monkeypatch.setattr(incidents, "log_incident", _capture)

    await incidents.log_jd_mismatch_acknowledged(
        user=None,
        job_description=_REAL_JD,
        company="Acme",
        job_title="Software Engineer",
    )

    assert captured["event_type"] == incidents.EVENT_JD_MISMATCH_ACK
    assert captured["severity"] == incidents.SEVERITY_WARNING
    assert captured["sent_content"] == _REAL_JD
    assert captured["metadata"] == {
        "company": "Acme",
        "job_title": "Software Engineer",
    }
