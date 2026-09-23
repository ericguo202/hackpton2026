"""
`custom_questions` — interview questions the candidate authored themselves.

Unlike `saved_questions` (a frozen snapshot of a whole generated scenario), a
custom question stores the question text plus its classified question CATEGORY.
The company / research brief / field category are NOT frozen here: when the
candidate picks a custom question for a session, `create_session` still runs
company research against the company they type at setup time, and simply skips
the opening-question LLM call — the custom text becomes turn 1 verbatim. So the
same custom question can be practiced against different companies, each
producing its own live brief.

Every question is screened at creation time (injection regex -> moderation ->
an LLM validity/relevance check); only clean ones are inserted, so rows here are
already vetted and need no re-check when used. That same LLM call also returns
the question's `QuestionCategory`, which is what lets a custom question be
graded by the right rubric instead of always falling back to STAR.

Hard-capped at 10 rows per user (any tier), enforced in the create endpoint;
deleting a row frees a slot.
"""

from datetime import datetime
from uuid import UUID

from sqlalchemy import Enum, ForeignKey, Text, text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base
from app.db.models.enums import QuestionCategory


class CustomQuestion(Base):
    __tablename__ = "custom_questions"

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

    # The candidate-authored question. Already moderated / injection-checked /
    # validated at insert time, so it is safe to TTS and use as a turn verbatim.
    question_text: Mapped[str] = mapped_column(Text, nullable=False)

    # The question FORM, classified by the screening LLM at insert time. Drives
    # the research variant, the turn-1 stamp, the evaluator rubric, and the
    # follow-up prompt pool when this question is practiced. Reuses the shared
    # PG enum (create_type=False). Rows created before classification existed
    # default to 'experience_star' (migration 0030).
    question_category: Mapped[QuestionCategory] = mapped_column(
        Enum(QuestionCategory, name="question_category", create_type=False),
        nullable=False,
        server_default=text("'experience_star'"),
    )

    created_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), nullable=False
    )
