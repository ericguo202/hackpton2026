"""
Unit tests for company_research — Serper and OpenRouter calls fully mocked.
"""

import json
from types import SimpleNamespace

import pytest

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


def _make_fake_client(text: str):
    async def _create(**kwargs):
        return _fake_response(text)

    return SimpleNamespace(
        chat=SimpleNamespace(completions=SimpleNamespace(create=_create))
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


async def test_research_company_falls_back_on_malformed_json(monkeypatch):
    monkeypatch.setattr(company_research.settings, "SERPER_API_KEY", "test-key")
    _mock_serper(monkeypatch, _fake_serp_payload())
    monkeypatch.setattr(
        "app.services.company_research.get_client",
        lambda: _make_fake_client("no json here, just chain of thought nonsense"),
    )

    brief = await research_company("Acme Robotics", "Robotics Engineer")

    # Fallback uses the knowledge-graph description we injected.
    assert brief.description == "Acme Robotics builds autonomous warehouse robots."
    assert brief.headlines == []
    assert brief.values == []
    assert brief.role_signals == []
    assert brief.sample_question_themes == []


async def test_research_company_without_serper_key_raises(monkeypatch):
    monkeypatch.setattr(company_research.settings, "SERPER_API_KEY", None)
    monkeypatch.setattr(
        "app.services.company_research.get_client",
        lambda: _make_fake_client(_WELL_FORMED_JSON),
    )

    with pytest.raises(RuntimeError, match="SERPER_API_KEY"):
        await research_company("Acme", "Engineer")
