"""
ElevenLabs speech-to-text — audio bytes in, transcript + speech duration out.

Mirrors the httpx pattern in tts.py so we stay SDK-free.
Endpoint: POST /v1/speech-to-text (scribe_v1 model, ~2-3 s for a 30 s clip).

Besides `text`, scribe_v1 returns a `words[]` array carrying per-word `start`
/ `end` timestamps. We derive the SPEECH SPAN from it (see
`_speech_span_seconds`) — the denominator for the words-per-minute delivery
metric — at zero extra API cost.
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

_STT_URL = "https://api.elevenlabs.io/v1/speech-to-text"
_TIMEOUT = 60.0


@dataclass(frozen=True)
class Transcription:
    """One STT result: the transcript plus how long the candidate spoke.

    `duration_seconds` is None whenever the span can't be derived (an older /
    changed response shape, a words array with no timestamps, silence). Callers
    treat that as "pace unknown" and store NULL — never 0, which would be
    indistinguishable from a real measurement.
    """

    text: str
    duration_seconds: float | None


def _speech_span_seconds(payload: Any) -> float | None:
    """Seconds from the first spoken word's start to the last word's end.

    Deliberately NOT the top-level `audio_duration_secs`: that's wall-clock
    recording length, so the pause before the candidate starts talking and the
    dead air before they hit "End recording" would drag a well-paced answer
    into the "too slow" band. The span measures actual speaking rate.

    Only `type == "word"` entries count — `spacing` carries no real timing and
    a trailing `audio_event` (e.g. "(laughter)") must not stretch the span.

    Fails soft to None on ANY unexpected shape: a schema change upstream must
    cost us the pace metric, never a whole interview turn.
    """
    try:
        words = payload.get("words") if isinstance(payload, dict) else None
        if not isinstance(words, list):
            return None

        starts: list[float] = []
        ends: list[float] = []
        for w in words:
            if not isinstance(w, dict) or w.get("type") != "word":
                continue
            start, end = w.get("start"), w.get("end")
            if not isinstance(start, (int, float)) or not isinstance(end, (int, float)):
                continue
            if not math.isfinite(start) or not math.isfinite(end):
                continue
            starts.append(float(start))
            ends.append(float(end))

        if not starts:
            return None
        span = max(ends) - min(starts)
        return span if span > 0 else None
    except Exception:  # noqa: BLE001 — pace is optional; never break the turn
        logger.warning("STT: could not derive speech span", exc_info=True)
        return None


async def transcribe_audio(
    audio_blob: bytes, filename: str = "audio.webm"
) -> Transcription:
    """POST audio bytes to ElevenLabs STT; return transcript + speech span.

    The transcript keeps ElevenLabs' audio-event tags ("(laughter)") verbatim —
    the evaluator should see them and the candidate should read what they
    actually said. `filler_words.strip_audio_events` drops them for counting
    only.
    """
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
    payload = resp.json()
    transcript = payload.get("text", "").strip()
    duration = _speech_span_seconds(payload)
    logger.info(
        "STT: transcribed %d chars, speech span %s",
        len(transcript),
        f"{duration:.2f}s" if duration is not None else "(unknown)",
    )
    return Transcription(text=transcript, duration_seconds=duration)
