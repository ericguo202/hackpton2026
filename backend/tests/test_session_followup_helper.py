"""Regression tests for the `_followup_and_tts` endpoint helper.

Guards the `jd_summary` threading contract: `submit_turn` calls
`_followup_and_tts(..., jd_summary=jd_summary)` on every non-final turn, so the
helper MUST accept the kwarg and forward it to `generate_followup_transition`. A
missing param here is not a soft failure — it's a `TypeError` on every
non-final turn.
"""

from app.api.v1.endpoints import sessions as sessions_module
from app.services.followup import GeneratedQuestion


async def test_followup_and_tts_forwards_jd_summary(monkeypatch):
    """The pasted-JD role facts reach `generate_followup_transition` so a
    follow-up is grounded in how the role actually operates (e.g. solo vs.
    collaborative)."""
    captured: dict = {}

    async def _fake_generate_followup_transition(question, transcript, **kwargs):
        captured.update(kwargs)
        return GeneratedQuestion(question="How did you make that call on your own?")

    async def _fake_tts(text, *, voice_id, speed=None):
        return "data:audio/mp3;base64,AAAA"

    monkeypatch.setattr(
        sessions_module,
        "generate_followup_transition",
        _fake_generate_followup_transition,
    )
    monkeypatch.setattr(sessions_module, "synthesize_speech", _fake_tts)

    next_q, audio_url = await sessions_module._followup_and_tts(
        "Tell me about a hard decision.",
        "I decided to cut the feature myself.",
        "voice-1",
        jd_summary=["Solo individual-contributor role — no team"],
    )

    assert next_q == "How did you make that call on your own?"
    assert audio_url == "data:audio/mp3;base64,AAAA"
    assert captured["jd_summary"] == ["Solo individual-contributor role — no team"]


async def test_followup_and_tts_defaults_jd_summary_to_none(monkeypatch):
    """No pasted JD (the common case) forwards `jd_summary=None` — the
    empty-omission path in `generate_followup_transition` leaves the prompt
    unchanged."""
    captured: dict = {}

    async def _fake_generate_followup_transition(question, transcript, **kwargs):
        captured.update(kwargs)
        return GeneratedQuestion(question="What happened next?")

    async def _fake_tts(text, *, voice_id, speed=None):
        return "data:audio/mp3;base64,AAAA"

    monkeypatch.setattr(
        sessions_module,
        "generate_followup_transition",
        _fake_generate_followup_transition,
    )
    monkeypatch.setattr(sessions_module, "synthesize_speech", _fake_tts)

    await sessions_module._followup_and_tts("Q?", "A.", "voice-1")

    assert captured["jd_summary"] is None


async def test_followup_and_tts_speaks_bridge_but_returns_question(monkeypatch):
    captured: dict = {}

    async def _fake_generate_followup_transition(question, transcript, **kwargs):
        return GeneratedQuestion(
            spoken_bridge="The testing cleanup detail is useful context.",
            question="In that testing cleanup, how did you trace the root cause?",
        )

    async def _fake_tts(text, *, voice_id, speed=None):
        captured["tts_text"] = text
        return "data:audio/mp3;base64,AAAA"

    monkeypatch.setattr(
        sessions_module,
        "generate_followup_transition",
        _fake_generate_followup_transition,
    )
    monkeypatch.setattr(sessions_module, "synthesize_speech", _fake_tts)

    next_q, audio_url = await sessions_module._followup_and_tts(
        "Tell me about a debugging issue.",
        "I cleaned up test users and caused a Clerk mismatch.",
        "voice-1",
    )

    assert next_q == "In that testing cleanup, how did you trace the root cause?"
    assert captured["tts_text"] == (
        "The testing cleanup detail is useful context. "
        "In that testing cleanup, how did you trace the root cause?"
    )
    assert audio_url == "data:audio/mp3;base64,AAAA"
