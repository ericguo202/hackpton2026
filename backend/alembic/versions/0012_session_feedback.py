"""add required beta session feedback table

Revision ID: 0012_session_feedback
Revises: 0011_word_counts
Create Date: 2026-06-09
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0012_session_feedback"
down_revision: Union[str, None] = "0011_word_counts"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "session_feedback",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "session_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("interview_sessions.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("smoothness_response", sa.Text(), nullable=False),
        sa.Column("desired_features", sa.Text(), nullable=True),
        sa.Column("question_relevance_response", sa.Text(), nullable=False),
        sa.Column("feedback_helpfulness_response", sa.Text(), nullable=False),
        sa.Column("feedback_specificity_response", sa.Text(), nullable=True),
        sa.Column("bug_report", sa.Text(), nullable=True),
        sa.Column("pay_likelihood_response", sa.Text(), nullable=False),
        sa.Column("overall_satisfaction_rating", sa.Integer(), nullable=False),
        sa.Column("ease_of_use_rating", sa.Integer(), nullable=False),
        sa.Column("question_quality_rating", sa.Integer(), nullable=False),
        sa.Column("feedback_actionability_rating", sa.Integer(), nullable=False),
        sa.Column("would_recommend_rating", sa.Integer(), nullable=False),
        sa.Column("willing_to_pay", sa.Boolean(), nullable=False),
        sa.Column("monthly_price", sa.Text(), nullable=True),
        sa.Column("paid_feature_request", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "overall_satisfaction_rating BETWEEN 1 AND 5",
            name="ck_session_feedback_overall_satisfaction_rating",
        ),
        sa.CheckConstraint(
            "ease_of_use_rating BETWEEN 1 AND 5",
            name="ck_session_feedback_ease_of_use_rating",
        ),
        sa.CheckConstraint(
            "question_quality_rating BETWEEN 1 AND 5",
            name="ck_session_feedback_question_quality_rating",
        ),
        sa.CheckConstraint(
            "feedback_actionability_rating BETWEEN 1 AND 5",
            name="ck_session_feedback_feedback_actionability_rating",
        ),
        sa.CheckConstraint(
            "would_recommend_rating BETWEEN 1 AND 5",
            name="ck_session_feedback_would_recommend_rating",
        ),
    )
    op.create_index(
        "idx_session_feedback_user_id",
        "session_feedback",
        ["user_id"],
    )


def downgrade() -> None:
    op.drop_index("idx_session_feedback_user_id", table_name="session_feedback")
    op.drop_table("session_feedback")
