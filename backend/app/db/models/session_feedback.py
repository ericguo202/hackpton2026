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
            "overall_satisfaction_rating BETWEEN 1 AND 5",
            name="ck_session_feedback_overall_satisfaction_rating",
        ),
        CheckConstraint(
            "ease_of_use_rating BETWEEN 1 AND 5",
            name="ck_session_feedback_ease_of_use_rating",
        ),
        CheckConstraint(
            "question_quality_rating BETWEEN 1 AND 5",
            name="ck_session_feedback_question_quality_rating",
        ),
        CheckConstraint(
            "feedback_actionability_rating BETWEEN 1 AND 5",
            name="ck_session_feedback_feedback_actionability_rating",
        ),
        CheckConstraint(
            "would_recommend_rating BETWEEN 1 AND 5",
            name="ck_session_feedback_would_recommend_rating",
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

    smoothness_response: Mapped[str] = mapped_column(Text, nullable=False)
    desired_features: Mapped[str | None] = mapped_column(Text, nullable=True)
    question_relevance_response: Mapped[str] = mapped_column(Text, nullable=False)
    feedback_helpfulness_response: Mapped[str] = mapped_column(Text, nullable=False)
    feedback_specificity_response: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )
    bug_report: Mapped[str | None] = mapped_column(Text, nullable=True)
    pay_likelihood_response: Mapped[str] = mapped_column(Text, nullable=False)
    overall_satisfaction_rating: Mapped[int] = mapped_column(Integer, nullable=False)
    ease_of_use_rating: Mapped[int] = mapped_column(Integer, nullable=False)
    question_quality_rating: Mapped[int] = mapped_column(Integer, nullable=False)
    feedback_actionability_rating: Mapped[int] = mapped_column(
        Integer, nullable=False
    )
    would_recommend_rating: Mapped[int] = mapped_column(Integer, nullable=False)
    willing_to_pay: Mapped[bool] = mapped_column(Boolean, nullable=False)
    monthly_price: Mapped[str | None] = mapped_column(Text, nullable=True)
    paid_feature_request: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        server_default=func.now(), nullable=False
    )
