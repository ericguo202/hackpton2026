"""rename rubric columns for industry-tailored evaluator

The behavioral-interview rubric was reworked to be field-tailored. The
previous five LLM-scored dimensions on `interview_turns` and their
`session_metrics` averages — `directness`, `star`, `specificity`,
`impact`, `conciseness` — are replaced by `structure`, `problem_solving`,
`impact`, `initiative`, `depth`. `impact` keeps its name but its rubric
meaning changes (now industry-specific guidance), and `delivery` is
unchanged.

Because the new and old rubric items measure different things, the old
columns are dropped outright rather than renamed in place; pre-migration
score data does not carry forward and is permanently lost. The underlying
questions, transcripts, filler counts, and `interview_sessions.overall_score`
rows survive — only the per-dimension breakdowns are dropped.

Revision ID: 0005_rubric_rename
Revises: 0004_session_voice_id
Create Date: 2026-05-22
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0005_rubric_rename"
down_revision: Union[str, None] = "0004_session_voice_id"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- interview_turns: drop old check constraints + columns ---
    # `ck_turns_impact` stays — `impact_score` survives the rename.
    op.drop_constraint("ck_turns_directness", "interview_turns", type_="check")
    op.drop_constraint("ck_turns_star", "interview_turns", type_="check")
    op.drop_constraint("ck_turns_specificity", "interview_turns", type_="check")
    op.drop_constraint("ck_turns_conciseness", "interview_turns", type_="check")

    op.drop_column("interview_turns", "directness_score")
    op.drop_column("interview_turns", "star_score")
    op.drop_column("interview_turns", "specificity_score")
    op.drop_column("interview_turns", "conciseness_score")

    # --- interview_turns: add new columns + check constraints ---
    op.add_column(
        "interview_turns",
        sa.Column("structure_score", sa.Numeric(3, 1), nullable=True),
    )
    op.add_column(
        "interview_turns",
        sa.Column("problem_solving_score", sa.Numeric(3, 1), nullable=True),
    )
    op.add_column(
        "interview_turns",
        sa.Column("initiative_score", sa.Numeric(3, 1), nullable=True),
    )
    op.add_column(
        "interview_turns",
        sa.Column("depth_score", sa.Numeric(3, 1), nullable=True),
    )
    op.create_check_constraint(
        "ck_turns_structure",
        "interview_turns",
        "structure_score BETWEEN 0 AND 10",
    )
    op.create_check_constraint(
        "ck_turns_problem_solving",
        "interview_turns",
        "problem_solving_score BETWEEN 0 AND 10",
    )
    op.create_check_constraint(
        "ck_turns_initiative",
        "interview_turns",
        "initiative_score BETWEEN 0 AND 10",
    )
    op.create_check_constraint(
        "ck_turns_depth",
        "interview_turns",
        "depth_score BETWEEN 0 AND 10",
    )

    # --- session_metrics: drop old averages ---
    op.drop_column("session_metrics", "avg_directness")
    op.drop_column("session_metrics", "avg_star")
    op.drop_column("session_metrics", "avg_specificity")
    op.drop_column("session_metrics", "avg_conciseness")

    # --- session_metrics: add new averages ---
    op.add_column(
        "session_metrics",
        sa.Column("avg_structure", sa.Numeric(3, 1), nullable=True),
    )
    op.add_column(
        "session_metrics",
        sa.Column("avg_problem_solving", sa.Numeric(3, 1), nullable=True),
    )
    op.add_column(
        "session_metrics",
        sa.Column("avg_initiative", sa.Numeric(3, 1), nullable=True),
    )
    op.add_column(
        "session_metrics",
        sa.Column("avg_depth", sa.Numeric(3, 1), nullable=True),
    )


def downgrade() -> None:
    # --- session_metrics: drop new, restore old ---
    op.drop_column("session_metrics", "avg_structure")
    op.drop_column("session_metrics", "avg_problem_solving")
    op.drop_column("session_metrics", "avg_initiative")
    op.drop_column("session_metrics", "avg_depth")
    op.add_column(
        "session_metrics",
        sa.Column("avg_directness", sa.Numeric(3, 1), nullable=True),
    )
    op.add_column(
        "session_metrics",
        sa.Column("avg_star", sa.Numeric(3, 1), nullable=True),
    )
    op.add_column(
        "session_metrics",
        sa.Column("avg_specificity", sa.Numeric(3, 1), nullable=True),
    )
    op.add_column(
        "session_metrics",
        sa.Column("avg_conciseness", sa.Numeric(3, 1), nullable=True),
    )

    # --- interview_turns: drop new constraints + columns, restore old ---
    op.drop_constraint("ck_turns_structure", "interview_turns", type_="check")
    op.drop_constraint("ck_turns_problem_solving", "interview_turns", type_="check")
    op.drop_constraint("ck_turns_initiative", "interview_turns", type_="check")
    op.drop_constraint("ck_turns_depth", "interview_turns", type_="check")

    op.drop_column("interview_turns", "structure_score")
    op.drop_column("interview_turns", "problem_solving_score")
    op.drop_column("interview_turns", "initiative_score")
    op.drop_column("interview_turns", "depth_score")

    op.add_column(
        "interview_turns",
        sa.Column("directness_score", sa.Numeric(3, 1), nullable=True),
    )
    op.add_column(
        "interview_turns",
        sa.Column("star_score", sa.Numeric(3, 1), nullable=True),
    )
    op.add_column(
        "interview_turns",
        sa.Column("specificity_score", sa.Numeric(3, 1), nullable=True),
    )
    op.add_column(
        "interview_turns",
        sa.Column("conciseness_score", sa.Numeric(3, 1), nullable=True),
    )
    op.create_check_constraint(
        "ck_turns_directness",
        "interview_turns",
        "directness_score BETWEEN 0 AND 10",
    )
    op.create_check_constraint(
        "ck_turns_star",
        "interview_turns",
        "star_score BETWEEN 0 AND 10",
    )
    op.create_check_constraint(
        "ck_turns_specificity",
        "interview_turns",
        "specificity_score BETWEEN 0 AND 10",
    )
    op.create_check_constraint(
        "ck_turns_conciseness",
        "interview_turns",
        "conciseness_score BETWEEN 0 AND 10",
    )
