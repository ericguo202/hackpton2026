"""
Unit tests for the Ask Tutor service — the streamed tool-calling loop, the lean
system prompt, and the tool executors. The OpenRouter client is faked via the
`client=` injection point on `stream_tutor_reply` (no monkeypatch / network).
"""

import json
from decimal import Decimal
from types import SimpleNamespace

from app.db.models.enums import ExperienceLevel
from app.services.tutor import (
    REDIRECT_LINE,
    TutorContext,
    _fmt_score,
    build_tutor_system_prompt,
    run_tool,
    stream_tutor_reply,
)


# ── fakes ─────────────────────────────────────────────────────────────────────


class _AsyncStream:
    """Async-iterable wrapper over a list of streamed chunks."""

    def __init__(self, chunks):
        self._chunks = chunks

    def __aiter__(self):
        self._it = iter(self._chunks)
        return self

    async def __anext__(self):
        try:
            return next(self._it)
        except StopIteration:
            raise StopAsyncIteration


def _delta(content=None, tool_calls=None):
    return SimpleNamespace(
        choices=[SimpleNamespace(delta=SimpleNamespace(content=content, tool_calls=tool_calls))]
    )


def _tool_call(index, *, id=None, name=None, args=None):
    return SimpleNamespace(
        index=index,
        id=id,
        function=SimpleNamespace(name=name, arguments=args),
    )


def _make_client(rounds, captured=None):
    """Each call to create() returns the next scripted round's stream."""
    state = {"i": 0}

    async def _create(**kwargs):
        if captured is not None:
            captured.append(kwargs)
        chunks = rounds[state["i"]]
        state["i"] += 1
        return _AsyncStream(chunks)

    return SimpleNamespace(
        chat=SimpleNamespace(completions=SimpleNamespace(create=_create))
    )


def _raising_client(exc):
    async def _create(**kwargs):
        raise exc

    return SimpleNamespace(
        chat=SimpleNamespace(completions=SimpleNamespace(create=_create))
    )


def _ctx(**kw):
    base = dict(
        question="Tell me about a conflict.",
        transcript="I disagreed with my manager.",
        experience_level=ExperienceLevel.entry,
        category="Finance and Investment",
        target_role="Analyst",
        main_takeaway="Add the outcome.",
        scores={
            "Structure": Decimal("7"),
            "Problem-solving": Decimal("5"),
            "Impact": Decimal("4"),
            "Initiative": Decimal("6"),
            "Depth": Decimal("4"),
            "Delivery": None,
        },
        improvement_moments=[
            {
                "transcript_snippet": "I disagreed",
                "issue_type": "weak_wording",
                "why_this_weakened": "x",
                "how_to_strengthen": "y",
            }
        ],
        company_name="Acme",
        job_title="Analyst",
        company_description="Acme does things.",
        company_values=["integrity"],
        company_headlines=["raised funding"],
        role_signals=["ownership"],
        sample_question_themes=["conflict resolution"],
        short_bio="Bio here.",
        resume_excerpt="Resume excerpt.",
    )
    base.update(kw)
    return TutorContext(**base)


async def _collect(gen):
    return [event async for event in gen]


# ── system prompt ─────────────────────────────────────────────────────────────


def test_system_prompt_carries_lean_context():
    prompt = build_tutor_system_prompt(_ctx())
    assert REDIRECT_LINE in prompt
    assert "<interview_question>Tell me about a conflict.</interview_question>" in prompt
    assert "<candidate_answer>I disagreed with my manager.</candidate_answer>" in prompt
    assert "Add the outcome." in prompt
    assert "Analyst" in prompt
    assert "Finance and Investment" in prompt
    assert "entry" in prompt


def test_system_prompt_scores_line_and_not_scored():
    prompt = build_tutor_system_prompt(_ctx())
    assert "Structure 7" in prompt
    assert "Problem-solving 5" in prompt
    # Camera-off / failed dimensions never render a fake number.
    assert "Delivery not scored" in prompt


def test_system_prompt_omits_empty_optionals():
    prompt = build_tutor_system_prompt(
        _ctx(target_role=None, category=None, main_takeaway=None)
    )
    assert "Candidate target role:" not in prompt
    assert "Interview field / category:" not in prompt
    assert "Evaluator's main takeaway:" not in prompt


def test_fmt_score_formats():
    assert _fmt_score(None) == "not scored"
    assert _fmt_score(Decimal("7")) == "7"  # whole numbers drop the decimal
    assert _fmt_score(Decimal("6.5")) == "6.5"


# ── tool executors ────────────────────────────────────────────────────────────


def test_run_tool_improvement_moments():
    out = json.loads(run_tool(_ctx(), "get_improvement_moments"))
    assert out["improvement_moments"][0]["issue_type"] == "weak_wording"


