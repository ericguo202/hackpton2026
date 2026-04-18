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
