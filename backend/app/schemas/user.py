"""Pydantic response shapes for the `users` resource."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.db.models.enums import ExperienceLevel


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    clerk_user_id: str
    email: str | None
    name: str | None
    industry: str | None
    target_role: str | None
    experience_level: ExperienceLevel | None
    short_bio: str | None
    resume_text: str | None
    completed_registration: bool
    created_at: datetime
    updated_at: datetime
