"""`create_chat_with_fallback` — empty-content retry + existing exception fallback.

An HTTP-200 response whose message content is empty (a provider ignoring a
reasoning-disable flag can burn the whole max_tokens budget on leaked
reasoning) must advance to the fallback model instead of being returned as a
"success". The LAST model's response is returned even if empty so every
caller keeps its own fail-soft policy.
"""

from types import SimpleNamespace

import pytest

from app.services._openrouter import _has_empty_content, create_chat_with_fallback


def _response(content):
    return SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=content))]
    )


class _FakeClient:
    """Returns/raises per-model outcomes and records the models tried."""

    def __init__(self, outcomes_by_model):
        self._outcomes = outcomes_by_model
        self.models_called: list[str] = []
        self.chat = SimpleNamespace(
            completions=SimpleNamespace(create=self._create)
        )

    async def _create(self, **kwargs):
        model = kwargs["model"]
        self.models_called.append(model)
        outcome = self._outcomes[model]
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


async def test_empty_content_falls_back_to_next_model():
    client = _FakeClient({
        "primary": _response(""),
        "fallback": _response('{"more_followup": true}'),
    })
    response = await create_chat_with_fallback(
        client, models=("primary", "fallback"), messages=[]
    )
    assert client.models_called == ["primary", "fallback"]
    assert response.choices[0].message.content == '{"more_followup": true}'


async def test_whitespace_and_none_content_count_as_empty():
    for empty in ("   \n", None):
        client = _FakeClient({
            "primary": _response(empty),
            "fallback": _response("ok"),
        })
        response = await create_chat_with_fallback(
            client, models=("primary", "fallback"), messages=[]
        )
        assert client.models_called == ["primary", "fallback"]
        assert response.choices[0].message.content == "ok"


async def test_nonempty_content_returns_without_fallback():
    client = _FakeClient({
        "primary": _response("a real answer"),
        "fallback": _response("never reached"),
    })
    response = await create_chat_with_fallback(
        client, models=("primary", "fallback"), messages=[]
    )
    assert client.models_called == ["primary"]
    assert response.choices[0].message.content == "a real answer"


async def test_last_model_empty_content_is_returned_not_raised():
    # Callers' fail-soft policies (fallback question / False decision / null
    # scores) own the empty-string case — the wrapper must not raise.
    client = _FakeClient({
        "primary": _response(""),
        "fallback": _response(""),
    })
    response = await create_chat_with_fallback(
        client, models=("primary", "fallback"), messages=[]
    )
    assert client.models_called == ["primary", "fallback"]
    assert response.choices[0].message.content == ""


async def test_exception_still_falls_back_then_last_exception_propagates():
    client = _FakeClient({
        "primary": RuntimeError("primary down"),
        "fallback": RuntimeError("fallback down"),
    })
    with pytest.raises(RuntimeError, match="fallback down"):
        await create_chat_with_fallback(
            client, models=("primary", "fallback"), messages=[]
        )
    assert client.models_called == ["primary", "fallback"]


def test_has_empty_content_is_defensive_on_odd_shapes():
    # Unexpected response shapes must count as NON-empty so they flow to the
    # caller's own parsing instead of being swallowed by the retry.
    assert _has_empty_content(SimpleNamespace(choices=[])) is False
    assert _has_empty_content(SimpleNamespace()) is False
    assert _has_empty_content(None) is False
    assert _has_empty_content(_response("")) is True
    assert _has_empty_content(_response("text")) is False
