"""
`session_metrics` — cached per-session aggregates. Recomputed after all turns
are evaluated. 1:1 with `interview_sessions`.

`overall_score` here is the aggregate 0-100 percent (matches
`interview_sessions.overall_score`), NOT the 0-10 per-turn scale.
"""

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import CheckConstraint, ForeignKey, Integer, Numeric, text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base


class SessionMetrics(Base):
    __tablename__ = "session_metrics"
    __table_args__ = (
        CheckConstraint(
            "overall_score BETWEEN 0 AND 100", name="ck_metrics_overall_score"
        ),
        CheckConstraint(
            "avg_delivery BETWEEN 0 AND 10", name="ck_metrics_avg_delivery"
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
        unique=True,
        nullable=False,
    )

    avg_directness: Mapped[Decimal | None] = mapped_column(Numeric(3, 1), nullable=True)
    avg_star: Mapped[Decimal | None] = mapped_column(Numeric(3, 1), nullable=True)
    avg_specificity: Mapped[Decimal | None] = mapped_column(Numeric(3, 1), nullable=True)
    avg_impact: Mapped[Decimal | None] = mapped_column(Numeric(3, 1), nullable=True)
    avg_conciseness: Mapped[Decimal | None] = mapped_column(Numeric(3, 1), nullable=True)
    # Nullable when no turn in the session had webcam analytics (camera-off
    # for every turn). Added in migration 0003.
    avg_delivery: Mapped[Decimal | None] = mapped_column(Numeric(3, 1), nullable=True)
    total_filler_word_count: Mapped[int | None] = mapped_column(Integer, nullable=True)

    overall_score: Mapped[Decimal | None] = mapped_column(Numeric(4, 2), nullable=True)

    # For partial completions — how many turns were actually scored.
    turns_evaluated: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default=text("0")
    )

    generated_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), nullable=False
    )
