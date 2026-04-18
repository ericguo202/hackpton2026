"""
Pydantic request / response shapes for `POST /api/v1/sessions`.

The response wraps a `CompanyBrief` (from `app.services.company_research`) as
`CompanyBriefOut` so the HTTP layer doesn't leak internal service imports
into OpenAPI tooling and we have a stable JSON contract even if the service
model grows fields over time.
"""

from __future__ import annotations

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
