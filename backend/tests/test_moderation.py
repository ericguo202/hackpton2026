"""
Unit tests for content moderation fail-closed behavior.

Guards M2 in code_review.md: moderation is a critical security step, so any
failure (transport error, missing API key) must FAIL CLOSED — raise
`ModerationUnavailableError` rather than returning a permissive verdict — and
surface the outage as an error incident. A missing key must also fail the boot
check.
"""

from types import SimpleNamespace

import pytest

from app.services import moderation as mod
from app.services.moderation import (
    ModerationUnavailableError,
    check_moderation,
    ensure_moderation_configured,
)


class _FakeCategories:
    """Mimics the OpenAI SDK `categories` pydantic object (`.model_dump()`)."""

    def __init__(self, tripped: dict[str, bool]):
        self._tripped = tripped

    def model_dump(self) -> dict[str, bool]:
        return self._tripped


def _fake_client(*, raises: Exception | None = None, categories: dict | None = None):
    """Build a stand-in AsyncOpenAI whose `.moderations.create` is awaitable."""

    async def _create(*, model, input):  # noqa: A002 - mirror SDK kwarg name
        if raises is not None:
            raise raises
        result = SimpleNamespace(categories=_FakeCategories(categories or {}))
        return SimpleNamespace(results=[result])

    return SimpleNamespace(moderations=SimpleNamespace(create=_create))


@pytest.fixture(autouse=True)
def _no_incidents(monkeypatch):
    """Stub both incident writers so tests never touch the DB.

    Returns the list of `log_error` (alert) calls so a test can assert the
    fail-closed path raised the outage alert.
    """
    alert_calls: list = []

    async def _log_error(exc, **kwargs):
        alert_calls.append((exc, kwargs))

    async def _log_moderation_request(**kwargs):
        return None

    monkeypatch.setattr(mod, "log_error", _log_error)
    monkeypatch.setattr(mod, "log_moderation_request", _log_moderation_request)
    return alert_calls


async def test_empty_text_is_safe_without_network(monkeypatch):
    # Should not even construct a client for empty/whitespace input.
    def _boom():
        raise AssertionError("_get_client must not be called for empty text")

    monkeypatch.setattr(mod, "_get_client", _boom)

    result = await check_moderation("   ")

    assert result is mod._SAFE


async def test_call_error_raises_unavailable(monkeypatch, _no_incidents):
    monkeypatch.setattr(
        mod, "_get_client", lambda: _fake_client(raises=RuntimeError("boom"))
    )

    with pytest.raises(ModerationUnavailableError):
        await check_moderation("some user content")

    # Failing closed must emit exactly one error-incident alert.
    assert len(_no_incidents) == 1


async def test_missing_key_raises_unavailable(monkeypatch, _no_incidents):
    # No key configured + no cached client → _get_client raises, fail closed.
    monkeypatch.setattr(mod.settings, "OPENAI_API_KEY", "")
    monkeypatch.setattr(mod, "_client", None)

    with pytest.raises(ModerationUnavailableError):
        await check_moderation("some user content")

    assert len(_no_incidents) == 1


async def test_unflagged_content_passes(monkeypatch):
    monkeypatch.setattr(
        mod,
        "_get_client",
        lambda: _fake_client(categories={"harassment": False, "hate": False}),
    )

    result = await check_moderation("I led a project under a tight deadline.")

    assert result.flagged is False


async def test_hard_block_category_flags(monkeypatch):
    # "hate" is in _HARD_BLOCK_CATEGORIES → flagged.
    monkeypatch.setattr(
        mod,
        "_get_client",
        lambda: _fake_client(categories={"hate": True, "harassment": False}),
    )

    result = await check_moderation("nasty content")

    assert result.flagged is True
    assert "hate" in result.categories


async def test_non_hard_block_category_does_not_flag(monkeypatch):
    # "harassment" (non-threatening) is advisory only → reported but not blocking.
    monkeypatch.setattr(
        mod,
        "_get_client",
        lambda: _fake_client(categories={"harassment": True, "hate": False}),
    )

    result = await check_moderation("mildly rude content")

    assert result.flagged is False
    assert "harassment" in result.categories


def test_ensure_configured_raises_without_key(monkeypatch):
    monkeypatch.setattr(mod.settings, "OPENAI_API_KEY", "")
    monkeypatch.setattr(mod, "_client", None)

    with pytest.raises(RuntimeError):
        ensure_moderation_configured()


def test_ensure_configured_ok_with_key(monkeypatch):
    monkeypatch.setattr(mod.settings, "OPENAI_API_KEY", "sk-test")
    monkeypatch.setattr(mod, "_client", None)

    # Should construct the client without raising.
    ensure_moderation_configured()
    assert mod._client is not None
