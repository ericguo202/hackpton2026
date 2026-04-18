"""
Shared helpers for Gemini / Gemma service modules.

Lazy SDK configuration (so tests can import service modules without a live
key) and a JSON extractor that copes with chain-of-thought preambles the
`response_mime_type="application/json"` hint doesn't always suppress.
"""

from __future__ import annotations

import re

import google.generativeai as genai

from app.core.config import settings

_configured = False


def ensure_configured() -> None:
    """Configure the Gemini SDK on first real call.

    Tests monkeypatch `GenerativeModel` and never trigger configure; the
    lazy check keeps them hermetic. Production callers hit this on the
    first request and raise loudly if the key is missing.
    """
    global _configured
    if _configured:
        return
    if not settings.GEMINI_API_KEY:
        raise RuntimeError(
            "GEMINI_API_KEY is not set. Add it to backend/.env before "
            "calling a Gemini/Gemma service."
        )
    genai.configure(api_key=settings.GEMINI_API_KEY)
    _configured = True


# Gemma 4 (and occasionally Gemini) emits chain-of-thought text before the
# JSON object, even with `response_mime_type="application/json"`. Pull the
# outermost {...} block. Greedy + DOTALL so trailing reasoning after the
# closing brace gets cropped out.
_JSON_OBJECT_RE = re.compile(r"\{.*\}", re.DOTALL)


def extract_json_object(text: str) -> str:
    match = _JSON_OBJECT_RE.search(text)
    if not match:
        raise ValueError(f"No JSON object in LLM response: {text!r}")
    return match.group(0)
