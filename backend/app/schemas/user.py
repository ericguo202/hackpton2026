"""Pydantic response shapes for the `users` resource."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.db.models.enums import ExperienceLevel, UserTier


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
    # Transient (not a DB column): True when this pre-onboarding caller's email
    # is already claimed by a DIFFERENT users row. Stamped onto the ORM instance
    # by `GET /me`; defaults False so the normal path and older callers are
    # unaffected. Lets the frontend block onboarding before the form (instead of
    # surfacing the late 409 from the onboarding UNIQUE(email) commit).
    email_conflict: bool = False
    tier: UserTier
    daily_session_count: int
    created_at: datetime
    updated_at: datetime
