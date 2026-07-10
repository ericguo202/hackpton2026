"""
`interview_sessions` — one row per mock interview attempt.

`company` / `job_title` are a snapshot captured at session-create time from
`SessionCreateIn`, so later profile edits don't mutate historical records.

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
from app.db.models.enums import ExperienceLevel, SessionStatus


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
    status: Mapped[SessionStatus] = mapped_column(
        Enum(SessionStatus, name="session_status", create_type=False),
        nullable=False,
        server_default=text("'pending'"),
    )

    # Snapshot of the start-form inputs at session-create time.
    company: Mapped[str] = mapped_column(Text, nullable=False)
    job_title: Mapped[str] = mapped_column(Text, nullable=False)

    # Gemini's per-session company-research output (architecture step 1).
    company_summary: Mapped[str | None] = mapped_column(Text, nullable=True)

    overall_score: Mapped[Decimal | None] = mapped_column(
        Numeric(4, 2), nullable=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ElevenLabs voice ID resolved at session-create time (either from the
    # candidate's pick on the start form or the deterministic fallback in
    # `voice_pool.voice_for_session`). Persisted so turn 2's TTS reads the
    # same value without re-deriving — a refresh between turns won't
    # rotate the voice. Nullable for legacy rows created before this
    # column existed; the TTS call site falls back to
    # `voice_for_session(session.id)` in that case.
    voice_id: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Per-session speech pace passed to ElevenLabs as `voice_settings.speed`
    # (see `tts.NORMAL_SPEED`/`SLOWER_SPEED`). Picked on the setup form's
    # Advanced panel and persisted here so turn 2's TTS uses the same pace the
    # candidate chose for turn 1. Nullable for legacy rows created before this
    # column existed; the TTS call sites fall back to `tts.DEFAULT_SPEED` via
    # `clamp_speed(None)` in that case.
    speech_speed: Mapped[Decimal | None] = mapped_column(
        Numeric(3, 2), nullable=True
    )

    # Frozen candidate seniority for THIS session. Stamped at create time from
    # the user's live `experience_level` (or from a saved question's frozen
    # level on re-practice). `submit_turn` reads this — NOT the live user row —
    # so the follow-up framing and evaluator rubric (a 15x6 category x level
    # matrix) stay consistent across the session and across re-practices even
    # if the user later changes their profile level. Nullable for legacy rows
    # created before this column existed; the follow-up/evaluator omit the
    # experience appendix in that case (same as a level-less user).
    experience_level: Mapped[ExperienceLevel | None] = mapped_column(
        Enum(ExperienceLevel, name="experience_level", create_type=False),
        nullable=True,
    )

    # Links this session to the saved question it was a practice attempt of.
    # Set at re-practice creation, and also back-filled onto the originating
    # session when the user first saves the question (that session becomes
    # attempt #1, the baseline). Write-once. `ON DELETE SET NULL` so deleting a
    # saved question drops the grouping without erasing interview history.
    saved_question_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("saved_questions.id", ondelete="SET NULL"),
        nullable=True,
    )

    started_at: Mapped[datetime | None] = mapped_column(nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), nullable=False
    )
