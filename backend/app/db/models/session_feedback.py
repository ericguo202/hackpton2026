"""Required beta feedback collected after completed interview sessions."""

from datetime import datetime
from uuid import UUID

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Integer, Text, text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.db.base import Base


class SessionFeedback(Base):
    __tablename__ = "session_feedback"
    __table_args__ = (
        CheckConstraint(
            "smoothness_rating BETWEEN 1 AND 5",
            name="ck_session_feedback_smoothness_rating",
        ),
        CheckConstraint(
            "question_relevance_rating BETWEEN 1 AND 5",
            name="ck_session_feedback_question_relevance_rating",
        ),
        CheckConstraint(
            "feedback_helpfulness_rating BETWEEN 1 AND 5",
            name="ck_session_feedback_feedback_helpfulness_rating",
        ),
        CheckConstraint(
            "pay_likelihood_rating BETWEEN 1 AND 5",
            name="ck_session_feedback_pay_likelihood_rating",
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
    session_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("interview_sessions.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )

    smoothness_rating: Mapped[int] = mapped_column(Integer, nullable=False)
    desired_features: Mapped[str | None] = mapped_column(Text, nullable=True)
    question_relevance_rating: Mapped[int] = mapped_column(Integer, nullable=False)
    feedback_helpfulness_rating: Mapped[int] = mapped_column(Integer, nullable=False)
    feedback_specificity: Mapped[str | None] = mapped_column(Text, nullable=True)
    bug_report: Mapped[str | None] = mapped_column(Text, nullable=True)
    pay_likelihood_rating: Mapped[int] = mapped_column(Integer, nullable=False)
    willing_to_pay: Mapped[bool] = mapped_column(Boolean, nullable=False)
    monthly_price: Mapped[str | None] = mapped_column(Text, nullable=True)
    paid_feature_request: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), nullable=False
    )
