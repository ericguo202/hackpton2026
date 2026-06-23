"""
`custom_questions` — interview questions the candidate authored themselves.

Unlike `saved_questions` (a frozen snapshot of a whole generated scenario), a
custom question stores ONLY the question text. The company / research brief /
field category are NOT frozen here: when the candidate picks a custom question
for a session, `create_session` still runs company research against the company
they type at setup time, and simply skips the opening-question LLM call —
the custom text becomes turn 1 verbatim. So the same custom question can be
practiced against different companies, each producing its own live brief.

Every question is screened at creation time (moderation -> injection regex ->
an LLM validity/relevance check); only clean ones are inserted, so rows here are
already vetted and need no re-check when used.

Hard-capped at 10 rows per user (any tier), enforced in the create endpoint;
deleting a row frees a slot.
"""

from datetime import datetime
from uuid import UUID

from sqlalchemy import ForeignKey, Text, text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base


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

    created_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), nullable=False
    )
