"""
Shared helpers for Gemini / Gemma service modules.

Lazy SDK configuration (so tests can import service modules without a live
key) and a JSON extractor that copes with chain-of-thought preambles the
`response_mime_type="application/json"` hint doesn't always suppress.
"""

from __future__ import annotations

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


def extract_json_object(text: str) -> str:
    """Extract the first complete JSON object from text using brace counting.

    Gemma 4 (and occasionally Gemini) emits chain-of-thought preamble/postamble
    even with response_mime_type="application/json". A greedy regex overshoots
    when the model appends text after the closing brace. Brace counting stops
    exactly at the matching close brace.
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
