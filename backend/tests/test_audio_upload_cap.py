"""
Unit tests for the bounded audio read in the turn-submission endpoint.

Guards H1 in code_review.md: `POST /sessions/{id}/turns` must reject an
oversized upload with 413 BEFORE the bytes can exhaust worker memory or be
forwarded to ElevenLabs STT. The cap is monkeypatched small here so we don't
allocate the real 50 MB ceiling.
"""

import io

import pytest
from fastapi import HTTPException, UploadFile, status

from app.api.v1.endpoints import sessions as ep


def _upload(data: bytes) -> UploadFile:
    return UploadFile(file=io.BytesIO(data), filename="answer.webm")


async def test_reads_audio_under_cap(monkeypatch):
    monkeypatch.setattr(ep, "_MAX_AUDIO_BYTES", 1024)
    monkeypatch.setattr(ep, "_AUDIO_CHUNK_SIZE", 256)
    payload = b"x" * 1000

    result = await ep._read_audio_bounded(_upload(payload))

    assert result == payload


async def test_reads_audio_at_exact_cap(monkeypatch):
    # The guard is `> cap`, so a payload exactly at the cap must pass.
    monkeypatch.setattr(ep, "_MAX_AUDIO_BYTES", 1024)
    monkeypatch.setattr(ep, "_AUDIO_CHUNK_SIZE", 256)
    payload = b"x" * 1024

    result = await ep._read_audio_bounded(_upload(payload))

    assert result == payload


async def test_rejects_audio_over_cap(monkeypatch):
    monkeypatch.setattr(ep, "_MAX_AUDIO_BYTES", 1024)
    monkeypatch.setattr(ep, "_AUDIO_CHUNK_SIZE", 256)
    payload = b"x" * 5000

    with pytest.raises(HTTPException) as exc:
        await ep._read_audio_bounded(_upload(payload))

    assert exc.value.status_code == status.HTTP_413_REQUEST_ENTITY_TOO_LARGE
