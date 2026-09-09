"""
Request shape for the Ask Tutor chat (`POST
/api/v1/sessions/{id}/turns/{turn_id}/tutor`).

The conversation is ephemeral — the backend persists nothing — so the client
sends the running history with each message. History is text-only and capped:
tool results are re-fetched on demand inside the loop, never echoed back, which
keeps the model's context lean (the whole point for a Flash-tier model).

The response is an SSE stream (`text/event-stream`), not JSON, so there's no
response model here.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class TutorHistoryItem(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class TutorMessageIn(BaseModel):
    # The candidate's new message. Tightly capped — real tutor questions are
    # short, and every message costs LLM tokens, so 300 chars bounds abuse.
    # Mirrors the client cap (`MAX_MESSAGE_CHARS` in AskTutorChat.tsx). The
    # attached `context_snippet` is deliberately a separate, larger field and is
    # NOT counted toward this limit.
    message: str = Field(min_length=1, max_length=300)
    # Prior conversation (text only), oldest-first. Capped so a client can't
    # push an unbounded prompt.
    history: list[TutorHistoryItem] = Field(default_factory=list, max_length=40)
    # An "Ask about this" transcript snippet the user attached. Folded into the
    # message the model sees so it knows which part they're referring to. Carries
    # a transcript excerpt (not user-typed input), so it keeps its larger cap.
    context_snippet: str | None = Field(default=None, max_length=2000)


class GeneralTutorMessageIn(BaseModel):
    """Request body for the general coach (`POST /api/v1/tutor`).

    Same ephemeral contract as `TutorMessageIn` — the client re-sends the running
    history each time — with two differences. The message cap is larger (a
    general question names companies, assessments and sources: "how do I prepare
    for the IBM behavioral online assessment, and what do candidates report on
    Reddit?" doesn't fit in 300 chars), and there is no `context_snippet` because
    there is no transcript to point at.
    """

    # Mirrors `MAX_GENERAL_MESSAGE_CHARS` in frontend/src/types/tutor.ts.
    message: str = Field(min_length=1, max_length=1000)
    history: list[TutorHistoryItem] = Field(default_factory=list, max_length=40)
