"""
Pydantic request / response shapes for `/api/v1/sessions` (and the
`/api/v1/me/stats` aggregate that piggy-backs on the same data).

The response wraps a `CompanyBrief` (from `app.services.company_research`) as
`CompanyBriefOut` so the HTTP layer doesn't leak internal service imports
into OpenAPI tooling and we have a stable JSON contract even if the service
model grows fields over time.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field


class SessionCreateIn(BaseModel):
    company: str = Field(min_length=1, max_length=200)
    job_title: str = Field(min_length=1, max_length=200)


class CompanyBriefOut(BaseModel):
    description: str
    headlines: list[str]
    values: list[str] = []


class SessionCreateOut(BaseModel):
    session_id: UUID
    summary: CompanyBriefOut
    first_question: str
    # `data:audio/mpeg;base64,...` — ready to drop into `<audio src>`.
    # Not persisted; regenerated on demand per CLAUDE.md (audio inline in
    # JSON, no S3).
    first_question_audio_url: str


class ScoresOut(BaseModel):
    directness: int
    star: int
    specificity: int
    impact: int
    conciseness: int
    # 6th dimension from browser webcam analytics. Null when the candidate
    # declined camera access; the UI hides the row in that case.
    delivery: int | None = None


class TurnSubmitOut(BaseModel):
    transcript: str
    scores: ScoresOut
    feedback: str
    filler_word_count: int
    filler_word_breakdown: dict[str, int]
    next_question: str | None
    next_question_audio_url: str | None
    is_final: bool


# ── History routes (GET /sessions, GET /sessions/{id}, GET /me/stats) ────────

# Per-dimension averages mirror the columns on `session_metrics`. All are
# nullable: a brand-new session may have no scored turns yet, and `delivery`
# is null whenever the candidate kept the camera off for every turn. The
# frontend trend chart drops null points instead of plotting them as zeros.
class DimensionAverages(BaseModel):
    directness: Decimal | None = None
    star: Decimal | None = None
    specificity: Decimal | None = None
    impact: Decimal | None = None
    conciseness: Decimal | None = None
    delivery: Decimal | None = None


class SessionListItem(BaseModel):
    """One row in the user's session-history list.

    Includes the cached per-dimension averages so the trend chart on the
    history page can render off a single `GET /sessions` response without
    fanning out to N detail calls.
    """

    id: UUID
    company: str
    job_title: str
    status: str
    overall_score: Decimal | None
    started_at: datetime | None
    ended_at: datetime | None
    created_at: datetime
    turns_evaluated: int
    total_filler_word_count: int | None
    averages: DimensionAverages


class TurnOut(BaseModel):
    """One scored turn inside `SessionDetailOut`.

    `cv_summary` is intentionally excluded from this payload — the per-frame
    webcam blob is stored for later analytics but the delivery score already
    captures the signal the UI needs. Add it later if a per-turn delivery
    breakdown becomes part of the demo.
    """

    id: UUID
    turn_number: int
    question_text: str
    transcript_text: str | None
    is_followup: bool
    scores: ScoresOut
    feedback: str | None
    filler_word_count: int
    filler_word_breakdown: dict[str, int]
    evaluated_at: datetime | None
    created_at: datetime


class SessionDetailOut(BaseModel):
    """Full session payload for the per-session results screen."""

    id: UUID
    company: str
    job_title: str
    status: str
    overall_score: Decimal | None
    started_at: datetime | None
    ended_at: datetime | None
    created_at: datetime
    # `interview_sessions.company_summary` is stored as serialized JSON.
    # We re-parse it here so the frontend gets the same `CompanyBriefOut`
    # shape it received from `POST /sessions`. May be null on legacy rows
    # or sessions where the brief failed to persist.
    summary: CompanyBriefOut | None
    turns: list[TurnOut]
    averages: DimensionAverages
    total_filler_word_count: int | None
    turns_evaluated: int


class MeStatsOut(BaseModel):
    """User-level rolling aggregates across all completed sessions.

    Powers a small profile/header strip on the history page (e.g.
    "5 sessions · avg STAR 7.2 · 38 filler words").
    """

    total_sessions: int
    completed_sessions: int
    total_turns_evaluated: int
    total_filler_word_count: int
    averages: DimensionAverages
    # Average of the per-session `overall_score` (0-100 scale) across all
    # completed sessions. Null until the user finishes their first session.
    average_overall_score: Decimal | None
