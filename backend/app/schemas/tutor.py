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
    # The candidate's new message.
    message: str = Field(min_length=1, max_length=2000)
    # Prior conversation (text only), oldest-first. Capped so a client can't
    # push an unbounded prompt.
    history: list[TutorHistoryItem] = Field(default_factory=list, max_length=40)
    # An "Ask about this" transcript snippet the user attached. Folded into the
    # message the model sees so it knows which part they're referring to.
    context_snippet: str | None = Field(default=None, max_length=2000)
