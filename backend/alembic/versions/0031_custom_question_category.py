"""add question_category to custom_questions

Revision ID: 0031_custom_question_cat
Revises: 0030_turn_duration
Create Date: 2026-08-03

Custom questions predate the four-type question taxonomy, so every
candidate-authored question was forced to `experience_star` at session create —
wrong rubric, wrong follow-up prompts, and the STAR-only score calibration
applied to answers that legitimately have no metrics / "I"-ownership.

The create-time screening call now classifies each question, so stamp the FORM
on the row. Reuses the existing `question_category` PG enum (created in 0025),
so no CREATE TYPE — the column just references it with create_type=False,
mirroring 0028 for `saved_questions`. Rows that existed before classification
default to 'experience_star' (delete + re-add to reclassify).
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0031_custom_question_cat"
down_revision: Union[str, None] = "0030_turn_duration"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "custom_questions",
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
    op.drop_column("custom_questions", "question_category")
