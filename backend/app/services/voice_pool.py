"""
ElevenLabs voice pool — named, accented interviewer voices.

The hackathon demo wants the AI interviewer to feel like a different
person each session (diversity / texture) while staying consistent
WITHIN a session — turn 2's follow-up should sound like the same human
who asked turn 1.

Two ways a session lands on a voice:
  1. The candidate explicitly picks one in the start-form picker —
     `SessionCreateIn.voice_id` is set, validated against this pool, and
     persisted on `interview_sessions.voice_id`.
  2. The candidate skips the picker — `voice_for_session(session.id)`
     deterministically picks one from the UUID. UUID4 is uniformly
     random, so the modulo gives roughly uniform coverage across the
     pool with zero extra state. We still persist the resolved voice on
     the session row so turn 2 (and any later replay) reads the same
     voice without re-deriving anything.

Voice IDs are public (visible in any audio request to the ElevenLabs
API), so embedding them in source is fine. Rotating one out is a
one-line edit + redeploy. Add new voices to the END of `_VOICE_POOL`
to keep historical sessions stable when no `voice_id` was persisted
(legacy rows fall back to `voice_for_session`, which is order-sensitive).
"""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID


@dataclass(frozen=True)
class VoiceProfile:
    """One row in the interviewer voice catalog.

    `id` is the ElevenLabs voice ID and is what the TTS endpoint
    actually consumes. `name` and `accent` are display-only metadata
    surfaced in the picker UI and never sent to ElevenLabs.
    """

    id: str
    name: str
    accent: str


# Order matters only for the legacy fallback path
# (`voice_for_session(session.id)`): reordering changes which voice an
# unpicked session resolves to. Sessions that explicitly persisted a
# `voice_id` are immune. Add new voices to the END.
_VOICE_POOL: tuple[VoiceProfile, ...] = (
    VoiceProfile("MwUMLXurEzSN7bIfIdXF", "Divya",    "Indian"),
    VoiceProfile("DODLEQrClDo8wCz460ld", "Jennifer", "American"),
    VoiceProfile("Fahco4VZzobUeiPqni1S", "David",    "British"),
    VoiceProfile("FUu5jJAN31dt6KeE1fk2", "Irene",    "Malaysian-American"),
    VoiceProfile("RBUtdrDRjER5aScqHwAS", "Ding",     "Chinese"),
    VoiceProfile("1cuDPO8sIMatoOE4Z2Zv", "Daniel",   "American"),
)


# id-keyed lookup for O(1) validation. Built once at import time so
# the validator stays a constant-time check even with a larger pool.
_VOICE_BY_ID: dict[str, VoiceProfile] = {v.id: v for v in _VOICE_POOL}


def list_voices() -> tuple[VoiceProfile, ...]:
    """All voice profiles in display order. Stable, safe to expose to FE."""
    return _VOICE_POOL


def is_valid_voice_id(voice_id: str) -> bool:
    """True iff `voice_id` is one of the public IDs in the pool.

    The frontend mirrors `_VOICE_POOL` and only sends IDs from it, so
    this guard is mostly defense-in-depth against direct API consumers
    sending arbitrary strings (which would either 404 at ElevenLabs or
    burn quota on a voice we didn't intend to ship).
    """
    return voice_id in _VOICE_BY_ID


def voice_for_session(session_id: UUID) -> str:
    """Return a deterministic voice ID for `session_id` (fallback path).

    Pure function — same UUID always maps to the same voice. Used when
    the candidate skipped the picker so we still get diversity across
    sessions without forcing a UI choice. Whatever this returns is
    persisted on the session row so turn 2 reads the same value
    without re-deriving from the UUID (which would also give the same
    answer, but reading the column is the source of truth).
    """
    return _VOICE_POOL[session_id.int % len(_VOICE_POOL)].id
