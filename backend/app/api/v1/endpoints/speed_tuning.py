"""
Speed-tuning helper — TEMPORARY local tool for fine-tuning per-voice TTS pace.

Background: the "Normal" (1.1) / "Slower" (0.9) speech-speed toggle from PR 95
sends one flat `voice_settings.speed` for every ElevenLabs voice, but 1.1 reads
very differently across voices (the Korean voice still drags, the Indian voice
races). To pick a per-voice Normal/Slower constant we need to hear the same
sentence at an arbitrary speed for a chosen voice — this endpoint does exactly
that and nothing else.

`POST /api/v1/speed-tuning/preview { voice_id, speed }` synthesizes a fixed
paragraph at the requested speed and returns the base64 audio URL, reusing
`tts.synthesize_speech`. There is no persistence and no session — it's a bench.

STATUS: parked, NOT wired. The per-voice Normal/Slower constants now live on
`voice_pool.VoiceProfile`, so this router is intentionally not registered in
`app/api/v1/router.py` (and the `/speed` frontend page is unrouted). Both are
kept for the next time voices are added/retuned — to use it again, re-add the
`include_router(speed_tuning.router, prefix="/speed-tuning", ...)` line and the
`/speed` <Route> in `App.tsx`.
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.core.auth import get_current_user_db
from app.db.models.user import User
from app.services import tts

router = APIRouter()

# The paragraph is spoken verbatim for every preview so pace comparisons across
# voices/speeds are apples-to-apples. Long enough to feel the cadence, short
# enough to iterate quickly.
TUNING_TEXT = (
    "Our ElevenLabs interviewer voices were reading noticeably slower than the "
    "same voices on the ElevenLabs website. Cause: our TTS request sent no "
    "voice_settings, so the API fell back to each voice's stored (slow) "
    "settings rather than the brisker pace the playground applies. This adds "
    "an explicit pace and a user-facing toggle."
)


class SpeedPreviewIn(BaseModel):
    voice_id: str = Field(..., min_length=1)
    # Same quality-safe window ElevenLabs supports; `clamp_speed` re-clamps
    # server-side so a hand-edited request can never degrade the audio.
    speed: float = Field(..., ge=tts.MIN_SPEED, le=tts.MAX_SPEED)


class SpeedPreviewOut(BaseModel):
    voice_id: str
    speed: float
    text: str
    audio_url: str


@router.post("/preview", response_model=SpeedPreviewOut)
async def preview_speed(
    payload: SpeedPreviewIn,
    _user: User = Depends(get_current_user_db),
) -> SpeedPreviewOut:
    """Synthesize the tuning paragraph for one voice at one speed."""
    clamped = tts.clamp_speed(payload.speed)
    audio_url = await tts.synthesize_speech(
        TUNING_TEXT, voice_id=payload.voice_id, speed=clamped
    )
    return SpeedPreviewOut(
        voice_id=payload.voice_id,
        speed=clamped,
        text=TUNING_TEXT,
        audio_url=audio_url,
    )
