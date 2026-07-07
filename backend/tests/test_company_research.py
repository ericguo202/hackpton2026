"""
Unit tests for company_research — Serper and OpenRouter calls fully mocked.
"""

import json
from types import SimpleNamespace

import pytest

from app.db.models.enums import ExperienceLevel
from app.services import company_research
from app.services.company_research import CompanyBrief, research_company


def _fake_serp_payload() -> dict:
    return {
        "knowledgeGraph": {
            "title": "Acme Robotics",
            "type": "Technology company",
            "description": "Acme Robotics builds autonomous warehouse robots.",
            "attributes": {"Founded": "2019", "CEO": "Jane Doe"},
        },
        "organic": [
            {
                "title": "Acme Robotics raises $200M Series D",
                "snippet": "Acme announced a $200M funding round led by Accel.",
            },
            {
                "title": "Acme partners with Target for 200 stores",
                "snippet": "New pilot deploys fleet robots across Target DCs.",
            },
        ],
        "relatedSearches": [{"query": "acme robotics jobs"}],
    }


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


_WELL_FORMED_JSON = json.dumps(
    {
        "description": "Acme Robotics builds autonomous warehouse robots.",
        "headlines": [
            "Raised $200M Series D",
            "Target partnership across 200 DCs",
        ],
        "values": ["safety-first autonomy"],
        "category": "Technology, Product, and Design",
        "role_signals": [
            "hands-on robotics experience",
            "comfort with on-call rotations",
        ],
        "sample_question_themes": [
            "incident response on warehouse floor",
            "cross-team coordination with logistics partners",
        ],
    }
)

_TRUNCATED_JSON = (
    '{\n  "description": "Acme Robotics builds autonomous warehouse robots '
    'for logistics teams'
)


def _mock_serper(monkeypatch, payload: dict, queries: list[str] | None = None):
    """Patch httpx.AsyncClient.post to return `payload`.

    If `queries` is provided, the q-string of each Serper call is appended
    to it in call order — tests use this to assert the two parallel
    queries fire with the expected strings.
    """
    async def _fake_post(self, *args, **kwargs):
        body = kwargs.get("json") or (args[1] if len(args) > 1 else {})
        if queries is not None and isinstance(body, dict) and "q" in body:
            queries.append(body["q"])
        # httpx.Response.raise_for_status is a no-op on 2xx.
        return SimpleNamespace(
            status_code=200,
            json=lambda: payload,
            raise_for_status=lambda: None,
        )

    monkeypatch.setattr("httpx.AsyncClient.post", _fake_post)


async def test_research_company_happy_path(monkeypatch):
    monkeypatch.setattr(company_research.settings, "SERPER_API_KEY", "test-key")
    _mock_serper(monkeypatch, _fake_serp_payload())
    monkeypatch.setattr(
        "app.services.company_research.get_client",
        lambda: _make_fake_client(_WELL_FORMED_JSON),
    )

    brief = await research_company("Acme Robotics", "Robotics Engineer")

    assert isinstance(brief, CompanyBrief)
    assert "autonomous warehouse robots" in brief.description
    assert 2 <= len(brief.headlines) <= 3
    assert all(isinstance(h, str) and h for h in brief.headlines)
    assert isinstance(brief.values, list)


async def test_research_company_fires_two_serper_calls(monkeypatch):
    """Both the general and the role-targeted Serper queries must fire."""
    monkeypatch.setattr(company_research.settings, "SERPER_API_KEY", "test-key")
    queries: list[str] = []
    _mock_serper(monkeypatch, _fake_serp_payload(), queries=queries)
    monkeypatch.setattr(
        "app.services.company_research.get_client",
        lambda: _make_fake_client(_WELL_FORMED_JSON),
    )

    await research_company("Acme Robotics", "Robotics Engineer")

    assert len(queries) == 2
    # asyncio.gather doesn't guarantee call order, so use set comparison.
    assert set(queries) == {
        "Acme Robotics",
        "Acme Robotics Robotics Engineer behavioral interview culture",
    }


async def test_research_company_threads_experience_level_into_role_query(monkeypatch):
    """When an experience level is given, its search label is woven into the
    role-targeted query so the surfaced signal skews to seniority. The plain
    {company} query is untouched."""
    monkeypatch.setattr(company_research.settings, "SERPER_API_KEY", "test-key")
    queries: list[str] = []
    _mock_serper(monkeypatch, _fake_serp_payload(), queries=queries)
    monkeypatch.setattr(
        "app.services.company_research.get_client",
        lambda: _make_fake_client(_WELL_FORMED_JSON),
    )

    await research_company(
        "Acme Robotics", "Robotics Engineer", ExperienceLevel.senior
    )

    assert set(queries) == {
        "Acme Robotics",
        "Acme Robotics senior Robotics Engineer behavioral interview culture",
    }


