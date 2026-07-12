"""
`users` — one row per Clerk-authenticated human.

Populated via two paths:
  1. `get_current_user_db` dep upserts on first authenticated API call, with
     only `clerk_user_id` set (email/name unknown because Clerk session JWTs
     don't carry them). `completed_registration` stays FALSE.
  2. `POST /onboarding` fills in profile fields and flips
     `completed_registration` to TRUE once the user submits the form.
"""

from datetime import date, datetime
from uuid import UUID

from sqlalchemy import Date, DateTime, Enum, Integer, Text, Boolean, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base
from app.db.models.enums import ExperienceLevel, UserTier


class User(Base):
    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )

    # Stable Clerk user id ("user_2abc..."). Upsert key.
    clerk_user_id: Mapped[str] = mapped_column(Text, unique=True, nullable=False)

    # Nullable because Clerk session JWTs don't include email — we learn it at
    # onboarding time or via the Clerk Backend API (not wired yet).
    email: Mapped[str | None] = mapped_column(Text, unique=True, nullable=True)
    name: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Personalization fields, filled during onboarding.
    resume_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    industry: Mapped[str | None] = mapped_column(Text, nullable=True)
    # `target_role` is the candidate's ACTIVE role — it conditions every
    # downstream prompt (opening question, tutor, custom-question validation)
    # and is the default `job_title` for new sessions. `target_roles` holds the
    # full set the candidate declared (1 required + up to 2 optional, max 3);
    # `target_role` is always one member of it. Onboarding writes both; the Home
    # role switcher (`PUT /me/target-role`) re-points `target_role` at another
    # member without re-moderating (the set was vetted at onboarding). Always
    # REASSIGNED, never mutated in place, so SQLAlchemy dirty-tracking fires.
    target_role: Mapped[str | None] = mapped_column(Text, nullable=True)
    target_roles: Mapped[list[str]] = mapped_column(
        JSONB, nullable=False, server_default=text("'[]'::jsonb")
    )
    experience_level: Mapped[ExperienceLevel | None] = mapped_column(
        Enum(ExperienceLevel, name="experience_level", create_type=False),
        nullable=True,
    )
    short_bio: Mapped[str | None] = mapped_column(Text, nullable=True)

    completed_registration: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("FALSE")
    )

    # Subscription tier. Free users are capped at 5 completed sessions per
    # local calendar day; Pro users are unmetered. Defaults to free at
    # signup so new rows behave correctly without a manual stamp.
    tier: Mapped[UserTier] = mapped_column(
        Enum(UserTier, name="user_tier", create_type=False),
        nullable=False,
        server_default=text("'free'"),
    )

    # Daily session counter — increments on session finalization (NOT on
    # session create). Reset lazily inside `daily_limit.check_and_reset` /
    # `daily_limit.increment` via a single atomic UPDATE that flips the
    # count back to 0/1 the first time the user is seen on a new local day.
    daily_session_count: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("0")
    )
    # Local-calendar date the counter was last stamped on. NULL until the
    # user creates their first session. Compared against `_today_in_tz`
    # using the user's stored IANA `timezone` (UTC fallback when missing).
    count_reset_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Ask Tutor analogue of the session counter above. Free users get 10
    # SUCCESSFUL chat completions (not sent messages) per local calendar day;
    # the counter increments only when the LLM responds successfully (see
    # `daily_limit.record_chat_completion`) and resets lazily on a new local
    # day, keyed on the same `timezone`. `chat_count_reset_date` is NULL until
    # the user's first chat.
    daily_chat_count: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("0")
    )
    chat_count_reset_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    # IANA name (e.g. "America/New_York"). Populated from the browser on
    # each session-create — we trust the latest client value, fall back to
    # UTC for any parse error so a missing/malformed TZ never blocks a
    # legitimate session.
    timezone: Mapped[str | None] = mapped_column(Text, nullable=True)

    # The candidate's 3 most recent opening questions (newest-first), used
    # as an avoid-list when generating the next one so the model stops
    # converging on the same attractor question across sessions. Global
    # scope (across all companies) since opening questions are
    # role/experience-driven, not company-driven. Reset to [] whenever
    # target_role / industry / experience_level change (in the onboarding
    # endpoint) because those fields define the shape of the questions, so
    # old questions stop being relevant once the profile shifts. Always
    # REASSIGNED (never mutated in place) so SQLAlchemy dirty-tracking fires
    # without a MutableList wrapper.
    recent_opening_questions: Mapped[list[str]] = mapped_column(
        JSONB, nullable=False, server_default=text("'[]'::jsonb")
    )

    # Server-side proof of consent for practice delivery analytics. This is
    # separate from browser-local calibration consent: calibration never leaves
    # the device, while `interview_turns.cv_summary` is persisted on our server.
    delivery_analytics_consent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    delivery_analytics_consent_version: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )
    delivery_analytics_revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Server-side proof of consent for face/delivery calibration. The calibration
    # PROFILE itself never leaves the device (and is now namespaced per Clerk user
    # in localStorage), but the consent record lives here so it is demonstrable
    # (GDPR Art. 7(1) / BIPA) and so it cannot leak across accounts that share a
    # browser. `consent_version` drives re-consent: bumping
    # FACE_CALIBRATION_NOTICE_VERSION invalidates the old record, the
    # `/calibrate` gate re-prompts, and the stale local baseline is cleared.
    face_calibration_consent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    face_calibration_consent_version: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )
    face_calibration_revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Clickwrap acceptance record — the per-version, timestamped proof that the
    # user affirmatively agreed to the current Terms of Service and Privacy
    # Policy. NULL means "has not accepted the current version", which the forced
    # acceptance gate uses to (re-)prompt. The CURRENT_* constants live in
    # `app/services/policy_versions.py` (mirrored in the frontend); bump a
    # constant when a policy materially changes to force renewed acceptance.
    terms_accepted_version: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )
    terms_accepted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    privacy_accepted_version: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )
    privacy_accepted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), nullable=False
    )
