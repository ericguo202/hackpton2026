"""
`users` — one row per Clerk-authenticated human.

Populated via two paths:
  1. `get_current_user_db` dep upserts on first authenticated API call, with
     only `clerk_user_id` set (email/name unknown because Clerk session JWTs
     don't carry them). `completed_registration` stays FALSE.
  2. `POST /onboarding` fills in profile fields and flips
     `completed_registration` to TRUE once the user submits the form.
"""

from datetime import datetime
from uuid import UUID

from sqlalchemy import CheckConstraint, Enum, String, Text, Boolean, text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base
from app.db.models.enums import ExperienceLevel


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

    created_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), nullable=False
    )
