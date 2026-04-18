"""
ElevenLabs speech-to-text — audio bytes in, transcript string out.

Mirrors the httpx pattern in tts.py so we stay SDK-free.
Endpoint: POST /v1/speech-to-text (scribe_v1 model, ~2-3 s for a 30 s clip).
"""

from __future__ import annotations

import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

_STT_URL = "https://api.elevenlabs.io/v1/speech-to-text"
_TIMEOUT = 60.0


async def transcribe_audio(audio_blob: bytes, filename: str = "audio.webm") -> str:
    """POST audio bytes to ElevenLabs STT; return plain-text transcript."""
    if not settings.ELEVENLABS_API_KEY:
        raise RuntimeError(
            "ELEVENLABS_API_KEY is not set. Add it to backend/.env before "
            "calling transcribe_audio()."
        )

    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.post(
            _STT_URL,
            headers={"xi-api-key": settings.ELEVENLABS_API_KEY},
            files={"file": (filename, audio_blob)},
            data={"model_id": "scribe_v1"},
        )
    resp.raise_for_status()
    transcript = resp.json().get("text", "").strip()
    logger.info("STT: transcribed %d chars", len(transcript))
    return transcript
