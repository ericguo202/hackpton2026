"""add clarification retry flag to sessions

Revision ID: 0024_clarification_retry
Revises: 0023_session_num_turns
Create Date: 2026-07-15
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0024_clarification_retry"
down_revision: Union[str, None] = "0023_session_num_turns"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "interview_sessions",
        sa.Column(
            "clarification_retry_used",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("interview_sessions", "clarification_retry_used")
