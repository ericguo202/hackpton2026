"""
`interview_turns` — one row per question/answer exchange within a session.

Score columns are 0-10 `NUMERIC(3,1)` and NULL until the turn is evaluated.
`filler_word_count` is the regex-derived ground truth (per CLAUDE.md);
`filler_word_breakdown` is the per-word JSONB map returned by Gemini
(e.g. `{"um": 3, "like": 1}`) — supplemental / analytics only.
"""

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Integer,
    Numeric,
    Text,
    Boolean,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base


class InterviewTurn(Base):
    __tablename__ = "interview_turns"
    __table_args__ = (
        UniqueConstraint("session_id", "turn_number", name="uq_turns_session_turn"),
        CheckConstraint("turn_number >= 1", name="ck_turns_turn_number"),
        CheckConstraint(
            "directness_score BETWEEN 0 AND 10", name="ck_turns_directness"
        ),
        CheckConstraint("star_score BETWEEN 0 AND 10", name="ck_turns_star"),
        CheckConstraint(
            "specificity_score BETWEEN 0 AND 10", name="ck_turns_specificity"
        ),
        CheckConstraint("impact_score BETWEEN 0 AND 10", name="ck_turns_impact"),
        CheckConstraint(
            "conciseness_score BETWEEN 0 AND 10", name="ck_turns_conciseness"
        ),
    )

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    session_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("interview_sessions.id", ondelete="CASCADE"),
        nullable=False,
    )
    turn_number: Mapped[int] = mapped_column(Integer, nullable=False)

    # Content.
    question_text: Mapped[str] = mapped_column(Text, nullable=False)
    transcript_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_followup: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("FALSE")
    )
    parent_turn_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("interview_turns.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Per-turn scores (0-10, nullable until evaluated).
    directness_score: Mapped[Decimal | None] = mapped_column(Numeric(3, 1), nullable=True)
    star_score: Mapped[Decimal | None] = mapped_column(Numeric(3, 1), nullable=True)
    specificity_score: Mapped[Decimal | None] = mapped_column(Numeric(3, 1), nullable=True)
    impact_score: Mapped[Decimal | None] = mapped_column(Numeric(3, 1), nullable=True)
    conciseness_score: Mapped[Decimal | None] = mapped_column(Numeric(3, 1), nullable=True)

    filler_word_count: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("0")
    )
    # Per-word breakdown from Gemini, e.g. {"um": 3, "like": 1, "you know": 0}.
    filler_word_breakdown: Mapped[dict] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )

    feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    # e.g. "gemini-2.5-flash" — useful for debugging / model comparison.
    ai_model_used: Mapped[str | None] = mapped_column(Text, nullable=True)

    evaluated_at: Mapped[datetime | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), nullable=False
    )
