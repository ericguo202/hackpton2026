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
    # Active role (conditions downstream prompts + default session job_title) and
    # the full declared set it belongs to (1 required + up to 2 optional).
    target_role: str | None
    target_roles: list[str]
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
    # Successful Ask Tutor chat completions used today (free tier capped at 10).
    # Rolled over to today's local date by GET /me so the client can disable the
    # composer / show the "N left today" hint without a wasted send.
    daily_chat_count: int
    delivery_analytics_consent_at: datetime | None
    delivery_analytics_consent_version: int | None
    delivery_analytics_revoked_at: datetime | None
    # Server-side proof of consent for face/delivery calibration. The calibration
    # profile stays on-device; this versioned record is what makes consent
    # demonstrable and per-user. A stale `consent_version` re-prompts on /calibrate.
    face_calibration_consent_at: datetime | None
    face_calibration_consent_version: int | None
    face_calibration_revoked_at: datetime | None
    # Clickwrap acceptance record (version + timestamp per policy). NULL until the
    # user accepts the current version; the frontend gate re-prompts on a mismatch.
    terms_accepted_version: int | None
    terms_accepted_at: datetime | None
    privacy_accepted_version: int | None
    privacy_accepted_at: datetime | None
    created_at: datetime
    updated_at: datetime


class ActiveTargetRoleIn(BaseModel):
    """Home role switcher: re-point the active `target_role` at a stored role.

    The value must already be a member of the caller's `target_roles` (the set
    was vetted at onboarding), so the endpoint validates membership rather than
    re-moderating.
    """

    target_role: str


class DeliveryAnalyticsConsentIn(BaseModel):
    notice_version: int
    accepted: bool


class FaceCalibrationConsentIn(BaseModel):
    notice_version: int
    accepted: bool


class PolicyAcceptanceIn(BaseModel):
    """Affirmative acceptance of the current Terms of Service + Privacy Policy."""

    terms_version: int
    privacy_version: int
    accepted: bool
