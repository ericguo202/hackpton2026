"""add question_category to saved_questions

Revision ID: 0028_saved_question_cat
Revises: 0027_session_calibrated_mix
Create Date: 2026-07-19

Stamps each saved opening with its question FORM (a `QuestionCategory` value)
so the History saved-questions section can honor the question-category filter.
Reuses the existing `question_category` PG enum (created in 0025), so no
CREATE TYPE — the column just references it with create_type=False, mirroring
how `experience_level` is added to this table. Existing rows default to
'experience_star' (saved before the four-type expansion, all STAR).
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0028_saved_question_cat"
down_revision: Union[str, None] = "0027_session_calibrated_mix"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "saved_questions",
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
    op.drop_column("saved_questions", "question_category")
