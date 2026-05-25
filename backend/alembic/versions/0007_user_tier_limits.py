"""add user tier + daily session limits + timezone

Adds per-user subscription tier (free/pro), a daily session counter, the
calendar date the counter was last reset on, and an IANA timezone string
used to compute the user's "today" on the server. Together these gate
free-tier users to 5 completed interview sessions per local calendar day
without touching API-credit-spending services until after the gate clears.

`count_reset_date` and `timezone` are nullable: an existing user with no
sessions yet doesn't have either value populated, and the gate falls back
to UTC when timezone is unknown. `daily_session_count` and `tier` use
server defaults so the in-place ADD COLUMN backfills cleanly.

Revision ID: 0007_user_tier_limits
Revises: 0006_structured_feedback
Create Date: 2026-05-24

Note: revision ID is intentionally short — Alembic's `alembic_version`
table caps `version_num` at VARCHAR(32) by default, so anything longer
than 32 chars fails the upgrade bookkeeping write even though the
schema changes already committed.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0007_user_tier_limits"
down_revision: Union[str, None] = "0006_structured_feedback"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE TYPE user_tier AS ENUM ('free', 'pro')")
    op.add_column(
        "users",
        sa.Column(
            "tier",
            postgresql.ENUM("free", "pro", name="user_tier", create_type=False),
            nullable=False,
            server_default=sa.text("'free'"),
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "daily_session_count",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )
    op.add_column(
        "users",
        sa.Column("count_reset_date", sa.Date(), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("timezone", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "timezone")
    op.drop_column("users", "count_reset_date")
    op.drop_column("users", "daily_session_count")
    op.drop_column("users", "tier")
    op.execute("DROP TYPE IF EXISTS user_tier")
