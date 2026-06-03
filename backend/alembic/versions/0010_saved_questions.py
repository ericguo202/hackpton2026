"""add saved_questions table + interview_sessions freeze columns

Adds the "save & re-practice opening questions" feature:

  * `saved_questions` — up to 5 per user; a frozen snapshot of an opening
    question's whole scenario (text + company/role + field category + research
    brief + experience level).
  * `interview_sessions.experience_level` — the seniority frozen onto each
    session at create time. `submit_turn` reads this instead of the live user
    row so the follow-up / evaluator rubric (a 15x6 category x level matrix)
    stays consistent within a session and across re-practices. Also repairs a
    latent bug where changing level mid-session shifted turn 2's rubric.
  * `interview_sessions.saved_question_id` — FK linking a session to the saved
    question it was a practice attempt of. `ON DELETE SET NULL` so deleting a
    saved question never cascades away real interview history.

Both new columns are nullable with no backfill — legacy session rows simply
read as "no frozen level / not linked", which is the correct behavior.

Revision ID: 0010_saved_questions
Revises: 0009_incidents
Create Date: 2026-06-02

Note: revision ID is intentionally short — Alembic's `alembic_version` table
caps `version_num` at VARCHAR(32), so anything longer fails the bookkeeping
write even after the schema changes commit.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0010_saved_questions"
down_revision: Union[str, None] = "0009_incidents"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Reference the existing `experience_level` PG enum without re-creating it
# (it was created in 0001_init for users.experience_level).
_EXPERIENCE_LEVEL = postgresql.ENUM(
    "internship",
    "entry",
    "mid",
    "senior",
    "staff",
    "executive",
    name="experience_level",
    create_type=False,
)


def upgrade() -> None:
    # 1. The FK target must exist before the column that references it.
    op.create_table(
        "saved_questions",
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
        sa.Column("question_text", sa.Text(), nullable=False),
        sa.Column("company", sa.Text(), nullable=False),
        sa.Column("job_title", sa.Text(), nullable=False),
        sa.Column("category", sa.Text(), nullable=True),
        sa.Column("company_summary", sa.Text(), nullable=True),
        sa.Column(
            "role_signals",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "sample_question_themes",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("experience_level", _EXPERIENCE_LEVEL, nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
    )
    op.create_index(
        "idx_saved_questions_user_id", "saved_questions", ["user_id"]
    )

    # 2. Frozen seniority on each session.
    op.add_column(
        "interview_sessions",
        sa.Column("experience_level", _EXPERIENCE_LEVEL, nullable=True),
    )

    # 3. Link session -> saved question. ON DELETE SET NULL keeps the session.
    op.add_column(
        "interview_sessions",
        sa.Column(
            "saved_question_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
    )
    op.create_foreign_key(
        "fk_sessions_saved_question_id",
        "interview_sessions",
        "saved_questions",
        ["saved_question_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "idx_sessions_saved_question_id",
        "interview_sessions",
        ["saved_question_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "idx_sessions_saved_question_id", table_name="interview_sessions"
    )
    op.drop_constraint(
        "fk_sessions_saved_question_id",
        "interview_sessions",
        type_="foreignkey",
    )
    op.drop_column("interview_sessions", "saved_question_id")
    op.drop_column("interview_sessions", "experience_level")
    op.drop_index("idx_saved_questions_user_id", table_name="saved_questions")
    op.drop_table("saved_questions")
