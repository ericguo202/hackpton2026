"""
`saved_questions` — a frozen opening-question scenario the candidate chose to
re-practice over time.

A saved question is NOT just a string: it's a snapshot of the whole scenario as
it existed at save time — the question text plus the company / role / field
category / research brief / experience level that produced it. Re-practicing
reads everything off this row and skips the two session-start LLM calls
(company research + question generation) entirely, so the candidate retries the
*same* question and the comparison stays apples-to-apples even if their live
profile (target_role, experience_level) drifts afterward.

The link from a saved question to all of its practice sessions is the
`interview_sessions.saved_question_id` FK (NOT text-matching on `question_text`
— LLM wording drifts and that would retroactively absorb unrelated sessions).
Hard-capped at 5 rows per user, enforced in the save endpoint.
"""

from datetime import datetime
from uuid import UUID

from sqlalchemy import Enum, ForeignKey, Text, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base
from app.db.models.enums import ExperienceLevel


class SavedQuestion(Base):
    __tablename__ = "saved_questions"

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

    # The frozen opening question — copied from the originating session's turn 1.
    question_text: Mapped[str] = mapped_column(Text, nullable=False)

    # Frozen, immutable display/scenario metadata. `job_title` is what the
    # question was generated for; it deliberately does NOT track the user's
    # live `target_role`, so the saved card reads as an intentional snapshot.
    company: Mapped[str] = mapped_column(Text, nullable=False)
    job_title: Mapped[str] = mapped_column(Text, nullable=False)

    # Frozen field classification (a `FieldCategory` value) and the serialized
    # `CompanyBrief` JSON, both copied from the originating session's
    # `company_summary`. Re-practice copies `company_summary` onto the new
    # session so `submit_turn` re-parses the same category / role_signals.
    category: Mapped[str | None] = mapped_column(Text, nullable=True)
    company_summary: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Pulled out of the brief for convenience (also live inside company_summary)
    # — they condition the live follow-up generation during re-practice.
    role_signals: Mapped[list[str]] = mapped_column(
        JSONB, nullable=False, server_default=text("'[]'::jsonb")
    )
    sample_question_themes: Mapped[list[str]] = mapped_column(
        JSONB, nullable=False, server_default=text("'[]'::jsonb")
    )

    # FROZEN experience level. This is the load-bearing freeze: the follow-up
    # and evaluator rubric are tailored on a 15x6 (category x experience_level)
    # matrix, so re-practice must stamp THIS value onto the new session rather
    # than reading the user's (possibly changed) live level.
    experience_level: Mapped[ExperienceLevel | None] = mapped_column(
        Enum(ExperienceLevel, name="experience_level", create_type=False),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), nullable=False
    )
