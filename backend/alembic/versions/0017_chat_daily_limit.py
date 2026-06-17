"""add daily Ask Tutor chat-completion limit counter

Adds the per-user daily counter for Ask Tutor chat completions, the Ask Tutor
analogue of `daily_session_count` / `count_reset_date`. Free-tier users get 10
successful chat completions per local calendar day; the counter increments only
on a SUCCESSFUL LLM response (not on every sent message) and resets lazily the
first time the user is seen on a new local day. Both reuse the same
`_today_in_tz(user.timezone)` reset logic as the session limit.

`daily_chat_count` uses a server default so the in-place ADD COLUMN backfills
existing rows to 0; `chat_count_reset_date` is nullable (NULL until the user's
first chat).

Revision ID: 0017_chat_daily_limit
Revises: 0016_rate_limits
Create Date: 2026-06-17

Note: revision ID is intentionally short — Alembic's `alembic_version` table
caps `version_num` at VARCHAR(32), so anything longer fails the upgrade
bookkeeping write even after the schema changes commit.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0017_chat_daily_limit"
down_revision: Union[str, None] = "0016_rate_limits"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "daily_chat_count",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )
    op.add_column(
        "users",
        sa.Column("chat_count_reset_date", sa.Date(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "chat_count_reset_date")
    op.drop_column("users", "daily_chat_count")
