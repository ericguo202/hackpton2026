"""add rate_limits table for per-user API throttling

Backs `app/services/rate_limit.py`. One row per (user_id, bucket) holds a
fixed-window counter shared across the two blue/green API replicas, so an
authenticated caller can't script the LLM-spend endpoints (autocomplete,
onboarding) in a loop and run up unbounded third-party cost. Composite PK on
(user_id, bucket) is what the service's INSERT ... ON CONFLICT upserts against.

Revision ID: 0016_rate_limits
Revises: 0015_drop_interview_configs
Create Date: 2026-06-15
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0016_rate_limits"
down_revision: Union[str, None] = "0015_drop_interview_configs"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "rate_limits",
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("bucket", sa.Text(), primary_key=True),
        sa.Column("window_start", sa.BigInteger(), nullable=False),
        sa.Column("count", sa.Integer(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("rate_limits")