async def test_research_company_parses_new_fields(monkeypatch):
    """role_signals and sample_question_themes land on the brief when present."""
    monkeypatch.setattr(company_research.settings, "SERPER_API_KEY", "test-key")
    _mock_serper(monkeypatch, _fake_serp_payload())
    monkeypatch.setattr(
        "app.services.company_research.get_client",
        lambda: _make_fake_client(_WELL_FORMED_JSON),
    )

    brief = await research_company("Acme Robotics", "Robotics Engineer")

    assert brief.role_signals == [
        "hands-on robotics experience",
        "comfort with on-call rotations",
    ]
    assert brief.sample_question_themes == [
        "incident response on warehouse floor",
        "cross-team coordination with logistics partners",
    ]


async def test_research_company_preserves_empty_arrays(monkeypatch):
    """When Gemini returns empty arrays (correct anti-hallucination
    behavior for obscure companies), they pass through unchanged."""
    monkeypatch.setattr(company_research.settings, "SERPER_API_KEY", "test-key")
    _mock_serper(monkeypatch, _fake_serp_payload())
    empty_signals_json = json.dumps(
        {
            "description": "An obscure boutique consultancy.",
            "headlines": ["Founded recently"],
            "values": [],
            "category": "Consulting and Professional Services",
            "role_signals": [],
            "sample_question_themes": [],
        }
    )
    monkeypatch.setattr(
        "app.services.company_research.get_client",
        lambda: _make_fake_client(empty_signals_json),
    )

    brief = await research_company("Obscure Co", "Analyst")

    assert brief.role_signals == []
    assert brief.sample_question_themes == []


async def test_research_company_handles_missing_new_fields(monkeypatch):
    """Old-shape Gemini response (missing the new fields entirely)
    defaults to []. Regression guard against schema drift / partial
    rollout where an older proxy might strip unknown JSON keys."""
    monkeypatch.setattr(company_research.settings, "SERPER_API_KEY", "test-key")
    _mock_serper(monkeypatch, _fake_serp_payload())
    legacy_shape_json = json.dumps(
        {
            "description": "Acme Robotics builds autonomous warehouse robots.",
            "headlines": ["Raised $200M Series D"],
            "values": ["safety-first autonomy"],
            "category": "Technology, Product, and Design",
            # Note: no role_signals, no sample_question_themes
        }
    )
    monkeypatch.setattr(
        "app.services.company_research.get_client",
        lambda: _make_fake_client(legacy_shape_json),
    )

    brief = await research_company("Acme Robotics", "Robotics Engineer")

    assert brief.role_signals == []
    assert brief.sample_question_themes == []


async def test_research_company_retries_once_on_truncated_json(monkeypatch):
    monkeypatch.setattr(company_research.settings, "SERPER_API_KEY", "test-key")
    _mock_serper(monkeypatch, _fake_serp_payload())
    fake_client = _make_fake_client([_TRUNCATED_JSON, _WELL_FORMED_JSON])
    monkeypatch.setattr(
        "app.services.company_research.get_client",
        lambda: fake_client,
    )

    brief = await research_company("Acme Robotics", "Robotics Engineer")

    assert "autonomous warehouse robots" in brief.description
    assert len(fake_client.calls) == 2
    retry_messages = fake_client.calls[1]["messages"]
    assert (
        "previous response was invalid or truncated JSON"
        in retry_messages[-1]["content"]
    )
    assert retry_messages[0]["content"] == company_research._SYSTEM_INSTRUCTION


async def test_research_company_falls_back_on_malformed_json(monkeypatch):
    monkeypatch.setattr(company_research.settings, "SERPER_API_KEY", "test-key")
    _mock_serper(monkeypatch, _fake_serp_payload())
    fake_client = _make_fake_client([
        "no json here, just chain of thought nonsense",
        _TRUNCATED_JSON,
    ])
    monkeypatch.setattr(
        "app.services.company_research.get_client",
        lambda: fake_client,
    )

    brief = await research_company("Acme Robotics", "Robotics Engineer")

    # Fallback uses the knowledge-graph description we injected.
    assert brief.description == "Acme Robotics builds autonomous warehouse robots."
    assert brief.headlines == []
    assert brief.values == []
    assert brief.role_signals == []
    assert brief.sample_question_themes == []
    assert len(fake_client.calls) == 2


def test_research_system_prompt_contains_hard_json_contract():
    prompt = company_research._SYSTEM_INSTRUCTION

    assert "HARD JSON CONTRACT" in prompt
    assert "`description` <= 180 chars" in prompt
    assert "each `headline` <= 70 chars" in prompt
    assert "first non-whitespace character MUST" in prompt
    assert "Never stop mid-string" in prompt


