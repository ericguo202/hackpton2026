"""rename per-dimension score columns to generic dimension_1..5

The four-type question taxonomy (see CLAUDE.md) scores each question type on a
DIFFERENT set of five content dimensions:
  - Experience (STAR): structure, problem_solving, impact, initiative, depth
  - Motivation & Fit:  structure, relevance, company_insight, career_narrative,
                       conviction

Rather than add per-type columns, the five content score slots on
`interview_turns` (and their `session_metrics` averages) are made GENERIC —
`dimension_1..5` — and the human-readable label for each position is resolved by
the turn's `question_category` (in the backend `_score_dimensions` module and the
frontend `SCORE_DIMENSIONS_BY_CATEGORY` mirror). `delivery` is shared across all
types and keeps its name.

Position convention (canonical display order; position 1 is Structure for every
type): dimension_1..5. For STAR that is structure/problem_solving/impact/
initiative/depth — so the columns are RENAMED IN PLACE (data preserved), unlike
migration 0005 which dropped because the rubric meaning changed. STAR scores are
byte-identical after this migration; only the column names change.

Revision ID: 0026_generic_dimensions
Revises: 0025_turn_question_category
Create Date: 2026-07-17
"""

from typing import Sequence, Union

from alembic import op


revision: str = "0026_generic_dimensions"
down_revision: Union[str, None] = "0025_turn_question_category"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# (old_column, new_column, old_ck_name, new_ck_name). ck names only apply to
# interview_turns (session_metrics avg_* carry no per-column check constraints).
_TURN_RENAMES = [
    ("structure_score",       "dimension_1_score", "ck_turns_structure",       "ck_turns_dimension_1"),
    ("problem_solving_score", "dimension_2_score", "ck_turns_problem_solving", "ck_turns_dimension_2"),
    ("impact_score",          "dimension_3_score", "ck_turns_impact",          "ck_turns_dimension_3"),
    ("initiative_score",      "dimension_4_score", "ck_turns_initiative",      "ck_turns_dimension_4"),
    ("depth_score",           "dimension_5_score", "ck_turns_depth",           "ck_turns_dimension_5"),
]

_METRIC_RENAMES = [
    ("avg_structure",       "avg_dimension_1"),
    ("avg_problem_solving", "avg_dimension_2"),
    ("avg_impact",          "avg_dimension_3"),
    ("avg_initiative",      "avg_dimension_4"),
    ("avg_depth",           "avg_dimension_5"),
]


def upgrade() -> None:
    # interview_turns: rename column then its check constraint. Postgres auto-
    # rewrites the constraint's column reference on the column rename, so only
    # the constraint NAME needs an explicit rename to stay in sync with the ORM.
    for old_col, new_col, old_ck, new_ck in _TURN_RENAMES:
        op.alter_column("interview_turns", old_col, new_column_name=new_col)
        op.execute(
            f"ALTER TABLE interview_turns RENAME CONSTRAINT {old_ck} TO {new_ck}"
        )

    for old_col, new_col in _METRIC_RENAMES:
        op.alter_column("session_metrics", old_col, new_column_name=new_col)


def downgrade() -> None:
    for old_col, new_col, old_ck, new_ck in _TURN_RENAMES:
        op.execute(
            f"ALTER TABLE interview_turns RENAME CONSTRAINT {new_ck} TO {old_ck}"
        )
        op.alter_column("interview_turns", new_col, new_column_name=old_col)

    for old_col, new_col in _METRIC_RENAMES:
        op.alter_column("session_metrics", new_col, new_column_name=old_col)
