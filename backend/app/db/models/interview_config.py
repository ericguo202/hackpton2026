"""
`interview_configs` — AI-generated plan created before a session starts.

Decouples "what the AI planned" from "what actually happened". One config can
in principle back multiple session attempts (same JD, retried), though for the
hackathon we create a fresh config per session.
"""

from datetime import datetime
from uuid import UUID

from sqlalchemy import CheckConstraint, Enum, ForeignKey, Text, Integer, text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base
from app.db.models.enums import InterviewType


class InterviewConfig(Base):
    __tablename__ = "interview_configs"
    __table_args__ = (
        CheckConstraint("num_turns BETWEEN 1 AND 10", name="ck_configs_num_turns"),
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

    company: Mapped[str] = mapped_column(Text, nullable=False)
    job_title: Mapped[str] = mapped_column(Text, nullable=False)
    job_description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # User-supplied context about the role/company (distinct from the AI's
    # research summary on interview_sessions.company_summary).
    company_context: Mapped[str | None] = mapped_column(Text, nullable=True)

    interview_type: Mapped[InterviewType] = mapped_column(
        Enum(InterviewType, name="interview_type", create_type=False),
        nullable=False,
        server_default=text("'behavioral'"),
    )

    # CLAUDE.md locks this at 2 for the hackathon, but schema allows 1-10.
    num_turns: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("2")
    )

    # Full AI-generated prompt/plan stored as JSON for flexibility.
    ai_plan: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), nullable=False
    )
