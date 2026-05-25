"""add structured turn feedback

Revision ID: 0006_structured_feedback
Revises: 0005_rubric_rename
Create Date: 2026-05-24
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0006_structured_feedback"
down_revision: Union[str, None] = "0005_rubric_rename"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "interview_turns",
        sa.Column("feedback_detail", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("interview_turns", "feedback_detail")
