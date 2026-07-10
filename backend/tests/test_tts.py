"""
Unit tests for tts.synthesize_speech — httpx call fully mocked.
"""

import base64
from types import SimpleNamespace

import pytest

from app.services import tts
from app.services.tts import synthesize_speech


_FAKE_MP3 = b"\x00\xff\xfeMP3BYTES\x10\x20\x30"


def _mock_elevenlabs(monkeypatch, content: bytes, status: int = 200) -> dict:
    """Patch httpx POST and return a dict that captures the last request body."""
    captured: dict = {}

    async def _fake_post(self, *args, **kwargs):
        captured["json"] = kwargs.get("json")

        def _raise():
            if status >= 400:
                raise RuntimeError(f"HTTP {status}")

        return SimpleNamespace(
            status_code=status,
            content=content,
            raise_for_status=_raise,
        )

    monkeypatch.setattr("httpx.AsyncClient.post", _fake_post)
    return captured


async def test_synthesize_returns_data_url(monkeypatch):
    monkeypatch.setattr(tts.settings, "ELEVENLABS_API_KEY", "test-key")
    monkeypatch.setattr(tts.settings, "ELEVENLABS_VOICE_ID", "test-voice")
    captured = _mock_elevenlabs(monkeypatch, _FAKE_MP3)

    data_url = await synthesize_speech("Hello.")

    assert data_url.startswith("data:audio/mpeg;base64,")
    decoded = base64.b64decode(data_url.split(",", 1)[1])
    assert decoded == _FAKE_MP3
    # Default pace is sent as voice_settings.speed so the voice isn't sluggish.
    assert captured["json"]["voice_settings"]["speed"] == tts.DEFAULT_SPEED


async def test_synthesize_sends_and_clamps_speed(monkeypatch):
    monkeypatch.setattr(tts.settings, "ELEVENLABS_API_KEY", "test-key")
    monkeypatch.setattr(tts.settings, "ELEVENLABS_VOICE_ID", "test-voice")
    captured = _mock_elevenlabs(monkeypatch, _FAKE_MP3)

    await synthesize_speech("Hello.", speed=tts.SLOWER_SPEED)
    assert captured["json"]["voice_settings"]["speed"] == tts.SLOWER_SPEED

    # Out-of-range values are clamped to the ElevenLabs-supported band.
    await synthesize_speech("Hello.", speed=5.0)
    assert captured["json"]["voice_settings"]["speed"] == tts.MAX_SPEED
    await synthesize_speech("Hello.", speed=0.1)
    assert captured["json"]["voice_settings"]["speed"] == tts.MIN_SPEED


async def test_missing_api_key_raises(monkeypatch):
    monkeypatch.setattr(tts.settings, "ELEVENLABS_API_KEY", None)
    monkeypatch.setattr(tts.settings, "ELEVENLABS_VOICE_ID", "test-voice")

    with pytest.raises(RuntimeError, match="ELEVENLABS_API_KEY"):
        await synthesize_speech("Hello.")


async def test_missing_voice_id_raises(monkeypatch):
    monkeypatch.setattr(tts.settings, "ELEVENLABS_API_KEY", "test-key")
    monkeypatch.setattr(tts.settings, "ELEVENLABS_VOICE_ID", None)

    with pytest.raises(RuntimeError, match="ELEVENLABS_VOICE_ID"):
        await synthesize_speech("Hello.")
