"""
Pydantic request / response shapes for `/api/v1/saved-questions`.

A saved question is a frozen opening-question scenario the candidate can
re-practice. These shapes reuse `CompanyBriefOut`, `ScoresOut`, and the
`Decimal`-as-string wire convention from `schemas/session.py` so the frontend
chart code can share helpers with the History page.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.session import CompanyBriefOut, ScoresOut
from app.services.voice_pool import DEFAULT_PACE, SpeechPace


class SavedQuestionCreateIn(BaseModel):
    """Save an opening question of an existing completed session.

    `turn_id` targets a specific opening turn — story-block interviews have
    more than one opening (turn 1 plus a fresh opening at each block pivot),
    and any of them is savable. Omitted → the session's first opening (turn 1),
    preserving the pre-story-block behavior. Follow-up turns are rejected
    server-side (only openings are savable).
    """

    session_id: UUID
    turn_id: UUID | None = None


class RePracticeIn(BaseModel):
    """Start a fresh practice attempt of a saved question.

    Same optional knobs as `SessionCreateIn` (voice + speech pace + timezone);
    company / job_title / question come frozen off the saved row, so they're
    absent here.
    """

    voice_id: str | None = Field(default=None, max_length=64)
    # Per-session interview-voice pace, same "Normal" (default) / "Slower"
    # choice as `SessionCreateIn`. Resolved to a per-voice `voice_settings.speed`
    # server-side via `voice_pool.resolve_speed`.
    speech_pace: SpeechPace = DEFAULT_PACE
    timezone: str | None = Field(default=None, max_length=64)


class SavedQuestionOut(BaseModel):
    """A saved question row (returned from the save endpoint)."""

    id: UUID
    question_text: str
    company: str
    job_title: str
    created_at: datetime


class SavedQuestionListItem(BaseModel):
    """One row in the History "Saved questions" section.

    Aggregates are computed over the linked practice sessions. `avg_overall_score`
    excludes sessions whose evaluation never completed (null overall), so a
    failed attempt never drags the average toward 0.
    """

    id: UUID
    question_text: str
    company: str
    job_title: str
    created_at: datetime
    attempt_count: int
    last_practiced_at: datetime | None
    avg_overall_score: Decimal | None


class SavedQuestionAttempt(BaseModel):
    """One practice attempt (a linked session) on the detail page.

    `turn1_scores` is the opening turn's per-dimension scores — the true
    same-question comparison line. `evaluation_failed` is True when turn 1's
    eval never landed (null scores); the frontend shows a marker and drops the
    point from the trend rather than plotting a zero.

    `status` is the session's lifecycle state (e.g. `in_progress` / `completed`).
    Because evaluation finalizes in a background task, a freshly-created
    re-practice attempt can be linked here while still scoring — in which case
    `evaluation_failed` is True only because scores haven't landed YET. The
    frontend uses `status` to show "Scoring in progress" instead of the
    misleading "Evaluation failed" until the session completes.
    """

    session_id: UUID
    created_at: datetime
    status: str
    overall_score: Decimal | None
    turn1_scores: ScoresOut | None
    evaluation_failed: bool


class SavedQuestionDetailOut(BaseModel):
    """Full payload for the `/saved-question/:id` progress page."""

    id: UUID
    question_text: str
    company: str
    job_title: str
    category: str | None
    created_at: datetime
    summary: CompanyBriefOut | None
    attempts: list[SavedQuestionAttempt]
