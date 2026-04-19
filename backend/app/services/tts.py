"""
ElevenLabs text-to-speech — one HTTP call, base64 data URL out.

Returns a ready-to-use `data:audio/mpeg;base64,...` string that the frontend
drops straight into `<audio src>`. No persistence, no S3 — CLAUDE.md L118
specifies audio is inline in the JSON response and regenerated on replay.

Uses the developer ElevenAPI platform directly (not the ElevenAgents
conversational product). Mirrors the httpx pattern in `company_research.py`
so we don't carry the `elevenlabs` SDK for what is a ~15-line wrapper.
"""

from __future__ import annotations

import base64
import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

ELEVENLABS_URL = "https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
ELEVENLABS_TIMEOUT_SECONDS = 30.0

# Flash v2.5: ~1s latency for a one-sentence question, acceptable quality
# for the demo. Swap to `eleven_v3` if a demo machine has spare budget
# and we want richer prosody.
DEFAULT_MODEL_ID = "eleven_flash_v2_5"
# 44.1 kHz / 128 kbps MP3 — universally playable by `<audio>` across
# Chrome/Edge/Firefox/Safari without a codec dance.
DEFAULT_OUTPUT_FORMAT = "mp3_44100_128"


async def synthesize_speech(text: str, voice_id: str | None = None) -> str:
    """POST `text` to ElevenLabs; return a `data:audio/mpeg;base64,...` URL.

    `voice_id` is the per-session voice from `voice_pool.voice_for_session`.
    When omitted (e.g. one-off scripts or tests), the call falls back to
    the legacy `ELEVENLABS_VOICE_ID` env var so existing tooling keeps
    working without code changes.
    """
    if not settings.ELEVENLABS_API_KEY:
        raise RuntimeError(
            "ELEVENLABS_API_KEY is not set. Add it to backend/.env before "
            "calling synthesize_speech()."
        )

    effective_voice_id = voice_id or settings.ELEVENLABS_VOICE_ID
    if not effective_voice_id:
        raise RuntimeError(
            "No voice_id supplied and ELEVENLABS_VOICE_ID is not set. "
            "Either pass voice_id (preferred — see voice_pool.voice_for_session) "
            "or set the env var as a fallback."
        )

    url = ELEVENLABS_URL.format(voice_id=effective_voice_id)
    async with httpx.AsyncClient(timeout=ELEVENLABS_TIMEOUT_SECONDS) as client:
        resp = await client.post(
            url,
            headers={
                "xi-api-key": settings.ELEVENLABS_API_KEY,
                "Content-Type": "application/json",
            },
            json={
                "text": text,
                "model_id": DEFAULT_MODEL_ID,
                "output_format": DEFAULT_OUTPUT_FORMAT,
            },
        )
    resp.raise_for_status()

    b64 = base64.b64encode(resp.content).decode("ascii")
    return f"data:audio/mpeg;base64,{b64}"
