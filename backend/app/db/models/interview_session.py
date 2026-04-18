"""
`interview_sessions` — one row per mock interview attempt.

`company` / `job_title` are denormalized from the linked config so that
editing a config later doesn't mutate historical session records.

`overall_score` uses a 0-100 percent scale (aggregate), NOT the 0-10 scale
used on per-turn score columns. Frontend must rescale when displaying.
"""

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import CheckConstraint, Enum, ForeignKey, Numeric, Text, text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base
from app.db.models.enums import SessionStatus


class InterviewSession(Base):
    __tablename__ = "interview_sessions"
    __table_args__ = (
        CheckConstraint(
            "overall_score BETWEEN 0 AND 100", name="ck_sessions_overall_score"
        ),
    )

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    user_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    config_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("interview_configs.id", ondelete="SET NULL"),
        nullable=True,
    )

    status: Mapped[SessionStatus] = mapped_column(
        Enum(SessionStatus, name="session_status", create_type=False),
        nullable=False,
        server_default=text("'pending'"),
    )

    # Denormalized snapshot of the config at session-start time.
    company: Mapped[str] = mapped_column(Text, nullable=False)
    job_title: Mapped[str] = mapped_column(Text, nullable=False)

    # Gemini's per-session company-research output (architecture step 1).
    # Distinct from interview_configs.company_context (user-supplied).
    company_summary: Mapped[str | None] = mapped_column(Text, nullable=True)

    overall_score: Mapped[Decimal | None] = mapped_column(
        Numeric(4, 2), nullable=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    started_at: Mapped[datetime | None] = mapped_column(nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), nullable=False
    )
