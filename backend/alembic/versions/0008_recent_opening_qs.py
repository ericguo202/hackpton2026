"""add users.recent_opening_questions avoid-list

Adds a JSONB column holding the candidate's 3 most recent opening questions
(newest-first). The opening-question generator injects these as an explicit
avoid-list so `google/gemini-2.5-flash` stops converging on the same attractor
question across sessions. Global scope (across all companies); reset to [] when
the candidate's target_role / industry / experience_level change.

The server default `'[]'::jsonb` backfills every existing row to an empty list
so the in-place ADD COLUMN is clean and NOT NULL holds for legacy rows.

Revision ID: 0008_recent_opening_qs
Revises: 0007_user_tier_limits
Create Date: 2026-05-31

Note: revision ID is intentionally short — Alembic's `alembic_version` table
caps `version_num` at VARCHAR(32) by default, so anything longer than 32 chars
fails the upgrade bookkeeping write even though the schema changes already
committed.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0008_recent_opening_qs"
down_revision: Union[str, None] = "0007_user_tier_limits"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "recent_opening_questions",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "recent_opening_questions")
