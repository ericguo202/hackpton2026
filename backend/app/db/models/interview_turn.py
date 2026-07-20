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
    Enum,
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
from app.db.models.enums import QuestionCategory


class InterviewTurn(Base):
    __tablename__ = "interview_turns"
    __table_args__ = (
        UniqueConstraint("session_id", "turn_number", name="uq_turns_session_turn"),
        CheckConstraint("turn_number >= 1", name="ck_turns_turn_number"),
        # Mirror the live schema after migration 0026 renamed the five content
        # score columns to generic `dimension_1..5_score` (their human label is
        # resolved per `question_category`; see `_score_dimensions`). Names/
        # expressions must match the constraints in alembic 0026 + 0002 (delivery).
        CheckConstraint(
            "dimension_1_score BETWEEN 0 AND 10", name="ck_turns_dimension_1"
        ),
        CheckConstraint(
            "dimension_2_score BETWEEN 0 AND 10", name="ck_turns_dimension_2"
        ),
        CheckConstraint(
            "dimension_3_score BETWEEN 0 AND 10", name="ck_turns_dimension_3"
        ),
        CheckConstraint(
            "dimension_4_score BETWEEN 0 AND 10", name="ck_turns_dimension_4"
        ),
        CheckConstraint(
            "dimension_5_score BETWEEN 0 AND 10", name="ck_turns_dimension_5"
        ),
        CheckConstraint(
            "delivery_score BETWEEN 0 AND 10", name="ck_turns_delivery"
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
    # The question FORM (STAR / self-assessment / motivation-fit / situational).
    # New orthogonal axis; today every turn is `experience_star`. Frozen per turn
    # so the review UI can badge each question by type. See `QuestionCategory`.
    question_category: Mapped[QuestionCategory] = mapped_column(
        Enum(QuestionCategory, name="question_category", create_type=False),
        nullable=False,
        server_default=text("'experience_star'"),
    )

    # Per-turn content scores (0-10, nullable until evaluated). GENERIC: the
    # five slots hold whatever five content dimensions the turn's
    # `question_category` defines — STAR = structure/problem_solving/impact/
    # initiative/depth; Motivation & Fit = structure/relevance/company_insight/
    # career_narrative/conviction. The human label per position is resolved from
    # `question_category` (backend `_score_dimensions.CONTENT_DIMENSION_LABELS`,
    # frontend `SCORE_DIMENSIONS_BY_CATEGORY`). Position 1 is Structure for every
    # type. The evaluator additionally selects field/level-tailored guidance.
    dimension_1_score: Mapped[Decimal | None] = mapped_column(Numeric(3, 1), nullable=True)
    dimension_2_score: Mapped[Decimal | None] = mapped_column(Numeric(3, 1), nullable=True)
    dimension_3_score: Mapped[Decimal | None] = mapped_column(Numeric(3, 1), nullable=True)
    dimension_4_score: Mapped[Decimal | None] = mapped_column(Numeric(3, 1), nullable=True)
    dimension_5_score: Mapped[Decimal | None] = mapped_column(Numeric(3, 1), nullable=True)
    # 6th rubric dimension: delivery / on-camera presence, derived by the
    # evaluator LLM from the browser-computed `cv_summary` below. Null when
    # the candidate declined camera access (evaluator omits the field too).
    delivery_score: Mapped[Decimal | None] = mapped_column(Numeric(3, 1), nullable=True)
    # Raw webcam-analytics summary the browser posts with each turn.
    # Same shape as `backend/interview_feedback_latest.json` (frames_processed,
    # face_visible_pct, eye_contact_score, expression_score, posture_score,
    # tilt/posture coverage, overall_interview_score, band labels,
    # best-frame peaks, coaching_tip, notes[]). Kept as JSONB for later analytics.
    cv_summary: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    filler_word_count: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("0")
    )
    # Per-word breakdown from Gemini, e.g. {"um": 3, "like": 1, "you know": 0}.
    filler_word_breakdown: Mapped[dict] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    # Total word count of `transcript_text` (whitespace tokenization) — the
    # denominator for filler-word rate. Sibling of `filler_word_count`;
    # written in `submit_turn`. Backfilled from transcript in migration 0011.
    word_count: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("0")
    )

    feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Structured coach feedback used by the current UI. The legacy `feedback`
    # string remains populated as a fallback for older clients and rows.
    feedback_detail: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # e.g. "gemini-2.5-flash" — useful for debugging / model comparison.
    ai_model_used: Mapped[str | None] = mapped_column(Text, nullable=True)

    evaluated_at: Mapped[datetime | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), nullable=False
    )
