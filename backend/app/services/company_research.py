"""
Company research — one Serper /search call, one `google/gemini-2.5-flash`
summarization via OpenRouter.

Returns a compact `CompanyBrief` (description, 2-3 headlines, up to 2 values).
Research + opening question both run on `google/gemini-2.5-flash`; the
per-turn evaluator is on `deepseek/deepseek-v3.2`.

Intentionally narrow — not a "research agent". The brief fits in a single
prompt downstream and lands in `interview_sessions.company_summary` as
serialized JSON.
"""

from __future__ import annotations

import json
import logging

import httpx
from pydantic import BaseModel

from app.core.config import settings
from app.services._openrouter import extract_json_object, get_client

logger = logging.getLogger(__name__)

RESEARCH_MODEL = "google/gemini-2.5-flash"
SERPER_URL = "https://google.serper.dev/search"
SERPER_TIMEOUT_SECONDS = 10.0


class CompanyBrief(BaseModel):
    description: str
    headlines: list[str]
    values: list[str] = []


_SYSTEM_INSTRUCTION = """\
You are a research summarizer. Given raw Google search output about a company,
return ONLY a JSON object with these three keys (no markdown, no prose,
no thinking):

{
  "description": "one or two sentences describing what the company does",
  "headlines": ["2 to 3 short recent-activity bullets", "...", "..."],
  "values": ["up to 2 stated company values", "..."]
}

Rules:
- `description` is factual, present-tense, 1-2 sentences max.
- `headlines` are short phrases (not full sentences), reflecting recent
  initiatives, product launches, funding, partnerships, or news.
- `values` should be omitted (empty list) if not clearly present in the
  input. Do NOT invent values.
- Do not include quotes or source links in any field.
"""


async def _serper_search(company: str) -> dict:
    if not settings.SERPER_API_KEY:
        raise RuntimeError(
            "SERPER_API_KEY is not set. Add it to backend/.env before "
            "calling research_company()."
        )
    async with httpx.AsyncClient(timeout=SERPER_TIMEOUT_SECONDS) as client:
        resp = await client.post(
            SERPER_URL,
            headers={
                "X-API-KEY": settings.SERPER_API_KEY,
                "Content-Type": "application/json",
            },
            json={"q": company, "num": 10},
        )
    resp.raise_for_status()
    return resp.json()


def _digest_serp(serp: dict) -> tuple[str, str]:
    """Return (knowledge_graph_description, compact_digest_for_gemini).

    The first value is used as a fallback description if Gemini parsing
    fails; the second is the blob we feed Gemini.
    """
    kg = serp.get("knowledgeGraph") or {}
    kg_desc = (kg.get("description") or "").strip()

    parts: list[str] = []
    if kg:
        parts.append("Knowledge graph:")
        parts.append(f"  Title: {kg.get('title', '')}")
        parts.append(f"  Type: {kg.get('type', '')}")
        if kg_desc:
            parts.append(f"  Description: {kg_desc}")
        for attr, val in (kg.get("attributes") or {}).items():
            parts.append(f"  {attr}: {val}")

    organic = (serp.get("organic") or [])[:8]
    if organic:
        parts.append("\nTop search results:")
        for r in organic:
            title = r.get("title", "")
            snippet = r.get("snippet", "")
            parts.append(f"- {title}: {snippet}")

    related = (serp.get("relatedSearches") or [])[:5]
    if related:
        parts.append("\nRelated searches:")
        for r in related:
            parts.append(f"- {r.get('query', '')}")

    return kg_desc, "\n".join(parts)


def _fallback_brief(kg_description: str) -> CompanyBrief:
    return CompanyBrief(
        description=kg_description or "No summary available.",
        headlines=[],
        values=[],
    )


async def research_company(company: str) -> CompanyBrief:
    """Fetch a compact structured brief for `company`.

    Serper → `google/gemini-2.5-flash` → CompanyBrief. On any
    summarization-level failure we return a degenerate brief with the
    knowledge-graph description so the demo keeps moving instead of
    500-ing the session.
    """
    client = get_client()

    serp = await _serper_search(company)
    kg_description, digest = _digest_serp(serp)

    response = await client.chat.completions.create(
        model=RESEARCH_MODEL,
        messages=[
            {"role": "system", "content": _SYSTEM_INSTRUCTION},
            {"role": "user", "content": f"Company: {company}\n\n{digest}"},
        ],
        temperature=0.2,
        response_format={"type": "json_object"},
        timeout=60.0,
    )
    text = response.choices[0].message.content or ""

    try:
        return CompanyBrief.model_validate_json(extract_json_object(text))
    except (ValueError, json.JSONDecodeError) as exc:
        logger.warning(
            "Research summarization failed for %s: %s", company, exc
        )
        return _fallback_brief(kg_description)