async def test_research_company_without_serper_key_raises(monkeypatch):
    monkeypatch.setattr(company_research.settings, "SERPER_API_KEY", None)
    monkeypatch.setattr(
        "app.services.company_research.get_client",
        lambda: _make_fake_client(_WELL_FORMED_JSON),
    )

    with pytest.raises(RuntimeError, match="SERPER_API_KEY"):
        await research_company("Acme", "Engineer")


# ── jd_summary (pasted-JD role facts) ─────────────────────────────────────────


async def test_research_company_serper_path_leaves_jd_summary_empty(monkeypatch):
    """The Serper (no-JD) path never emits `jd_summary` — the model response
    lacks the key and it defaults to []. Guards the downstream empty-omission
    contract for every session without a pasted job description."""
    monkeypatch.setattr(company_research.settings, "SERPER_API_KEY", "test-key")
    _mock_serper(monkeypatch, _fake_serp_payload())
    monkeypatch.setattr(
        "app.services.company_research.get_client",
        lambda: _make_fake_client(_WELL_FORMED_JSON),
    )

    brief = await research_company("Acme Robotics", "Robotics Engineer")

    assert brief.jd_summary == []


async def test_research_company_jd_path_populates_jd_summary(monkeypatch):
    """A pasted JD skips Serper and the JD summarizer's `jd_summary` bullets
    land on the brief. Also asserts the Serper path was NOT taken."""
    def _boom_post(self, *args, **kwargs):
        raise AssertionError("Serper must not be called on the JD path")

    monkeypatch.setattr("httpx.AsyncClient.post", _boom_post)
    jd_json = json.dumps(
        {
            "description": "A boutique studio; this is a solo design role.",
            "headlines": ["Owns product design end to end"],
            "values": [],
            "category": "Technology, Product, and Design",
            "role_signals": ["comfort with ambiguity"],
            "sample_question_themes": ["navigating ambiguous priorities"],
            "jd_summary": [
                "Solo / individual-contributor role — no design team",
                "Owns the full design process end to end",
                "Reports directly to the founder",
            ],
        }
    )
    monkeypatch.setattr(
        "app.services.company_research.get_client",
        lambda: _make_fake_client(jd_json),
    )

    brief = await research_company(
        "Tiny Studio", "Product Designer",
        job_description="We're hiring a solo designer to own everything.",
    )

    assert brief.jd_summary == [
        "Solo / individual-contributor role — no design team",
        "Owns the full design process end to end",
        "Reports directly to the founder",
    ]


async def test_research_company_jd_summary_capped_at_five(monkeypatch):
    """`_normalize_brief_payload` caps jd_summary at 5 bullets even if the
    model over-produces (belt-and-suspenders over the prompt cap)."""
    def _fake_post(self, *args, **kwargs):
        raise AssertionError("Serper must not be called on the JD path")

    monkeypatch.setattr("httpx.AsyncClient.post", _fake_post)
    jd_json = json.dumps(
        {
            "description": "desc",
            "headlines": ["h"],
            "values": [],
            "category": "Technology, Product, and Design",
            "role_signals": [],
            "sample_question_themes": [],
            "jd_summary": [f"fact {i}" for i in range(8)],
        }
    )
    monkeypatch.setattr(
        "app.services.company_research.get_client",
        lambda: _make_fake_client(jd_json),
    )

    brief = await research_company(
        "Co", "Engineer", job_description="A real posting with enough text.",
    )

    assert brief.jd_summary == [f"fact {i}" for i in range(5)]


def test_jd_system_prompt_contains_jd_summary_contract():
    prompt = company_research._JD_SYSTEM_INSTRUCTION

    assert "seven keys" in prompt
    assert '"jd_summary"' in prompt
    assert "each `jd_summary` item <= 90 chars" in prompt
    assert "Rules for `jd_summary`" in prompt
    # The solo-vs-collaborative distinction is the bug this field fixes.
    assert "SOLO" in prompt and "COLLABORATIVE" in prompt


def test_jd_system_prompt_hardened_against_hallucination():
    """The JD prompt must carry a prominent, global grounding rule so the model
    never fabricates information the posting doesn't state."""
    prompt = company_research._JD_SYSTEM_INSTRUCTION

    # A single prominent, top-priority grounding block.
    assert "ABSOLUTE GROUNDING RULE" in prompt
    assert "HIGHEST PRIORITY" in prompt
    # Omit-rather-than-guess posture + "plausible != stated".
    assert "LEAVE IT OUT" in prompt
    assert "Plausible is NOT the same as stated" in prompt
    # No outside knowledge / reputation.
    assert "NEVER draw on outside knowledge" in prompt
    # Explicitly forbids guessing solo-vs-collaborative / team structure.
    assert "do NOT guess" in prompt
    assert "solo vs. collaborative" in prompt
    # The narrow carve-out keeps description/category usable for obscure JDs.
    assert "NARROW CARVE-OUT" in prompt
    assert "`description`" in prompt and "`category`" in prompt