def test_run_tool_company_research():
    out = json.loads(run_tool(_ctx(), "get_company_research"))
    assert out["description"] == "Acme does things."
    assert out["values"] == ["integrity"]
    assert out["role_signals"] == ["ownership"]
    assert out["sample_question_themes"] == ["conflict resolution"]


def test_run_tool_candidate_background():
    out = json.loads(run_tool(_ctx(), "get_candidate_background"))
    assert out["short_bio"] == "Bio here."
    assert out["resume_excerpt"] == "Resume excerpt."


def test_run_tool_unknown():
    out = json.loads(run_tool(_ctx(), "nope"))
    assert "error" in out


# ── streaming loop ────────────────────────────────────────────────────────────


async def test_stream_direct_answer_no_tool():
    rounds = [[_delta(content="Sure, "), _delta(content="here's how.")]]
    events = await _collect(
        stream_tutor_reply(_ctx(), [], "How am I doing?", client=_make_client(rounds))
    )
    assert events == [
        {"type": "token", "text": "Sure, "},
        {"type": "token", "text": "here's how."},
        {"type": "done"},
    ]


async def test_stream_tool_then_answer():
    captured: list = []
    rounds = [
        # Round 1: the model calls a tool.
        [
            _delta(
                tool_calls=[
                    _tool_call(0, id="call_1", name="get_company_research", args="{}")
                ]
            )
        ],
        # Round 2: the streamed final answer.
        [_delta(content="For Acme, "), _delta(content="lead with ownership.")],
    ]
    events = await _collect(
        stream_tutor_reply(
            _ctx(), [], "How do I prepare?", client=_make_client(rounds, captured)
        )
    )
    assert events[0] == {
        "type": "tool",
        "id": "call_1",
        "label": "Retrieving company brief",
    }
    assert {"type": "token", "text": "For Acme, "} in events
    assert events[-1] == {"type": "done"}

    # The 2nd model call must include the tool result + the assistant tool_call.
    second_messages = captured[1]["messages"]
    roles = [m["role"] for m in second_messages]
    assert "tool" in roles
    tool_msg = next(m for m in second_messages if m["role"] == "tool")
    assert "Acme does things." in tool_msg["content"]


async def test_stream_drops_tool_round_preamble():
    """Chatty narration emitted alongside a tool call must NOT reach the user;
    only the final round's content is shown."""
    rounds = [
        # Round 1: the model narrates AND calls a tool in the same response.
        [
            _delta(content="Great question — let me pull up "),
            _delta(content="the company brief."),
            _delta(
                tool_calls=[
                    _tool_call(0, id="call_1", name="get_company_research", args="{}")
                ]
            ),
        ],
        # Round 2: the real answer.
        [_delta(content="Lead with ownership.")],
    ]
    events = await _collect(
        stream_tutor_reply(_ctx(), [], "How do I prepare?", client=_make_client(rounds))
    )
    texts = [e["text"] for e in events if e["type"] == "token"]
    # The preamble is gone; only the final answer streamed.
    assert texts == ["Lead with ownership."]
    assert not any("let me pull up" in t for t in texts)
    assert events[-1] == {"type": "done"}


async def test_stream_passes_tools_and_disables_reasoning():
    captured: list = []
    rounds = [[_delta(content="hi")]]
    await _collect(
        stream_tutor_reply(_ctx(), [], "hi", client=_make_client(rounds, captured))
    )
    kwargs = captured[0]
    assert kwargs["stream"] is True
    assert kwargs["extra_body"] == {"reasoning": {"enabled": False}}
    names = {t["function"]["name"] for t in kwargs["tools"]}
    assert names == {
        "get_improvement_moments",
        "get_company_research",
        "get_candidate_background",
    }


async def test_stream_includes_history_and_message():
    captured: list = []
    rounds = [[_delta(content="ok")]]
    history = [
        {"role": "user", "content": "earlier q"},
        {"role": "assistant", "content": "earlier a"},
    ]
    await _collect(
        stream_tutor_reply(_ctx(), history, "new q", client=_make_client(rounds, captured))
    )
    messages = captured[0]["messages"]
    assert messages[0]["role"] == "system"
    assert {"role": "user", "content": "earlier q"} in messages
    assert {"role": "assistant", "content": "earlier a"} in messages
    assert messages[-1] == {"role": "user", "content": "new q"}


async def test_stream_fails_soft_on_client_error():
    events = await _collect(
        stream_tutor_reply(
            _ctx(), [], "hi", client=_raising_client(RuntimeError("boom"))
        )
    )
    assert len(events) == 1
    assert events[0]["type"] == "error"
