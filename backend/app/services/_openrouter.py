"""
Shared helpers for OpenRouter-backed LLM services.

All services (`evaluator`, `followup`, `opening_question`, `company_research`)
talk to OpenRouter's OpenAI-compatible Chat Completions endpoint via the
official OpenAI Python SDK. A single `AsyncOpenAI` client is instantiated
lazily here so tests can import service modules without a live key.

`extract_json_object` is kept from the previous Gemini helper: DeepSeek and
Gemini both occasionally emit thinking preamble ahead of the JSON body even
when `response_format={"type": "json_object"}` is set, and brace-counting
handles that cleanly without a repair loop.
"""

from __future__ import annotations

from openai import AsyncOpenAI

from app.core.config import settings

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

_client: AsyncOpenAI | None = None


def get_client() -> AsyncOpenAI:
    """Return a process-wide `AsyncOpenAI` client pointed at OpenRouter.

    First call validates that `OPENROUTER_API_KEY` is set and constructs
    the client; subsequent calls reuse the same instance. Tests that
    monkeypatch this function to return a fake never touch the network.
    """
    global _client
    if _client is not None:
        return _client
    if not settings.OPENROUTER_API_KEY:
        raise RuntimeError(
            "OPENROUTER_API_KEY is not set. Add it to backend/.env before "
            "calling an LLM service."
        )
    _client = AsyncOpenAI(
        api_key=settings.OPENROUTER_API_KEY,
        base_url=OPENROUTER_BASE_URL,
    )
    return _client


def extract_json_object(text: str) -> str:
    """Extract the first complete JSON object from text using brace counting.

    Some models (DeepSeek especially, but Gemini too on occasion) emit
    chain-of-thought preamble/postamble even with JSON mode enabled. A
    greedy regex overshoots when the model appends text after the closing
    brace. Brace counting stops exactly at the matching close brace.
    """
    start = text.find("{")
    if start == -1:
        raise ValueError(f"No JSON object in LLM response: {text!r}")
    depth = 0
    in_string = False
    escape_next = False
    for i, ch in enumerate(text[start:], start):
        if escape_next:
            escape_next = False
            continue
        if ch == "\\" and in_string:
            escape_next = True
            continue
        if ch == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[start : i + 1]
    raise ValueError(f"Unterminated JSON object in LLM response: {text!r}")
