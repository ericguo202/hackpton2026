"""add delivery_score + cv_summary to interview_turns

Adds the 6th rubric column (delivery, 0-10) and the raw webcam-analytics
JSONB sidecar the browser ships with each turn submission. Both nullable:
candidates who decline camera access keep the existing 5-score path.

Revision ID: 0002_delivery_cv_summary
Revises: 0001_init
Create Date: 2026-04-18
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0002_delivery_cv_summary"
down_revision: Union[str, None] = "0001_init"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "interview_turns",
        sa.Column("delivery_score", sa.Numeric(3, 1), nullable=True),
    )
    op.add_column(
        "interview_turns",
        sa.Column(
            "cv_summary",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
    )
    op.create_check_constraint(
        "ck_turns_delivery",
        "interview_turns",
        "delivery_score BETWEEN 0 AND 10",
    )


def downgrade() -> None:
    op.drop_constraint("ck_turns_delivery", "interview_turns", type_="check")
    op.drop_column("interview_turns", "cv_summary")
    op.drop_column("interview_turns", "delivery_score")
