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

from sqlalchemy import Date, Enum, Integer, Text, Boolean, text
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
    target_role: Mapped[str | None] = mapped_column(Text, nullable=True)
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
    # IANA name (e.g. "America/New_York"). Populated from the browser on
    # each session-create — we trust the latest client value, fall back to
    # UTC for any parse error so a missing/malformed TZ never blocks a
    # legitimate session.
    timezone: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), nullable=False
    )
