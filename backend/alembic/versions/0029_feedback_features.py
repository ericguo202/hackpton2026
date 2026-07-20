"""drop question_quality_rating, add feature multi-selects to session_feedback

Revision ID: 0029_feedback_features
Revises: 0028_saved_question_cat
Create Date: 2026-07-20

Phase-2 beta feedback shifts from "was the session good?" toward "which
features are testers actually finding and using?". Drops the question-quality
rating and adds two multi-select answers, each stored as the chosen labels
joined with ", " (e.g. "History page, Adding a resume"). `features_used` is a
required question (NOT NULL); `features_helpful` is optional (nullable).

The `session_feedback` table was cleared before this migration, so the column
drop loses no data and the NOT NULL add needs no backfill.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0029_feedback_features"
down_revision: Union[str, None] = "0028_saved_question_cat"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Postgres drops the column-scoped CHECK
    # (ck_session_feedback_question_quality_rating) along with the column.
    op.drop_column("session_feedback", "question_quality_rating")

    # server_default only to make the NOT NULL add safe if a row survived the
    # manual clear; dropped immediately so the app must supply a value.
    op.add_column(
        "session_feedback",
        sa.Column("features_used", sa.Text(), nullable=False, server_default=""),
    )
    op.alter_column("session_feedback", "features_used", server_default=None)

    op.add_column(
        "session_feedback",
        sa.Column("features_helpful", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("session_feedback", "features_helpful")
    op.drop_column("session_feedback", "features_used")

    op.add_column(
        "session_feedback",
        sa.Column(
            "question_quality_rating",
            sa.Integer(),
            nullable=False,
            server_default="3",
        ),
    )
    op.alter_column("session_feedback", "question_quality_rating", server_default=None)
    op.create_check_constraint(
        "ck_session_feedback_question_quality_rating",
        "session_feedback",
        "question_quality_rating BETWEEN 1 AND 5",
    )
