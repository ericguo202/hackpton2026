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

# Speech pace, sent as `voice_settings.speed` on the request. Without this
# field ElevenLabs uses the voice's stored settings, which read noticeably
# slower than the website playground — so we default to a brisk 1.1 ("Normal").
# Non-native English speakers can opt into 0.9 ("Slower") via the setup form.
# ElevenLabs clamps quality-safe speed to [0.7, 1.2]; we clamp to the same
# range so a bad/direct-API value can never degrade the audio.
NORMAL_SPEED = 1.1
SLOWER_SPEED = 0.9
DEFAULT_SPEED = NORMAL_SPEED
MIN_SPEED = 0.7
MAX_SPEED = 1.2


def clamp_speed(speed: float | None) -> float:
    """Coerce an incoming speed into the ElevenLabs-supported range.

    `None` (legacy sessions persisted before the column existed, or callers
    that don't care) falls back to the default. Out-of-range values are
    clamped rather than rejected — this is a UX knob, not a security gate.
    """
    if speed is None:
        return DEFAULT_SPEED
    return max(MIN_SPEED, min(MAX_SPEED, float(speed)))


async def synthesize_speech(
    text: str, voice_id: str | None = None, speed: float | None = None
) -> str:
    """POST `text` to ElevenLabs; return a `data:audio/mpeg;base64,...` URL.

    `voice_id` is the per-session voice from `voice_pool.voice_for_session`.
    When omitted (e.g. one-off scripts or tests), the call falls back to
    the legacy `ELEVENLABS_VOICE_ID` env var so existing tooling keeps
    working without code changes.

    `speed` is the per-session speech pace (see `NORMAL_SPEED`/`SLOWER_SPEED`);
    `None` falls back to `DEFAULT_SPEED`. Only `speed` is sent in
    `voice_settings` — stability/similarity_boost are deliberately left to the
    voice's stored settings so the pace changes without altering its character.
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
                "voice_settings": {"speed": clamp_speed(speed)},
            },
        )
    resp.raise_for_status()

    b64 = base64.b64encode(resp.content).decode("ascii")
    return f"data:audio/mpeg;base64,{b64}"
