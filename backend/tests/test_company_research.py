"""
Unit tests for company_research — Serper and Gemini calls fully mocked.
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


class _FakeResponse:
    def __init__(self, text: str):
        self.text = text


class _FakeGeminiModel:
    def __init__(self, *args, **kwargs):
        pass

    async def generate_content_async(self, *args, **kwargs):
        return _FakeResponse(
            json.dumps(
                {
                    "description": "Acme Robotics builds autonomous warehouse robots.",
                    "headlines": [
                        "Raised $200M Series D",
                        "Target partnership across 200 DCs",
                    ],
                    "values": ["safety-first autonomy"],
                }
            )
        )


class _MalformedGeminiModel:
    def __init__(self, *args, **kwargs):
        pass

    async def generate_content_async(self, *args, **kwargs):
        return _FakeResponse("no json here, just chain of thought nonsense")


def _mock_serper(monkeypatch, payload: dict):
    async def _fake_post(self, *args, **kwargs):
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
    monkeypatch.setattr(company_research.genai, "GenerativeModel", _FakeGeminiModel)
    # Bypass lazy configure — no real key needed with the mocked model.
    monkeypatch.setattr(
        "app.services._gemini_utils.ensure_configured", lambda: None
    )

    brief = await research_company("Acme Robotics")

    assert isinstance(brief, CompanyBrief)
    assert "autonomous warehouse robots" in brief.description
    assert 2 <= len(brief.headlines) <= 3
    assert all(isinstance(h, str) and h for h in brief.headlines)
    assert isinstance(brief.values, list)


async def test_research_company_falls_back_on_malformed_json(monkeypatch):
    monkeypatch.setattr(company_research.settings, "SERPER_API_KEY", "test-key")
    _mock_serper(monkeypatch, _fake_serp_payload())
    monkeypatch.setattr(
        company_research.genai, "GenerativeModel", _MalformedGeminiModel
    )
    monkeypatch.setattr(
        "app.services._gemini_utils.ensure_configured", lambda: None
    )

    brief = await research_company("Acme Robotics")

    # Fallback uses the knowledge-graph description we injected.
    assert brief.description == "Acme Robotics builds autonomous warehouse robots."
    assert brief.headlines == []
    assert brief.values == []


async def test_research_company_without_serper_key_raises(monkeypatch):
    monkeypatch.setattr(company_research.settings, "SERPER_API_KEY", None)
    monkeypatch.setattr(
        "app.services._gemini_utils.ensure_configured", lambda: None
    )

    with pytest.raises(RuntimeError, match="SERPER_API_KEY"):
        await research_company("Acme")
