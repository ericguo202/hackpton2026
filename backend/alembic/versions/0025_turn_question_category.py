"""add question_category to interview_turns

Revision ID: 0025_turn_question_category
Revises: 0024_clarification_retry
Create Date: 2026-07-17

Labels each turn with its question FORM (the new orthogonal axis). Today every
turn is 'experience_star' (classic STAR behavioral); the other three types are
documented but unbuilt, so the column defaults to 'experience_star' and every
existing/new row lands there. Mirrors the `experience_level` enum pattern in
0001_init (CREATE TYPE + create_type=False on the column).
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0025_turn_question_category"
down_revision: Union[str, None] = "0024_clarification_retry"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "CREATE TYPE question_category AS ENUM "
        "('experience_star', 'self_assessment_growth', 'motivation_fit', "
        "'situational')"
    )
    op.add_column(
        "interview_turns",
        sa.Column(
            "question_category",
            postgresql.ENUM(
                "experience_star",
                "self_assessment_growth",
                "motivation_fit",
                "situational",
                name="question_category",
                create_type=False,
            ),
            nullable=False,
            server_default=sa.text("'experience_star'"),
        ),
    )


def downgrade() -> None:
    op.drop_column("interview_turns", "question_category")
    op.execute("DROP TYPE IF EXISTS question_category")
