"""add custom_questions table

Adds the "custom interview questions" feature: candidate-authored questions
(up to 10 per user, any tier) that can be picked at session setup to replace
the generated opening question. Each row stores only the question text — the
company / research brief is produced live per session, not frozen — so the
table is intentionally minimal:

  * `custom_questions` — id, user_id (CASCADE), question_text, created_at.

There is deliberately NO FK from `interview_sessions` to this table: a custom
question is just a text source for turn 1 (frozen onto the turn's
`question_text` like any other), and we don't track per-question attempt
history the way `saved_questions` does.

Revision ID: 0019_custom_questions
Revises: 0018_policy_notif
Create Date: 2026-06-23

Note: revision ID is intentionally short — Alembic's `alembic_version` table
caps `version_num` at VARCHAR(32), so anything longer fails the upgrade
bookkeeping write even after the schema changes commit.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0019_custom_questions"
down_revision: Union[str, None] = "0018_policy_notif"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "custom_questions",
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
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("NOW()"),
            nullable=False,
        ),
    )
    op.create_index(
        "idx_custom_questions_user_id", "custom_questions", ["user_id"]
    )


def downgrade() -> None:
    op.drop_index(
        "idx_custom_questions_user_id", table_name="custom_questions"
    )
    op.drop_table("custom_questions")
